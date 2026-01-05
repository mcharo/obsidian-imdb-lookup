# IMDB Lookup Plugin for Obsidian

Sync movie and TV show data from the OMDB API directly into your Obsidian notes.

## Features

- **Create notes from IMDB IDs** - Quickly create new notes by entering an IMDB ID or pasting an IMDB URL
- Fetch metadata for movies and TV shows using IMDB IDs
- Automatic folder selection based on content type (movie vs. series)
- Support for multiple target folders (e.g., Movies, TV Shows)
- Optional template support for new notes
- Customizable field mappings with toggles for each field
- Smart data transformations:
  - **Actors, Director, Genre, Writer** → Obsidian wiki-links (`[[Name]]`)
  - **Runtime** → numeric minutes value
  - **Year** → number
  - **Released** → ISO date format (YYYY-MM-DD)
- Rate-limited API calls to respect OMDB limits

## Setup

1. Get a free API key from [OMDB API](https://www.omdbapi.com/apikey.aspx)
2. Install the plugin
3. Go to **Settings → IMDB Lookup**
4. Enter your OMDB API key
5. Configure your target folders (default: "Movies")
6. Customize field mappings as needed

## Usage

### Commands

- **Create new note from IMDB ID**: Opens a dialog to enter an IMDB ID or paste an IMDB URL, then creates a new note with all metadata
- **Sync all notes from OMDB**: Syncs all notes in your target folders that have an IMDB ID
- **Sync current note from OMDB**: Syncs only the currently open note

### Creating a new note

1. Run the "Create new note from IMDB ID" command
2. Enter an IMDB ID (e.g., `tt3896198`) or paste a full IMDB URL (e.g., `https://www.imdb.com/title/tt3896198/`)
3. The plugin will:
   - Fetch the metadata from OMDB
   - Create a new note named "Title (Year)" in the appropriate folder
   - Movies go to the Movies folder, TV series go to the TV Shows folder
   - Populate all configured fields in the frontmatter

### Syncing existing notes

Your notes need an IMDB ID in the frontmatter:

```yaml
---
imdbid: tt3896198
---
# Guardians of the Galaxy Vol. 2
```

The IMDB ID can be found in any IMDB URL, e.g., `https://www.imdb.com/title/tt3896198/`

### After syncing

Your note frontmatter will be updated with the configured fields:

```yaml
---
imdbid: tt3896198
title: Guardians of the Galaxy Vol. 2
year: 2017
rated: PG-13
released: 2017-05-05
runtime: 136
genre:
  - "[[Action]]"
  - "[[Adventure]]"
  - "[[Comedy]]"
director:
  - "[[James Gunn]]"
actors:
  - "[[Chris Pratt]]"
  - "[[Zoe Saldaña]]"
  - "[[Dave Bautista]]"
plot: The Guardians struggle to keep together as a team...
poster: https://m.media-amazon.com/images/M/...
imdbrating: "7.6"
---
```

## Settings

### OMDB API key
Your OMDB API key (required).

### Target folders
The folders containing your movie/TV show notes for syncing. Enter one folder path per line. Default: `Movies`

Example:
```
Movies
TV Shows
```

### IMDB ID property
The frontmatter property name containing the IMDB ID. Default: `imdbid`

### Rename notes
When enabled, notes will be renamed after syncing:
- **Movies**: `Title (Year)` (e.g., "Guardians of the Galaxy Vol. 2 (2017).md")
- **TV Shows**: `Title` (e.g., "Breaking Bad.md")

### New note creation

#### Movies folder
Folder where new movie notes will be created. Default: `Movies`

#### TV shows folder
Folder where new TV series notes will be created. Default: `TV Shows`

#### Movies template
Optional path to a template file for new movie notes. Leave empty for no template.

#### TV shows template
Optional path to a template file for new TV series notes. Leave empty for no template.

### Field mappings
Configure which OMDB fields to sync and what property names to use in your notes. Toggle fields on/off and customize the property names.

Available OMDB fields:
- Title, Year, Rated, Released, Runtime
- Genre, Director, Writer, Actors
- Plot, Language, Country, Awards
- Poster, Metascore, imdbRating, imdbVotes
- Type, DVD, BoxOffice, Production, Website

## Development

```bash
# Install dependencies
npm install

# Build for development (watch mode)
npm run dev

# Build for production
npm run build

# Lint
npm run lint
```

## License

BSD
