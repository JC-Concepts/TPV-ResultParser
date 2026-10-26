# TPV Result Parser — Architecture (Updated)

## Purpose
Process Training Peaks Virtual race results (CSV / ZIP batches) into team-scored output CSVs for a PWA hosted on GitHub Pages.

## Components (Implemented)

1. **Parser Engine** (`parser/`)
   - Reads raw CSV, filters "Overall Individual Results" by UID.
   - Keeps only teams with at least one non-`Bot` UID.
   - Applies optional team rename (`rename_map`) and race naming (`race_name`).
   - Cross-checks team names against `teams_list.json` (1177 teams from `/api/teams`).
   - Unknown teams renamed to `Team FirstName LastName`.
   - Outputs `output_new.csv` and race-specific `results_{Race}.csv` sorted by time.

2. **PWA Site** (`pwa/`)
   - Modern dark/light theme toggle (RealVelo-inspired).
   - Collapsible left sidebar (Results / Upload tabs).
   - Results page loads `output_new.csv` dynamically; supports race tabs.
   - Upload page: file picker, Race Name input, optional team rename fields, Process/Download buttons.

3. **Testing** (`tests/`)
   - Unit tests for parser rules, team loading, race naming, rename mapping.

4. **GitHub Action** (`.github/workflows/process.yml`)
   - Runs parser on push; scrapes `/api/teams` daily (`cron: '0 6 * * *'`) to update `teams_list.json`.

5. **Local Executable** (`run_parser.bat`, `run_pwa.bat`)
   - `.bat` files for local parser execution and PWA server.

## Data Flow
```
Raw CSV / ZIP → Parser (filter + rename + race) → output_new.csv + results_{Race}.csv
```

## Constraints
- Parser logic fully implemented.
- PWA uses static HTML + Tailwind; can be upgraded to React/Vue build.
- Team list updated via GitHub Action scraping `/api/teams`.
