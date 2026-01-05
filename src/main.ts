import {
	App,
	Modal,
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
	targetFolders: string[];
	imdbIdProperty: string;
	renameNotes: boolean;
	newNoteFolderMovies: string;
	newNoteFolderSeries: string;
	templateFileMovies: string;
	templateFileSeries: string;
	fieldMappings: FieldMapping[];
}

const DEFAULT_SETTINGS: IMDBLookupSettings = {
	apiKey: "",
	targetFolders: ["Movies"],
	imdbIdProperty: "imdbid",
	renameNotes: false,
	newNoteFolderMovies: "Movies",
	newNoteFolderSeries: "TV Shows",
	templateFileMovies: "",
	templateFileSeries: "",
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
	Title?: string;
	Year?: string;
	Type?: string;
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
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			name: "Sync all notes from OMDB",
			callback: () => this.syncAllMovies(),
		});

		this.addCommand({
			id: "sync-current-note",
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			name: "Sync current note from OMDB",
			callback: () => this.syncCurrentNote(),
		});

		this.addCommand({
			id: "create-note-from-imdb-id",
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			name: "Create new note from IMDB ID",
			callback: () => this.promptForNewNote(),
		});

		this.addSettingTab(new IMDBLookupSettingTab(this.app, this));
	}

	async loadSettings() {
		const data = (await this.loadData()) as IMDBLookupSettings & {
			targetFolder?: string;
		};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);

		// Migrate old single targetFolder to targetFolders array
		if (data?.targetFolder && !data?.targetFolders) {
			this.settings.targetFolders = [data.targetFolder];
		}

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
			new Notice("Active file is not a Markdown file");
			return;
		}

		await this.syncNote(activeFile);
	}

	promptForNewNote() {
		if (!this.settings.apiKey) {
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			new Notice("Please configure your OMDB API key in settings");
			return;
		}
		new IMDBInputModal(this.app, (imdbId) => {
			void this.createNoteFromIMDBID(imdbId);
		}).open();
	}

	/**
	 * Parse an IMDB ID from either a raw ID or an IMDB URL
	 * Returns the ID (e.g., "tt3896198") or null if invalid
	 */
	parseIMDBId(input: string): string | null {
		const trimmed = input.trim();
		console.debug("[IMDB Lookup] Parsing input:", trimmed);

		// Try to extract from URL first
		// Example: https://www.imdb.com/title/tt38644726/
		const urlMatch = trimmed.match(/imdb\.com\/title\/(tt\d+)/i);
		console.debug("[IMDB Lookup] URL match result:", urlMatch);
		if (urlMatch?.[1]) {
			console.debug("[IMDB Lookup] Extracted from URL:", urlMatch[1]);
			return urlMatch[1];
		}

		// Check if it's a valid IMDB ID format
		const idMatch = trimmed.match(/^(tt\d{7,})$/i);
		console.debug("[IMDB Lookup] ID match result:", idMatch);
		if (idMatch?.[1]) {
			console.debug("[IMDB Lookup] Valid ID:", idMatch[1]);
			return idMatch[1];
		}

		console.debug("[IMDB Lookup] Failed to parse IMDB ID from input");
		return null;
	}

	async createNoteFromIMDBID(input: string): Promise<void> {
		// Parse IMDB ID from input (supports both IDs and URLs)
		const imdbId = this.parseIMDBId(input);
		if (!imdbId) {
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			new Notice("Invalid IMDB ID or URL");
			return;
		}

		// Fetch data first to get title and type for filename/folder
		// eslint-disable-next-line obsidianmd/ui/sentence-case
		new Notice("Fetching data from OMDB...");
		console.debug("[IMDB Lookup] Fetching OMDB data for:", imdbId);
		const data = await this.fetchOMDBData(imdbId);
		console.debug("[IMDB Lookup] OMDB response:", data);
		if (!data || data.Response === "False") {
			console.debug("[IMDB Lookup] OMDB error:", data?.Error);
			new Notice(`OMDB Error: ${data?.Error || "Unknown error"}`);
			return;
		}

		const title = data.Title || "Untitled";
		const year = data.Year || "";
		const type = data.Type || "movie";
		const isMovie = type === "movie";

		// Build filename: "Title (Year)" for movies and just "Title" for TV series
		const filename = this.sanitizeFilename(isMovie && year ? `${title} (${year})` : title);

		// Determine folder based on type
		const folderPath =
			isMovie
				? this.settings.newNoteFolderMovies || "Movies"
				: this.settings.newNoteFolderSeries || "TV Shows";

		// Ensure folder exists
		let folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!folder) {
			try {
				await this.app.vault.createFolder(folderPath);
				folder = this.app.vault.getAbstractFileByPath(folderPath);
			} catch (e) {
				console.error("Failed to create folder:", e);
				new Notice(`Failed to create folder: ${folderPath}`);
				return;
			}
		}

		// Check if file already exists
		const filePath = `${folderPath}/${filename}.md`;
		if (this.app.vault.getAbstractFileByPath(filePath)) {
			new Notice(`Note already exists: ${filename}`);
			return;
		}

		// Get template content if configured (use type-specific template)
		let content = "";
		const isSeries = type === "series" || type === "episode";
		const templatePath = isSeries
			? this.settings.templateFileSeries
			: this.settings.templateFileMovies;

		if (templatePath) {
			const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
			if (templateFile instanceof TFile) {
				content = await this.app.vault.read(templateFile);
			} else {
				console.warn(`Template file not found: ${templatePath}`);
			}
		}

		// Ensure content has frontmatter with IMDB ID
		content = this.insertOrReplaceIMDBID(content, imdbId);

		// Create the note
		try {
			const file = await this.app.vault.create(filePath, content);
			new Notice(`Created: ${filename}`);

			// Open the new note
			await this.app.workspace.getLeaf().openFile(file);

			// Update frontmatter with all fields (we already have the data)
			await this.updateNoteFrontmatter(file, data);
		} catch (e) {
			console.error("Failed to create note:", e);
			new Notice("Failed to create note");
		}
	}

	/**
	 * Sanitize a string for use as a filename
	 */
	sanitizeFilename(name: string): string {
		return name
			.replace(/: /g, " - ") // Replace colons with " - "
			.replace(/[\\/:*?"<>|]/g, "-") // Replace invalid chars with dash
			.replace(/\s+/g, " ") // Normalize whitespace
			.replace(/^\.+/, "") // Remove leading dots
			.replace(/\.+$/, "") // Remove trailing dots
			.replace(/-+/g, "-") // Collapse multiple dashes
			.trim()
			.substring(0, 200); // Limit length for filesystem safety
	}

	/**
	 * Insert or replace IMDB ID in content frontmatter
	 */
	insertOrReplaceIMDBID(content: string, imdbId: string): string {
		const prop = this.settings.imdbIdProperty;

		// No frontmatter - create one
		if (!content.startsWith("---")) {
			return `---\n${prop}: ${imdbId}\n---\n\n${content}`;
		}

		// Find the end of frontmatter
		const endMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!endMatch?.[1]) {
			// Malformed frontmatter, just prepend
			return `---\n${prop}: ${imdbId}\n---\n\n${content}`;
		}

		const frontmatterContent = endMatch[1];

		// Check if IMDB ID property already exists in frontmatter
		const propRegex = new RegExp(`^${this.escapeRegex(prop)}:.*$`, "m");

		if (propRegex.test(frontmatterContent)) {
			// Replace existing value
			const updatedFrontmatter = frontmatterContent.replace(
				propRegex,
				`${prop}: ${imdbId}`
			);
			return content.replace(
				/^---\n[\s\S]*?\n---/,
				`---\n${updatedFrontmatter}\n---`
			);
		} else {
			// Add to beginning of frontmatter
			return content.replace(/^---\n/, `---\n${prop}: ${imdbId}\n`);
		}
	}

	/**
	 * Escape special regex characters in a string
	 */
	escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	async syncAllMovies() {
		if (!this.settings.apiKey) {
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			new Notice("Please configure your OMDB API key in settings");
			return;
		}

		if (this.settings.targetFolders.length === 0) {
			new Notice("Please configure at least one target folder in settings");
			return;
		}

		const files: TFile[] = [];
		const missingFolders: string[] = [];

		for (const folderPath of this.settings.targetFolders) {
			const folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (!folder || !(folder instanceof TFolder)) {
				missingFolders.push(folderPath);
				continue;
			}
			files.push(...this.getMarkdownFilesRecursively(folder));
		}

		if (missingFolders.length > 0) {
			new Notice(`Folders not found: ${missingFolders.join(", ")}`);
		}

		if (files.length === 0) {
			new Notice("No Markdown files found in target folders");
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

		const imdbId = frontmatter[this.settings.imdbIdProperty] as
			| string
			| undefined;
		if (!imdbId) {
			if (!silent)
				new Notice(
					`No ${this.settings.imdbIdProperty} property found in ${file.name}`
				);
			return "skipped";
		}

		if (!this.settings.apiKey) {
			// eslint-disable-next-line obsidianmd/ui/sentence-case
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

			// Rename note if setting is enabled
			if (this.settings.renameNotes) {
				await this.renameNoteToTitle(file, data);
			}

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
		console.debug("[IMDB Lookup] OMDB API URL:", url.replace(this.settings.apiKey, "API_KEY_HIDDEN"));
		try {
			const response = await requestUrl({ url });
			console.debug("[IMDB Lookup] OMDB API raw response:", response.json);
			return response.json as OMDBResponse;
		} catch (e) {
			console.error("[IMDB Lookup] OMDB API request failed:", e);
			return null;
		}
	}

	async updateNoteFrontmatter(file: TFile, data: OMDBResponse) {
		await this.app.fileManager.processFrontMatter(
			file,
			(frontmatter: Record<string, unknown>) => {
				for (const mapping of this.settings.fieldMappings) {
					if (!mapping.enabled) continue;

					const value = data[mapping.omdbField];
					if (value !== undefined && value !== "N/A") {
						frontmatter[mapping.noteProperty] = this.transformValue(
							mapping.omdbField,
							value
						);
					}
				}
			}
		);
	}

	/**
	 * Rename the note based on OMDB data
	 * Movies: "Title (Year)"
	 * Series: "Title"
	 */
	async renameNoteToTitle(file: TFile, data: OMDBResponse): Promise<void> {
		const title = data.Title;
		const year = data.Year;
		const type = data.Type || "movie";

		if (!title) {
			return;
		}

		const isMovie = type === "movie";
		const newBaseName = this.sanitizeFilename(
			isMovie && year ? `${title} (${year})` : title
		);
		const currentBaseName = file.basename;

		// Skip if name is already correct
		if (currentBaseName === newBaseName) {
			return;
		}

		// Build new path
		const newPath = file.parent
			? `${file.parent.path}/${newBaseName}.md`
			: `${newBaseName}.md`;

		try {
			await this.app.fileManager.renameFile(file, newPath);
			console.debug(`Renamed: "${currentBaseName}" → "${newBaseName}"`);
		} catch (e) {
			console.error("Failed to rename file:", e);
		}
	}

	/**
	 * Transform OMDB field values for Obsidian frontmatter
	 * - Actors, Director, Genre, Writer: convert to array of wiki-links
	 * - Runtime: extract numeric minutes value
	 * - Year: convert to number
	 * - Released: convert to ISO date string (YYYY-MM-DD)
	 */
	transformValue(
		field: string,
		value: string | OMDBRating[]
	): string | number | string[] {
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

		// Year: convert to number
		if (field === "Year") {
			const year = parseInt(value, 10);
			if (!isNaN(year)) {
				return year;
			}
		}

		// Released: convert "05 May 2017" to "2017-05-05"
		if (field === "Released") {
			const date = new Date(value);
			if (!isNaN(date.getTime())) {
				return date.toISOString().split("T")[0] ?? value;
			}
		}

		return value;
	}

	sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

/**
 * Modal for inputting an IMDB ID
 */
class IMDBInputModal extends Modal {
	onSubmit: (imdbId: string) => void;
	inputEl: HTMLInputElement | null = null;

	constructor(app: App, onSubmit: (imdbId: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;

		// eslint-disable-next-line obsidianmd/ui/sentence-case
		contentEl.createEl("h3", { text: "Create note from IMDB" });

		contentEl.createEl("p", {
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			text: "Enter an IMDB ID or paste an IMDB URL.",
			cls: "setting-item-description",
		});

		const inputContainer = contentEl.createDiv({
			cls: "imdb-lookup-input-container",
		});

		this.inputEl = inputContainer.createEl("input", {
			type: "text",
			placeholder: "tt3896198 or https://imdb.com/title/tt3896198",
			cls: "imdb-lookup-input",
		});

		// Handle Enter key
		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.submit();
			}
		});

		const buttonContainer = contentEl.createDiv({
			cls: "imdb-lookup-button-container",
		});

		const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		const submitBtn = buttonContainer.createEl("button", {
			text: "Create note",
			cls: "mod-cta",
		});
		submitBtn.addEventListener("click", () => this.submit());

		// Focus input
		this.inputEl.focus();
	}

	submit() {
		const value = this.inputEl?.value.trim() ?? "";

		if (value) {
			this.close();
			this.onSubmit(value);
		} else {
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			new Notice("Please enter an IMDB ID or URL");
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
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

		new Setting(containerEl)
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setName("OMDB API key")
			// eslint-disable-next-line obsidianmd/ui/sentence-case
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
			.setName("Target folders")
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setDesc("Folders containing your movie/TV show notes (one per line)")
			.addTextArea((text) =>
				text
					// eslint-disable-next-line obsidianmd/ui/sentence-case
					.setPlaceholder("Movies\nTV shows")
					.setValue(this.plugin.settings.targetFolders.join("\n"))
					.onChange(async (value) => {
						this.plugin.settings.targetFolders = value
							.split("\n")
							.map((f) => f.trim())
							.filter((f) => f.length > 0);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setName("IMDB ID property")
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setDesc("The frontmatter property name containing the IMDB ID")
			.addText((text) =>
				text
					// eslint-disable-next-line obsidianmd/ui/sentence-case
					.setPlaceholder("imdbid")
					.setValue(this.plugin.settings.imdbIdProperty)
					.onChange(async (value) => {
						this.plugin.settings.imdbIdProperty = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Rename notes")
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setDesc("Rename notes after syncing: movies to 'Title (Year)', TV shows to 'Title'")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.renameNotes)
					.onChange(async (value) => {
						this.plugin.settings.renameNotes = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("New note creation")
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setDesc("Settings for the 'Create new note from IMDB ID' command")
			.setHeading();

		new Setting(containerEl)
			.setName("Movies folder")
			.setDesc("Folder where new movie notes will be created")
			.addText((text) =>
				text
					.setPlaceholder("Movies")
					.setValue(this.plugin.settings.newNoteFolderMovies)
					.onChange(async (value) => {
						this.plugin.settings.newNoteFolderMovies = value || "Movies";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setName("TV shows folder")
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setDesc("Folder where new TV series notes will be created")
			.addText((text) =>
				text
					// eslint-disable-next-line obsidianmd/ui/sentence-case
					.setPlaceholder("TV Shows")
					.setValue(this.plugin.settings.newNoteFolderSeries)
					.onChange(async (value) => {
						this.plugin.settings.newNoteFolderSeries = value || "TV Shows";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Movies template")
			.setDesc("Optional template file for new movie notes")
			.addText((text) =>
				text
					.setPlaceholder("Templates/Movie.md")
					.setValue(this.plugin.settings.templateFileMovies)
					.onChange(async (value) => {
						this.plugin.settings.templateFileMovies = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setName("TV shows template")
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setDesc("Optional template file for new TV series notes")
			.addText((text) =>
				text
					// eslint-disable-next-line obsidianmd/ui/sentence-case
					.setPlaceholder("Templates/TV Show.md")
					.setValue(this.plugin.settings.templateFileSeries)
					.onChange(async (value) => {
						this.plugin.settings.templateFileSeries = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Field mappings")
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setDesc(
				"Configure which OMDB fields to sync and their property names in your notes."
			)
			.setHeading();

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
