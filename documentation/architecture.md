# TPV Result Parser Architecture

## Purpose

Prepare TrainingPeaks Virtual race results as upload-ready individual-result CSVs and calculate team time-trial standings without sending race files to a backend.

## Components

### Static PWA

- `index.html` is the GitHub Pages entry point.
- `app.js` handles navigation, the local file picker, browser rendering, race tabs, and downloads.
- `parser/browser-file-loader.js` reads CSV files and extracts CSV entries from ZIP archives in memory.
- `vendor/jszip.min.js` is served with the site; ZIP processing does not require a remote service.

### Browser parser

`parser/browser-parser.js` parses quoted CSV data, locates the `OVERALL INDIVIDUAL RESULTS` section, and ignores other sections. It retains all rows for a team containing at least one non-bot UID and excludes bot-only teams. Optional team renaming is applied before the official-team-list fallback. When the list is available, an unlisted team is named `Team FirstName LastName` using its fastest human finisher.

The parser returns two related views:

1. An upload-ready CSV with the original individual-results header and every qualifying rider row, bots included.
2. Team standings shown in the Results page. The normal score is the third finisher's time. If the top three are bots and the first human is more than 10 seconds behind the third finisher, the scoring place moves down one finisher at a time until the first human is within 10 seconds of that finisher. A team without a human finisher or at least three finishers is unscored.

The team-time-trial score is not written into the upload-ready CSV because that file preserves the source individual-results schema.

### Team list and deployment

- `.github/workflows/update-teams.yml` refreshes `teams_list.json` from `https://tpvirtualhub.com/api/teams`.
- `.github/workflows/pages.yml` deploys the static app and republishes the site after a successful team-list refresh.
- The PWA only fetches the public team-name JSON. It never receives or needs a GitHub credential.

### Tests and legacy code

- `tests/browser-parser.test.js` tests CSV parsing, team filtering, rename behavior, scoring, and ZIP extraction. Where the local sample data exists, it is the integration-test source of truth.
- `parser/process.py` and `.github/workflows/process.yml` remain as a separate legacy command-line/manual workflow. The PWA does not invoke them.

## Data flow

```text
Local CSV / ZIP
      |
      v
Browser file loader -> Browser CSV parser -> Results and TTT standings
                                             |
                                             +-> CSV download (one race)
                                             +-> ZIP download (multiple races)
```

Race files remain in browser memory for the current page session. No upload endpoint, GitHub token, or Action dispatch is involved.

## Local development

On Windows, `run_pwa.bat` serves the repository root at `http://localhost:8000/`. The Node test suite is run with `npm install` followed by `npm test`.
