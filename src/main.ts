import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	TFolder,
	requestUrl,
  } from "obsidian";
  
  interface FieldMapping {
	omdbField: string;
	noteProperty: string;
	enabled: boolean;
  }
  
  interface IMDBLookupSettings {
	apiKey: string;
	targetFolder: string;
	imdbIdProperty: string;
	fieldMappings: FieldMapping[];
  }
  
  const OMDB_FIELDS = [
	"Title",
	"Year",
	"Rated",
	"Released",
	"Runtime",
	"Genre",
	"Director",
	"Writer",
	"Actors",
	"Plot",
	"Language",
	"Country",
	"Awards",
	"Poster",
	"Metascore",
	"imdbRating",
	"imdbVotes",
	"Type",
	"DVD",
	"BoxOffice",
	"Production",
	"Website",
  ];
  
  const DEFAULT_SETTINGS: IMDBLookupSettings = {
	apiKey: "",
	targetFolder: "Movies",
	imdbIdProperty: "imdbid",
	fieldMappings: [
	  { omdbField: "Title", noteProperty: "title", enabled: true },
	  { omdbField: "Year", noteProperty: "year", enabled: true },
	  { omdbField: "Rated", noteProperty: "rated", enabled: true },
	  { omdbField: "Released", noteProperty: "released", enabled: true },
	  { omdbField: "Runtime", noteProperty: "runtime", enabled: true },
	  { omdbField: "Genre", noteProperty: "genre", enabled: true },
	  { omdbField: "Director", noteProperty: "director", enabled: true },
	  { omdbField: "Writer", noteProperty: "writer", enabled: false },
	  { omdbField: "Actors", noteProperty: "actors", enabled: true },
	  { omdbField: "Plot", noteProperty: "plot", enabled: true },
	  { omdbField: "Language", noteProperty: "language", enabled: false },
	  { omdbField: "Country", noteProperty: "country", enabled: false },
	  { omdbField: "Awards", noteProperty: "awards", enabled: false },
	  { omdbField: "Poster", noteProperty: "poster", enabled: true },
	  { omdbField: "Metascore", noteProperty: "metascore", enabled: false },
	  { omdbField: "imdbRating", noteProperty: "imdbrating", enabled: true },
	  { omdbField: "imdbVotes", noteProperty: "imdbvotes", enabled: false },
	  { omdbField: "Type", noteProperty: "type", enabled: false },
	  { omdbField: "DVD", noteProperty: "dvd", enabled: false },
	  { omdbField: "BoxOffice", noteProperty: "boxoffice", enabled: false },
	  { omdbField: "Production", noteProperty: "production", enabled: false },
	  { omdbField: "Website", noteProperty: "website", enabled: false },
	],
  };
  
  interface OMDBResponse {
	Response: string;
	Error?: string;
	[key: string]: string | undefined | OMDBRating[];
	Ratings?: OMDBRating[];
  }
  
  interface OMDBRating {
	Source: string;
	Value: string;
  }
  
  export default class IMDBLookupPlugin extends Plugin {
	settings: IMDBLookupSettings = DEFAULT_SETTINGS;
  
	async onload() {
	  await this.loadSettings();
  
	  this.addCommand({
		id: "sync-all-movies",
		name: "Sync all movies from OMDB",
		callback: () => this.syncAllMovies(),
	  });
  
	  this.addCommand({
		id: "sync-current-note",
		name: "Sync current note from OMDB",
		callback: () => this.syncCurrentNote(),
	  });
  
	  this.addSettingTab(new IMDBLookupSettingTab(this.app, this));
	}
  
	async loadSettings() {
	  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	  // Merge any new default field mappings that might have been added
	  const existingFields = new Set(
		this.settings.fieldMappings.map((m) => m.omdbField)
	  );
	  for (const defaultMapping of DEFAULT_SETTINGS.fieldMappings) {
		if (!existingFields.has(defaultMapping.omdbField)) {
		  this.settings.fieldMappings.push({ ...defaultMapping });
		}
	  }
	}
  
	async saveSettings() {
	  await this.saveData(this.settings);
	}
  
	async syncCurrentNote() {
	  const activeFile = this.app.workspace.getActiveFile();
	  if (!activeFile) {
		new Notice("No active file");
		return;
	  }
  
	  if (activeFile.extension !== "md") {
		new Notice("Active file is not a markdown file");
		return;
	  }
  
	  await this.syncNote(activeFile);
	}
  
	async syncAllMovies() {
	  if (!this.settings.apiKey) {
		new Notice("Please configure your OMDB API key in settings");
		return;
	  }
  
	  const folder = this.app.vault.getAbstractFileByPath(
		this.settings.targetFolder
	  );
	  if (!folder || !(folder instanceof TFolder)) {
		new Notice(`Folder "${this.settings.targetFolder}" not found`);
		return;
	  }
  
	  const files = this.getMarkdownFilesRecursively(folder);
	  if (files.length === 0) {
		new Notice(`No markdown files found in "${this.settings.targetFolder}"`);
		return;
	  }
  
	  new Notice(`Starting sync for ${files.length} files...`);
  
	  let synced = 0;
	  let skipped = 0;
	  let errors = 0;
  
	  for (const file of files) {
		try {
		  const result = await this.syncNote(file, true);
		  if (result === "synced") synced++;
		  else if (result === "skipped") skipped++;
		  else errors++;
		} catch (e) {
		  console.error(`Error syncing ${file.path}:`, e);
		  errors++;
		}
		// Rate limiting - OMDB free tier has limits
		await this.sleep(250);
	  }
  
	  new Notice(
		`Sync complete: ${synced} synced, ${skipped} skipped, ${errors} errors`
	  );
	}
  
	getMarkdownFilesRecursively(folder: TFolder): TFile[] {
	  const files: TFile[] = [];
	  for (const child of folder.children) {
		if (child instanceof TFile && child.extension === "md") {
		  files.push(child);
		} else if (child instanceof TFolder) {
		  files.push(...this.getMarkdownFilesRecursively(child));
		}
	  }
	  return files;
	}
  
	async syncNote(
	  file: TFile,
	  silent = false
	): Promise<"synced" | "skipped" | "error"> {
	  const cache = this.app.metadataCache.getFileCache(file);
	  const frontmatter = cache?.frontmatter;
  
	  if (!frontmatter) {
		if (!silent) new Notice(`No frontmatter found in ${file.name}`);
		return "skipped";
	  }
  
	  const imdbId = frontmatter[this.settings.imdbIdProperty];
	  if (!imdbId) {
		if (!silent)
		  new Notice(
			`No ${this.settings.imdbIdProperty} property found in ${file.name}`
		  );
		return "skipped";
	  }
  
	  if (!this.settings.apiKey) {
		if (!silent) new Notice("Please configure your OMDB API key in settings");
		return "error";
	  }
  
	  try {
		const data = await this.fetchOMDBData(imdbId);
		if (!data || data.Response === "False") {
		  if (!silent)
			new Notice(`OMDB Error: ${data?.Error || "Unknown error"}`);
		  return "error";
		}
  
		await this.updateNoteFrontmatter(file, data);
		if (!silent) new Notice(`Synced: ${file.name}`);
		return "synced";
	  } catch (e) {
		console.error(`Error fetching OMDB data for ${imdbId}:`, e);
		if (!silent) new Notice(`Error syncing ${file.name}`);
		return "error";
	  }
	}
  
	async fetchOMDBData(imdbId: string): Promise<OMDBResponse | null> {
	  const url = `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${this.settings.apiKey}`;
	  try {
		const response = await requestUrl({ url });
		return response.json as OMDBResponse;
	  } catch (e) {
		console.error("OMDB API request failed:", e);
		return null;
	  }
	}
  
	async updateNoteFrontmatter(file: TFile, data: OMDBResponse) {
	  await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
		for (const mapping of this.settings.fieldMappings) {
		  if (!mapping.enabled) continue;

		  const value = data[mapping.omdbField];
		  if (value !== undefined && value !== "N/A") {
			frontmatter[mapping.noteProperty] = this.transformValue(mapping.omdbField, value);
		  }
		}
	  });
	}

	/**
	 * Transform OMDB field values for Obsidian frontmatter
	 * - Actors, Director, Genre, Writer: convert to array of wiki-links
	 * - Runtime: extract numeric minutes value
	 */
	transformValue(field: string, value: string | OMDBRating[]): string | number | string[] {
	  if (typeof value !== "string") {
		return value as unknown as string;
	  }

	  // Fields that should be converted to wiki-links
	  const linkFields = ["Actors", "Director", "Genre", "Writer"];
	  if (linkFields.includes(field)) {
		return value
		  .split(",")
		  .map((item) => item.trim())
		  .filter((item) => item.length > 0)
		  .map((item) => `[[${item}]]`);
	  }

	  // Runtime: extract number from "136 min"
	  if (field === "Runtime") {
		const match = value.match(/^(\d+)/);
		if (match?.[1]) {
		  return parseInt(match[1], 10);
		}
	  }

	  return value;
	}
  
	sleep(ms: number): Promise<void> {
	  return new Promise((resolve) => setTimeout(resolve, ms));
	}
  }
  
  class IMDBLookupSettingTab extends PluginSettingTab {
	plugin: IMDBLookupPlugin;
  
	constructor(app: App, plugin: IMDBLookupPlugin) {
	  super(app, plugin);
	  this.plugin = plugin;
	}
  
	display(): void {
	  const { containerEl } = this;
	  containerEl.empty();
  
	  containerEl.createEl("h2", { text: "IMDB Lookup Settings" });
  
	  new Setting(containerEl)
		.setName("OMDB API Key")
		.setDesc("Your OMDB API key (get one at omdbapi.com)")
		.addText((text) =>
		  text
			.setPlaceholder("Enter your API key")
			.setValue(this.plugin.settings.apiKey)
			.onChange(async (value) => {
			  this.plugin.settings.apiKey = value;
			  await this.plugin.saveSettings();
			})
		);
  
	  new Setting(containerEl)
		.setName("Target Folder")
		.setDesc("The folder containing your movie notes")
		.addText((text) =>
		  text
			.setPlaceholder("Movies")
			.setValue(this.plugin.settings.targetFolder)
			.onChange(async (value) => {
			  this.plugin.settings.targetFolder = value;
			  await this.plugin.saveSettings();
			})
		);
  
	  new Setting(containerEl)
		.setName("IMDB ID Property")
		.setDesc("The frontmatter property name containing the IMDB ID")
		.addText((text) =>
		  text
			.setPlaceholder("imdbid")
			.setValue(this.plugin.settings.imdbIdProperty)
			.onChange(async (value) => {
			  this.plugin.settings.imdbIdProperty = value;
			  await this.plugin.saveSettings();
			})
		);
  
	  containerEl.createEl("h3", { text: "Field Mappings" });
	  containerEl.createEl("p", {
		text: "Configure which OMDB fields to sync and their property names in your notes.",
		cls: "setting-item-description",
	  });
  
	  const mappingsContainer = containerEl.createDiv({
		cls: "imdb-lookup-mappings",
	  });
  
	  for (const mapping of this.plugin.settings.fieldMappings) {
		const mappingEl = mappingsContainer.createDiv({
		  cls: "imdb-lookup-mapping",
		});
  
		new Setting(mappingEl)
		  .setName(mapping.omdbField)
		  .setDesc(`Maps to property: ${mapping.noteProperty}`)
		  .addToggle((toggle) =>
			toggle.setValue(mapping.enabled).onChange(async (value) => {
			  mapping.enabled = value;
			  await this.plugin.saveSettings();
			})
		  )
		  .addText((text) =>
			text
			  .setPlaceholder(mapping.omdbField.toLowerCase())
			  .setValue(mapping.noteProperty)
			  .onChange(async (value) => {
				mapping.noteProperty = value || mapping.omdbField.toLowerCase();
				await this.plugin.saveSettings();
			  })
		  );
	  }
	}
  }
  
  