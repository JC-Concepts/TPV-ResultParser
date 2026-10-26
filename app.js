import {
  parseTimeSeconds,
  processCsvText,
  scoreTeam,
  stringifyCsv,
} from "./parser/browser-parser.js";
import { readCsvInputs } from "./parser/browser-file-loader.js";

const state = {
  knownTeams: null,
  races: new Map(),
  activeRace: null,
  lastBatchRaceNames: [],
  processing: false,
};

const elements = {
  fileInput: document.getElementById("result-files"),
  fileName: document.getElementById("file-name"),
  processButton: document.getElementById("process-button"),
  downloadButton: document.getElementById("download-button"),
  processStatus: document.getElementById("process-status"),
  teamListStatus: document.getElementById("team-list-status"),
  raceName: document.getElementById("raceName"),
  renameFrom: document.getElementById("renameFrom"),
  renameTo: document.getElementById("renameTo"),
  raceTabs: document.getElementById("race-tabs"),
  resultsEmpty: document.getElementById("results-empty"),
  resultsHeader: document.getElementById("results-header"),
  resultsBody: document.getElementById("results-body"),
  teamScoresPanel: document.getElementById("team-scores-panel"),
  teamScoresBody: document.getElementById("team-scores-body"),
};

function showTab(name) {
  for (const tabName of ["results", "upload"]) {
    document.getElementById(`tab-${tabName}`).classList.toggle("hidden", tabName !== name);
    const button = document.getElementById(`nav-${tabName}`);
    button.setAttribute("aria-current", tabName === name ? "page" : "false");
    button.classList.toggle("bg-gradient-to-r", tabName === name);
    button.classList.toggle("from-amber-500/20", tabName === name);
    button.classList.toggle("to-orange-500/20", tabName === name);
    button.classList.toggle("text-amber-300", tabName === name);
  }
  document.getElementById("page-title").textContent =
    name === "results" ? "Results" : "Upload";
}

function toggleTheme() {
  document.documentElement.classList.toggle("dark");
  localStorage.setItem(
    "theme",
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
}

function initializeTheme() {
  const savedTheme = localStorage.getItem("theme");
  if (
    savedTheme === "dark" ||
    (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)
  ) {
    document.documentElement.classList.add("dark");
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const collapsed = sidebar.classList.toggle("w-16");
  sidebar.classList.toggle("w-64", !collapsed);
  document.querySelectorAll(".nav-label").forEach((label) => {
    label.classList.toggle("hidden", collapsed);
  });
  document.querySelectorAll("#sidebar nav button i").forEach((icon) => {
    icon.classList.toggle("mx-auto", collapsed);
    icon.classList.toggle("block", collapsed);
    icon.classList.toggle("w-5", !collapsed);
  });
}

function setStatus(message, isError = false) {
  elements.processStatus.textContent = message;
  elements.processStatus.classList.toggle("text-red-600", isError);
  elements.processStatus.classList.toggle("dark:text-red-400", isError);
}

function updateButtons() {
  elements.processButton.disabled =
    state.processing || elements.fileInput.files.length === 0;
  elements.processButton.textContent = state.processing ? "Processing…" : "Process";
}

function fileStem(fileName) {
  const basename = String(fileName).replace(/\\/g, "/").split("/").pop() || "";
  return basename.replace(/\.[^.]+$/, "") || "Race";
}

function safeFileName(value) {
  return (
    String(value)
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
      .replace(/[. ]+$/g, "")
      .trim() || "Race"
  );
}

function uniqueName(name, usedNames) {
  const base = name.trim() || "Race";
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate.toLocaleLowerCase())) {
    candidate = `${base} (${suffix})`;
    suffix += 1;
  }
  usedNames.add(candidate.toLocaleLowerCase());
  return candidate;
}

function sortRaceRows(header, rows) {
  const timeColumn = header.findIndex(
    (column) => column.trim().toLocaleLowerCase() === "time",
  );
  const positionColumn = header.findIndex(
    (column) => column.trim().toLocaleLowerCase() === "position",
  );
  return [...rows].sort((left, right) => {
    const leftDnf = positionColumn !== -1 && /^DNF\b/i.test(left[positionColumn] ?? "");
    const rightDnf = positionColumn !== -1 && /^DNF\b/i.test(right[positionColumn] ?? "");
    if (leftDnf !== rightDnf) return leftDnf ? 1 : -1;
    const leftTime = timeColumn === -1 ? Number.NaN : parseTimeSeconds(left[timeColumn]);
    const rightTime = timeColumn === -1 ? Number.NaN : parseTimeSeconds(right[timeColumn]);
    const leftSort = Number.isFinite(leftTime) ? leftTime : Number.POSITIVE_INFINITY;
    const rightSort = Number.isFinite(rightTime) ? rightTime : Number.POSITIVE_INFINITY;
    return leftSort - rightSort;
  });
}

