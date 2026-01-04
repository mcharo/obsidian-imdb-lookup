# IMDB Lookup Plugin for Obsidian

Sync movie and TV show data from the OMDB API directly into your Obsidian notes.

## Features

- Fetch metadata for movies and TV shows using IMDB IDs
- Support for multiple target folders (e.g., Movies, TV Shows)
- Customizable field mappings with toggles for each field
- Smart data transformations:
  - **Actors, Director, Genre, Writer** → Obsidian wiki-links (`[[Name]]`)
  - **Runtime** → numeric minutes value
  - **Year** → number
  - **Released** → ISO date format (YYYY-MM-DD)
- Sync individual notes or batch sync all target folders
- Rate-limited API calls to respect OMDB limits

## Setup

1. Get a free API key from [OMDB API](https://www.omdbapi.com/apikey.aspx)
2. Install the plugin
3. Go to Settings → IMDB Lookup
4. Enter your OMDB API key
5. Configure your target folders (default: "Movies")
6. Customize field mappings as needed

## Usage

### Note format

Your notes need an IMDB ID in the frontmatter:

```yaml
---
imdbid: tt3896198
---
# Guardians of the Galaxy Vol. 2
```

The IMDB ID can be found in any IMDB URL, e.g., `https://www.imdb.com/title/tt3896198/`

### Commands

- **Sync all notes from OMDB**: Syncs all notes in your target folders that have an IMDB ID
- **Sync current note from OMDB**: Syncs only the currently open note

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
The folders containing your movie/TV show notes. Enter one folder path per line. Default: `Movies`

Example:
```
Movies
TV Shows
```

### IMDB ID property
The frontmatter property name containing the IMDB ID. Default: `imdbid`

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
