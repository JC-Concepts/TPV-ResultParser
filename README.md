# TPV Result Parser

TPV Result Parser is a static Progressive Web App for preparing TrainingPeaks Virtual race results. The PWA reads selected files in the browser; race files are not uploaded to a server and the Process button does not start a GitHub Action.

## Browser features

- Process one or more CSV files, or CSV files inside a ZIP archive.
- Read the `OVERALL INDIVIDUAL RESULTS` section and ignore team-only and intermediate-result sections.
- Keep every rider (including bots) from teams that have at least one non-bot UID; omit teams with only bots.
- Apply an optional team rename. If the official team list is available, unlisted teams are labeled `Team FirstName LastName` using the fastest human rider.
- Show team time-trial standings separately from the upload-ready individual rider CSV.
- Download one race as a CSV, or multiple races as a ZIP of processed CSV files.
- Keep processed race tabs in the open browser session. Reprocessing the same race name appends and sorts the rider rows.
- Use the TPV team list refreshed by the scheduled GitHub Action.

For team standings, the default score is the third finisher's time. When the top three finishers are bots, the first human is checked against the third finisher. If the gap exceeds 10 seconds, the scoring place moves down one finisher at a time until the first human is within 10 seconds of the selected finisher. Teams without three finishers or a human finisher are displayed as unscored. The downloadable CSV preserves the original individual-results columns and all qualifying riders; standings are shown in the PWA.

## Use the hosted PWA

Open the GitHub Pages site, select CSV and/or ZIP files, optionally enter a race name or team rename, then choose **Process**. Use **Download** after processing. Multiple CSVs in one batch are kept as separate race results; the download is a ZIP when the batch produces multiple races.

Files are read and processed in browser memory. The app uses no GitHub token and sends no race-file contents to GitHub Actions.

## Run locally on Windows

Run `run_pwa.bat` from Explorer or a terminal. It starts a local static web server and opens `http://localhost:8000/`. The server is needed for browser module imports; users of the hosted site do not need to install Python or Node.

## Tests

With Node.js and npm installed, run:

```text
npm install
npm test
```

The browser parser tests use `SampleData/Sample Data - Raw.csv` as the integration-test source when the local sample is present. `SampleData/` is intentionally not committed; tests still run the standalone CSV and scoring checks when sample files are absent.

## Team list refresh

`.github/workflows/update-teams.yml` fetches team names from the TPV Hub API daily and updates `teams_list.json`. The Pages deployment also runs after that workflow succeeds so the refreshed list is published with the site. `teams_list.json` is public source data, not a secret.

## Project files

```text
index.html                    Static PWA
app.js                        Browser UI, file handling, rendering, and downloads
parser/browser-parser.js      CSV parsing, team filtering/renaming, TTT scoring
parser/browser-file-loader.js CSV and ZIP input loading
vendor/jszip.min.js           Locally served ZIP support
teams_list.json               TPV team names used by the browser
parser/process.py             Legacy command-line parser
tests/browser-parser.test.js  Browser parser and ZIP tests
.github/workflows/            Pages deployment and scheduled team-list refresh
```

The manually dispatched `process.yml` workflow is separate from the PWA and cannot receive a file selected in the browser.