function recomputeTeamScores(header, rows) {
  const normalizedHeader = header.map((column) => column.trim().toLocaleLowerCase());
  const nameColumn = normalizedHeader.indexOf("name");
  const teamColumn = normalizedHeader.indexOf("team");
  const timeColumn = normalizedHeader.indexOf("time");
  const uidColumn = normalizedHeader.indexOf("uid");
  const positionColumn = normalizedHeader.indexOf("position");
  const groups = new Map();

  rows.forEach((row, sourceIndex) => {
    const team = row[teamColumn] ?? "";
    const key = team.trim().toLocaleLowerCase();
    if (!groups.has(key)) groups.set(key, { team, riders: [] });
    groups.get(key).riders.push({
      isBot: (row[uidColumn] ?? "").trim().toLocaleLowerCase().startsWith("bot"),
      isDnf:
        positionColumn !== -1 && /^DNF\b/i.test((row[positionColumn] ?? "").trim()),
      name: row[nameColumn] ?? "",
      sourceIndex,
      time: parseTimeSeconds(row[timeColumn]),
    });
  });

  return [...groups.values()]
    .map(({ team, riders }) => scoreTeam(team, riders))
    .sort((left, right) => {
      const leftTime = Number.isFinite(left.time) ? left.time : Number.POSITIVE_INFINITY;
      const rightTime = Number.isFinite(right.time) ? right.time : Number.POSITIVE_INFINITY;
      return leftTime - rightTime || left.team.localeCompare(right.team);
    });
}

function assignRaceNames(csvInputs, requestedRaceName) {
  const used = new Set();
  return csvInputs.map((input) => {
    const stem = fileStem(input.name);
    const requested =
      csvInputs.length > 1 && requestedRaceName
        ? `${requestedRaceName} - ${stem}`
        : requestedRaceName || stem;
    return { ...input, raceName: uniqueName(requested, used) };
  });
}

function appendRaceResult(raceName, result) {
  const existing = state.races.get(raceName);
  if (
    existing &&
    (existing.header.length !== result.header.length ||
      existing.header.some((column, index) => column !== result.header[index]))
  ) {
    throw new Error(`The CSV header for "${raceName}" does not match the existing results.`);
  }

  const header = existing?.header ?? result.header;
  const rows = sortRaceRows(header, [...(existing?.rows ?? []), ...result.rows]);
  state.races.set(raceName, {
    header,
    rows,
    teamScores: recomputeTeamScores(header, rows),
  });
}

function renderRaceTabs() {
  elements.raceTabs.replaceChildren();
  const raceNames = [...state.races.keys()].sort((left, right) =>
    left.localeCompare(right),
  );

  for (const raceName of raceNames) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = raceName;
    button.className =
      "px-4 py-2 rounded-xl border text-sm font-semibold transition " +
      (raceName === state.activeRace
        ? "bg-amber-500/20 border-amber-500 text-amber-800 dark:text-amber-200"
        : "bg-white dark:bg-slate-900/60 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200");
    button.setAttribute("aria-pressed", String(raceName === state.activeRace));
    button.addEventListener("click", () => {
      state.activeRace = raceName;
      renderResults();
    });
    elements.raceTabs.append(button);
  }
}

function appendCell(row, value, className = "px-5 py-4") {
  const cell = document.createElement("td");
  cell.className = className;
  cell.textContent = value == null ? "" : String(value);
  row.append(cell);
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const totalMilliseconds = Math.round(seconds * 1000);
  const wholeSeconds = Math.floor(totalMilliseconds / 1000);
  const milliseconds = totalMilliseconds % 1000;
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainingSeconds = wholeSeconds % 60;
  const fractional = String(milliseconds).padStart(3, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}.${fractional}`;
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}.${fractional}`;
}

function renderResults() {
  if (!state.races.has(state.activeRace)) {
    state.activeRace = [...state.races.keys()].sort((left, right) =>
      left.localeCompare(right),
    )[0] ?? null;
  }
  renderRaceTabs();

  const race = state.activeRace ? state.races.get(state.activeRace) : null;
  elements.resultsEmpty.classList.toggle("hidden", Boolean(race));
  elements.teamScoresPanel.classList.toggle("hidden", !race);
  elements.resultsHeader.replaceChildren();
  elements.resultsBody.replaceChildren();
  elements.teamScoresBody.replaceChildren();

  if (!race) return;

  for (const column of race.header) {
    const cell = document.createElement("th");
    cell.className = "px-5 py-4";
    cell.textContent = column;
    elements.resultsHeader.append(cell);
  }
  for (const values of race.rows) {
    const row = document.createElement("tr");
    row.className = "hover:bg-slate-100 dark:hover:bg-white/5 transition";
    values.forEach((value) => appendCell(row, value));
    elements.resultsBody.append(row);
  }

  race.teamScores.forEach((score, index) => {
    const row = document.createElement("tr");
    row.className = "hover:bg-slate-100 dark:hover:bg-white/5 transition";
    appendCell(row, index + 1);
    appendCell(row, score.team);
    appendCell(row, formatDuration(score.time));
    appendCell(row, score.scoringRider || "—");
    appendCell(row, score.rule);
    elements.teamScoresBody.append(row);
  });
}

