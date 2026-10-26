# TPV Result Parser

A Progressive Web App (PWA) and Python parser for processing Training Peaks Virtual (TPV) race results. It filters individual results, detects human riders (non-`Bot` UIDs), applies team-time-trial scoring rules, validates team names against a live list of 1177 TPV teams, and outputs clean CSV files ready for upload.

## Features
- **Parser Engine**: Reads raw CSV, skips team-only sections, filters by UID, applies TTT scoring (3rd best time, 10-second bot/human window), renames unknown teams (`Team FirstName LastName`), and writes race-specific sorted CSVs.
- **Team Validation**: Cross-checks against `teams_list.json` (scraped from `https://tpvirtualhub.com/api/teams` via GitHub Action).
- **PWA**: Modern dark/light theme (RealVelo-inspired), collapsible sidebar, Results tab (loads CSV dynamically), Upload tab (race name + optional team rename), Process/Download buttons.
- **GitHub Action**: Daily team list update (`cron: 0 6 * * *`) plus on-push processing.
- **Local Executables**: `run_parser.bat` and `run_pwa.bat` for quick local testing.

## Project Structure
```
parser/          Python parser script
index.html       PWA static site (Tailwind)
tests/           Unit tests
.github/         Workflows and scraper
SampleData/      Raw and upload-ready CSV samples
```

## Usage
```bash
# Process a CSV
python parser/process.py "SampleData/Sample Data - Raw.csv" output.csv

# With race name and team rename
python parser/process.py input.csv output.csv "" "" "R1 Long" "Team Lou=Team Lou Dev"

# Run PWA locally
python -m http.server 8000
```

## Testing
```bash
python -m unittest discover -s tests -p "test_*.py"
```

## Deployment
Hosted on GitHub Pages from the repository root. Parser runs via GitHub Actions.
