# IMDB Lookup Plugin for Obsidian

Sync movie data from the OMDB API directly into your Obsidian notes.

## Features

- Automatically fetch movie metadata using IMDB IDs
- Configurable target folder for movie notes
- Customizable field mappings (choose which OMDB fields map to which note properties)
- Sync individual notes or batch sync entire folder
- Rate-limited API calls to respect OMDB limits

## Setup

1. Get a free API key from [OMDB API](https://www.omdbapi.com/apikey.aspx)
2. Install the plugin
3. Go to Settings → IMDB Lookup
4. Enter your OMDB API key
5. Configure your target folder (default: "Movies")
6. Customize field mappings as needed

## Usage

### Note Format

Your movie notes need an IMDB ID in the frontmatter:

```yaml
---
imdbid: tt3896198
---
# Guardians of the Galaxy Vol. 2
```

The IMDB ID can be found in any IMDB URL, e.g., `https://www.imdb.com/title/tt3896198/`

### Commands

- **Sync all movies from OMDB**: Syncs all notes in your target folder that have an IMDB ID
- **Sync current note from OMDB**: Syncs only the currently open note

### After Syncing

Your note frontmatter will be updated with the configured fields:

```yaml
---
imdbid: tt3896198
title: Guardians of the Galaxy Vol. 2
year: "2017"
rated: PG-13
released: 05 May 2017
runtime: 136 min
genre: Action, Adventure, Comedy
director: James Gunn
actors: Chris Pratt, Zoe Saldaña, Dave Bautista
plot: The Guardians struggle to keep together as a team...
poster: https://m.media-amazon.com/images/M/...
imdbrating: "7.6"
---
```

## Settings

### API Key
Your OMDB API key (required).

### Target Folder
The folder containing your movie notes. Default: `Movies`

### IMDB ID Property
The frontmatter property name containing the IMDB ID. Default: `imdbid`

### Field Mappings
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
```

## License

BSD