async function processSelectedFiles() {
  if (state.processing) return;
  state.processing = true;
  elements.downloadButton.disabled = true;
  state.lastBatchRaceNames = [];
  updateButtons();
  setStatus("Reading and processing files locally…");

  try {
    const csvInputs = await readCsvInputs(
      [...elements.fileInput.files],
      window.JSZip,
    );
    const namedInputs = assignRaceNames(csvInputs, elements.raceName.value.trim());
    const renameFrom = elements.renameFrom.value.trim();
    const renameTo = elements.renameTo.value.trim();
    if (Boolean(renameFrom) !== Boolean(renameTo)) {
      throw new Error("Enter both the original team name and the replacement team name.");
    }

    const processed = namedInputs.map((input) => {
      try {
        return {
          raceName: input.raceName,
          result: processCsvText(input.text, {
            knownTeams: state.knownTeams,
            renameFrom,
            renameTo,
          }),
        };
      } catch (error) {
        throw new Error(`${input.name}: ${error.message}`);
      }
    });

    for (const item of processed) {
      appendRaceResult(item.raceName, item.result);
      state.activeRace = item.raceName;
    }
    state.lastBatchRaceNames = processed.map((item) => item.raceName);
    elements.downloadButton.disabled = false;
    renderResults();

    const riderCount = processed.reduce(
      (total, item) => total + item.result.rows.length,
      0,
    );
    const teamWarning =
      state.knownTeams === null
        ? " The TPV team list could not be loaded, so unfamiliar team names were kept unchanged."
        : "";
    setStatus(
      `Processed ${csvInputs.length} CSV file${csvInputs.length === 1 ? "" : "s"} and ${riderCount} rider row${riderCount === 1 ? "" : "s"}.${teamWarning}`,
    );
  } catch (error) {
    setStatus(`Processing failed: ${error.message}`, true);
  } finally {
    state.processing = false;
    updateButtons();
  }
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadResults() {
  if (state.lastBatchRaceNames.length === 0) {
    setStatus("Process at least one CSV before downloading.", true);
    return;
  }

  try {
    if (state.lastBatchRaceNames.length === 1) {
      const raceName = state.lastBatchRaceNames[0];
      const race = state.races.get(raceName);
      const csv = stringifyCsv([race.header, ...race.rows]);
      downloadBlob(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
        `${safeFileName(raceName)}.csv`,
      );
    } else {
      if (!window.JSZip) {
        throw new Error("The ZIP writer did not load. Refresh the page and try again.");
      }
      const archive = new window.JSZip();
      const usedFileNames = new Set();
      for (const raceName of state.lastBatchRaceNames) {
        const race = state.races.get(raceName);
        const outputName = uniqueName(safeFileName(raceName), usedFileNames);
        archive.file(
          `${outputName}.csv`,
          stringifyCsv([race.header, ...race.rows]),
        );
      }
      const blob = await archive.generateAsync({ type: "blob" });
      downloadBlob(blob, "processed-tpv-results.zip");
    }
  } catch (error) {
    setStatus(`Download failed: ${error.message}`, true);
  }
}

async function loadKnownTeams() {
  try {
    const response = await fetch("./teams_list.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const teams = await response.json();
    if (!Array.isArray(teams) || teams.some((team) => typeof team !== "string")) {
      throw new Error("The team list has an unexpected format.");
    }
    state.knownTeams = new Set(teams);
    elements.teamListStatus.textContent = `Loaded ${teams.length} known TPV team names.`;
  } catch (error) {
    state.knownTeams = null;
    elements.teamListStatus.textContent =
      `Known team list unavailable (${error.message}); unrecognized team names will be left unchanged.`;
  }
}

function handleFileSelection() {
  const files = [...elements.fileInput.files];
  if (files.length === 0) {
    elements.fileName.textContent = "No file selected";
  } else if (files.length <= 2) {
    elements.fileName.textContent = files.map((file) => file.name).join(", ");
  } else {
    elements.fileName.textContent = `${files[0].name}, ${files[1].name} and ${files.length - 2} more`;
  }
  state.lastBatchRaceNames = [];
  elements.downloadButton.disabled = true;
  setStatus(files.length ? "Ready to process locally." : "Select a result file to begin.");
  updateButtons();
}

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => showTab(button.dataset.tab));
});
document.querySelector('[data-action="toggle-theme"]').addEventListener("click", toggleTheme);
document
  .querySelector('[data-action="toggle-sidebar"]')
  .addEventListener("click", toggleSidebar);
elements.fileInput.addEventListener("change", handleFileSelection);
elements.processButton.addEventListener("click", processSelectedFiles);
elements.downloadButton.addEventListener("click", downloadResults);

initializeTheme();
updateButtons();
renderResults();
loadKnownTeams();
