import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { readCsvInputs } from "../parser/browser-file-loader.js";
import {
  parseCsv,
  processCsvText,
  scoreTeam,
  stringifyCsv,
} from "../parser/browser-parser.js";

const rawSampleUrl = new URL("../SampleData/Sample Data - Raw.csv", import.meta.url);
const uploadSampleUrl = new URL(
  "../SampleData/Sample Data - Upload Ready.csv",
  import.meta.url,
);
const teamListUrl = new URL("../teams_list.json", import.meta.url);
const sampleFilesAvailable =
  existsSync(fileURLToPath(rawSampleUrl)) && existsSync(fileURLToPath(uploadSampleUrl));
const teamListAvailable = existsSync(fileURLToPath(teamListUrl));
const rawSample = sampleFilesAvailable
  ? await readFile(rawSampleUrl, "utf8")
  : "";
const uploadSample = sampleFilesAvailable
  ? await readFile(uploadSampleUrl, "utf8")
  : "";
const knownTeams = teamListAvailable
  ? JSON.parse(await readFile(teamListUrl, "utf8"))
  : null;

test("parses quoted CSV values, escaped quotes, and embedded newlines", () => {
  const input = 'Name,Team,Note\r\nRider,"Team, One","said ""hello""\nthere"\r\n';
  assert.deepEqual(parseCsv(input), [
    ["Name", "Team", "Note"],
    ["Rider", "Team, One", 'said "hello"\nthere'],
  ]);
  assert.equal(
    parseCsv(stringifyCsv([["Name", "Team"], ["Rider", "Team, One"]]))[1][1],
    "Team, One",
  );
});

test("scores the third finisher when the human is within ten seconds", () => {
  const score = scoreTeam("Test Team", [
    { isBot: true, name: "Bot 1", sourceIndex: 0, time: 100 },
    { isBot: true, name: "Bot 2", sourceIndex: 1, time: 101 },
    { isBot: true, name: "Bot 3", sourceIndex: 2, time: 102 },
    { isBot: false, name: "Human", sourceIndex: 3, time: 110 },
  ]);

  assert.equal(score.time, 102);
  assert.equal(score.scoringRider, "Bot 3");
  assert.equal(score.rule, "Third finisher");
});

test("moves the scoring place down until a human is within ten seconds", () => {
  const score = scoreTeam("Test Team", [
    { isBot: true, name: "Bot 1", sourceIndex: 0, time: 100 },
    { isBot: true, name: "Bot 2", sourceIndex: 1, time: 101 },
    { isBot: true, name: "Bot 3", sourceIndex: 2, time: 102 },
    { isBot: true, name: "Bot 4", sourceIndex: 3, time: 104 },
    { isBot: false, name: "Human", sourceIndex: 4, time: 113.5 },
  ]);

  assert.equal(score.time, 104);
  assert.equal(score.scoringRider, "Bot 4");
  assert.match(score.rule, /1 leading bot removed/);
});

test("reports a team without a third finisher as unscored", () => {
  const score = scoreTeam("Small Team", [
    { isBot: false, name: "Human", sourceIndex: 0, time: 100 },
    { isBot: true, name: "Bot", sourceIndex: 1, time: 101 },
  ]);

  assert.equal(score.time, null);
  assert.equal(score.rule, "Fewer than three finishers");
});

test("processes the raw sample into the upload-ready individual-results format", {
  skip: !sampleFilesAvailable,
}, () => {
  const result = processCsvText(rawSample, { knownTeams });
  const expectedHeader = parseCsv(uploadSample)[0];
  const teamColumn = result.header.indexOf("Team");
  const uidColumn = result.header.indexOf("UID");
  const teams = new Set(result.rows.map((row) => row[teamColumn]));

  assert.deepEqual(result.header, expectedHeader);
  assert.deepEqual(result.rows, parseCsv(uploadSample).slice(1));
  assert.equal(result.rows.length, 12);
  assert.deepEqual([...teams].sort(), ["Mapperley CC", "Team Lou"]);
  assert.ok(result.rows.some((row) => row[uidColumn].startsWith("Bot")));
  assert.ok(result.teamScores.every((score) => Number.isFinite(score.time)));
  assert.deepEqual(
    result.teamScores.map((score) => [score.team, score.time]),
    [
      ["Team Lou", 3067.327],
      ["Mapperley CC", 3382.772],
    ],
  );
});

test("renames an unknown sample team for every rider, including its bots", {
  skip: !sampleFilesAvailable,
}, () => {
  const result = processCsvText(rawSample, {
    knownTeams: [],
    renameFrom: "Team Lou",
    renameTo: "Team Lou Demo",
  });
  const teamColumn = result.header.indexOf("Team");
  const uidColumn = result.header.indexOf("UID");
  const renamedRows = result.rows.filter((row) => row[teamColumn] === "Team Lou Demo");

  assert.equal(renamedRows.length, 6);
  assert.ok(renamedRows.some((row) => row[uidColumn].startsWith("Bot")));
  assert.ok(
    result.rows.some((row) => row[teamColumn] === "Team David Ellis"),
  );
});

test("extracts CSV members from ZIP files without writing them to disk", {
  skip: !sampleFilesAvailable,
}, async () => {
  const archive = new JSZip();
  archive.file("race-one/Raw Results.csv", rawSample);
  archive.file("notes.txt", "Ignored non-CSV file");
  const bytes = await archive.generateAsync({ type: "uint8array" });
  const file = {
    name: "race-batch.zip",
    size: bytes.byteLength,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };

  const extracted = await readCsvInputs([file], JSZip);
  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].name, "race-one/Raw Results.csv");
  assert.equal(processCsvText(extracted[0].text, { knownTeams: null }).rows.length, 12);
});

test("creates a ZIP download containing upload-ready CSV data", {
  skip: !sampleFilesAvailable,
}, async () => {
  const result = processCsvText(rawSample, { knownTeams });
  const csv = stringifyCsv([result.header, ...result.rows]);
  const outputArchive = new JSZip();
  outputArchive.file("R1 Long.csv", csv);
  const bytes = await outputArchive.generateAsync({ type: "uint8array" });
  const reopened = await JSZip.loadAsync(bytes);
  const downloadedCsv = await reopened.file("R1 Long.csv").async("string");

  assert.deepEqual(parseCsv(downloadedCsv), parseCsv(uploadSample));
});
