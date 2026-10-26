const SECTION_TITLE = /^OVERALL INDIVIDUAL RESULTS\s*:?\s*$/i;
const NEXT_SECTION_TITLE = /^(?:OVERALL|INTERMEDIATE)\b.*\bRESULTS\s*:?\s*$/i;
const SCORE_WINDOW_SECONDS = 10;

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (insideQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          insideQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      insideQuotes = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (character === "\r" && text[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }

  if (insideQuotes) {
    throw new Error("The CSV has an unterminated quoted field.");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length > 0 && rows[0].length > 0) {
    rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  }
  return rows;
}

export function stringifyCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const cell = value == null ? "" : String(value);
          return /[",\r\n]/.test(cell)
            ? `"${cell.replace(/"/g, '""')}"`
            : cell;
        })
        .join(","),
    )
    .join("\r\n");
}

export function parseTimeSeconds(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return Number.NaN;

  if (trimmed.includes(":")) {
    const parts = trimmed.split(":").map(Number);
    if (parts.some((part) => !Number.isFinite(part))) return Number.NaN;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }

  const seconds = Number(trimmed);
  return Number.isFinite(seconds) ? seconds : Number.NaN;
}

function normalizeKey(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function isBotUid(uid) {
  return String(uid ?? "").trim().toLocaleLowerCase().startsWith("bot");
}

function isSectionTitle(row) {
  const firstCell = row.find((cell) => String(cell ?? "").trim() !== "");
  return firstCell != null && NEXT_SECTION_TITLE.test(String(firstCell).trim());
}

function getColumnIndices(header) {
  const normalized = header.map((cell) => String(cell).trim().toLocaleLowerCase());
  const indices = {
    name: normalized.indexOf("name"),
    team: normalized.indexOf("team"),
    time: normalized.indexOf("time"),
    uid: normalized.indexOf("uid"),
    position: normalized.indexOf("position"),
  };
  const missing = ["name", "team", "time", "uid"].filter(
    (column) => indices[column] === -1,
  );
  if (missing.length > 0) {
    throw new Error(`The individual results header is missing: ${missing.join(", ")}.`);
  }
  return indices;
}

function compareRecords(left, right) {
  const leftTime = Number.isFinite(left.time) ? left.time : Number.POSITIVE_INFINITY;
  const rightTime = Number.isFinite(right.time) ? right.time : Number.POSITIVE_INFINITY;
  return leftTime - rightTime || left.sourceIndex - right.sourceIndex;
}

export function scoreTeam(team, riders) {
  const finishers = riders
    .filter((rider) => Number.isFinite(rider.time) && !rider.isDnf)
    .sort(compareRecords);
  const humanFinishers = finishers.filter((rider) => !rider.isBot);

  if (humanFinishers.length === 0) {
    return { team, time: null, scoringRider: "", rule: "No human finisher" };
  }
  if (finishers.length < 3) {
    return { team, time: null, scoringRider: "", rule: "Fewer than three finishers" };
  }

  let scoreIndex = 2;
  let removedLeadingBots = 0;
  if (finishers.slice(0, 3).every((rider) => rider.isBot)) {
    const firstHumanIndex = finishers.indexOf(humanFinishers[0]);
    while (
      scoreIndex < firstHumanIndex &&
      humanFinishers[0].time - finishers[scoreIndex].time > SCORE_WINDOW_SECONDS
    ) {
      scoreIndex += 1;
      removedLeadingBots += 1;
    }
  }

  const scorer = finishers[scoreIndex];
  const rule =
    removedLeadingBots > 0
      ? `${removedLeadingBots} leading bot${removedLeadingBots === 1 ? "" : "s"} removed; human within 10 seconds`
      : "Third finisher";

  return {
    team,
    time: scorer.time,
    scoringRider: scorer.name,
    rule,
  };
}

function knownTeamLookup(knownTeams) {
  if (knownTeams == null) return null;
  const teams = knownTeams instanceof Set ? [...knownTeams] : knownTeams;
  if (!Array.isArray(teams)) return null;
  return new Set(teams.map(normalizeKey).filter(Boolean));
}

export function processCsvText(csvText, options = {}) {
  const rows = parseCsv(csvText);
  const sectionIndex = rows.findIndex((row) =>
    row.some((cell) => SECTION_TITLE.test(String(cell ?? "").trim())),
  );
  if (sectionIndex === -1) {
    throw new Error('Could not find the "OVERALL INDIVIDUAL RESULTS" section.');
  }

  let headerIndex = -1;
  for (let index = sectionIndex + 1; index < rows.length; index += 1) {
    if (isSectionTitle(rows[index])) break;
    const candidate = rows[index].map((cell) => String(cell).trim().toLocaleLowerCase());
    if (
      candidate.includes("name") &&
      candidate.includes("team") &&
      candidate.includes("time") &&
      candidate.includes("uid")
    ) {
      headerIndex = index;
      break;
    }
  }
  if (headerIndex === -1) {
    throw new Error("Could not find the individual results CSV header.");
  }

  const header = rows[headerIndex].map((cell) => String(cell).replace(/^\uFEFF/, ""));
  const columns = getColumnIndices(header);
  let sectionEnd = rows.length;
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    if (isSectionTitle(rows[index])) {
      sectionEnd = index;
      break;
    }
  }

  const records = [];
  for (let index = headerIndex + 1; index < sectionEnd; index += 1) {
    const sourceRow = rows[index];
    if (sourceRow.every((cell) => String(cell ?? "").trim() === "")) continue;
    const row = Array.from({ length: header.length }, (_, column) =>
      String(sourceRow[column] ?? ""),
    );
    const uid = row[columns.uid].trim();
    if (!uid) continue;

    const position = columns.position === -1 ? "" : row[columns.position].trim();
    records.push({
      row,
      sourceIndex: index,
      uid,
      isBot: isBotUid(uid),
      name: row[columns.name].trim(),
      team: row[columns.team].trim(),
      time: parseTimeSeconds(row[columns.time]),
      isDnf: /^DNF\b/i.test(position),
    });
  }

  const groups = new Map();
  for (const record of records) {
    const key = normalizeKey(record.team);
    if (!groups.has(key)) {
      groups.set(key, { originalName: record.team, records: [] });
    }
    groups.get(key).records.push(record);
  }

  const knownTeams = knownTeamLookup(options.knownTeams);
  const renameFrom = String(options.renameFrom ?? "").trim();
  const renameTo = String(options.renameTo ?? "").trim();
  if (Boolean(renameFrom) !== Boolean(renameTo)) {
    throw new Error("Enter both the original team name and the replacement team name.");
  }

  const outputRows = [];
  const teamScores = [];
  for (const [key, group] of groups) {
    const hasHuman = group.records.some((record) => !record.isBot);
    if (!hasHuman) continue;

    const firstHuman = group.records
      .filter((record) => !record.isBot)
      .sort(compareRecords)[0];
    const manuallyRenamed = renameFrom && key === normalizeKey(renameFrom);
    let outputTeam = group.originalName;
    if (manuallyRenamed) {
      outputTeam = renameTo;
    } else if (
      knownTeams !== null &&
      !knownTeams.has(key) &&
      firstHuman?.name
    ) {
      outputTeam = `Team ${firstHuman.name}`;
    }

    for (const record of group.records) {
      const outputRow = [...record.row];
      outputRow[columns.team] = outputTeam;
      outputRows.push(outputRow);
    }

    teamScores.push(
      scoreTeam(
        outputTeam,
        group.records.map((record) => ({
          isBot: record.isBot,
          isDnf: record.isDnf,
          name: record.name,
          sourceIndex: record.sourceIndex,
          time: record.time,
        })),
      ),
    );
  }

  if (outputRows.length === 0) {
    throw new Error("No teams with a human UID were found in the individual results.");
  }

  teamScores.sort((left, right) => {
    const leftTime = Number.isFinite(left.time) ? left.time : Number.POSITIVE_INFINITY;
    const rightTime = Number.isFinite(right.time) ? right.time : Number.POSITIVE_INFINITY;
    return leftTime - rightTime || left.team.localeCompare(right.team);
  });

  return { header, rows: outputRows, teamScores };
}
