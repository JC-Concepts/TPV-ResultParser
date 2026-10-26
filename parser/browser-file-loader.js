const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_CSV_FILES = 100;
const MAX_TOTAL_CSV_CHARACTERS = 100 * 1024 * 1024;

export async function readCsvInputs(files, zipLibrary) {
  if (files.length === 0) throw new Error("Select at least one CSV or ZIP file.");
  const csvInputs = [];
  let totalCharacters = 0;

  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(`${file.name} exceeds the 100 MB per-file limit.`);
    }

    if (/\.csv$/i.test(file.name)) {
      const text = await file.text();
      totalCharacters += text.length;
      csvInputs.push({ name: file.name, text });
    } else if (/\.zip$/i.test(file.name)) {
      if (!zipLibrary) {
        throw new Error("The ZIP reader did not load. Refresh the page and try again.");
      }

      let archive;
      try {
        archive = await zipLibrary.loadAsync(await file.arrayBuffer());
      } catch (error) {
        throw new Error(`Could not open ${file.name}: ${error.message}`);
      }

      const entries = Object.values(archive.files)
        .filter((entry) => !entry.dir && /\.csv$/i.test(entry.name))
        .sort((left, right) => left.name.localeCompare(right.name));
      if (entries.length === 0) {
        throw new Error(`${file.name} does not contain any CSV files.`);
      }

      for (const entry of entries) {
        let text;
        try {
          text = await entry.async("string");
        } catch (error) {
          throw new Error(`Could not read ${entry.name} in ${file.name}: ${error.message}`);
        }
        totalCharacters += text.length;
        csvInputs.push({ name: entry.name, text });
        if (csvInputs.length > MAX_CSV_FILES) {
          throw new Error(`A batch can contain no more than ${MAX_CSV_FILES} CSV files.`);
        }
        if (totalCharacters > MAX_TOTAL_CSV_CHARACTERS) {
          throw new Error("The uncompressed CSV content exceeds the 100 MB batch limit.");
        }
      }
    } else {
      throw new Error(`${file.name} is not a CSV or ZIP file.`);
    }

    if (csvInputs.length > MAX_CSV_FILES) {
      throw new Error(`A batch can contain no more than ${MAX_CSV_FILES} CSV files.`);
    }
    if (totalCharacters > MAX_TOTAL_CSV_CHARACTERS) {
      throw new Error("The uncompressed CSV content exceeds the 100 MB batch limit.");
    }
  }

  return csvInputs;
}
