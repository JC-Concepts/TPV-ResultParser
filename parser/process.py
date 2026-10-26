#!/usr/bin/env python3
"""TPV Result Parser — filters, scores, renames, and outputs by race."""
import csv
import sys
import json
from pathlib import Path


def load_known_teams():
    KNOWN = set()
    try:
        with open("teams_list.json", "r", encoding="utf-8") as f:
            team_list = json.load(f)
        KNOWN = set(team_list)
        for t in team_list:
            words = t.split()
            if len(words) >= 2:
                # Short form: first letter of each word that starts with uppercase
                short = "".join(w[0] for w in words)
                if short:
                    KNOWN.add(short)
            # Also add any explicit short form if present in original data
            # (e.g., if JSON has both name and shortName fields)
    except Exception:
        KNOWN = {"eCykle Klub Danmark", "ECKD"}
    return KNOWN


def process_csv(input_path: Path, output_path: Path, race_name: str = "", rename_map: dict = None):
    rename_map = rename_map or {}
    KNOWN_TEAMS = load_known_teams()

    with open(input_path, newline="", encoding="utf-8") as f_in:
        reader = csv.reader(f_in)
        rows = list(reader)

    header_idx = None
    for i, row in enumerate(rows):
        if row and len(row) > 10 and "UID" in row:
            header_idx = i
            header = row
            break
    if header_idx is None:
        raise ValueError("Could not find Overall Individual Results header with UID column")

    print(f"Header index: {header_idx}, Header: {header}")
    data_rows = rows[header_idx + 1:] if header_idx is not None else []
    print(f"Data rows count: {len(data_rows)}")
    filtered = []
    for row in data_rows:
        if not row or all(cell.strip() == "" for cell in row):
            continue
        if len(row) < len(header):
            continue
        try:
            uid_idx = header.index("UID")
        except ValueError:
            uid_idx = 11
        uid = row[uid_idx].strip() if uid_idx < len(row) else ""
        print(f"Row {len(filtered)}: uid_idx={uid_idx}, uid='{uid}', len={len(row)}, header_len={len(header)}")
        if uid == "":
            print("  Skipped: empty uid")
            continue
        filtered.append(row)

    team_idx = header.index("Team") if "Team" in header else 3
    uid_idx = header.index("UID") if "UID" in header else 11
    name_idx = header.index("Name") if "Name" in header else 4

    # Group by original team (before rename) to detect humans
    original_team_has_human = {}
    for row in filtered:
        team = row[team_idx].strip() if team_idx < len(row) else ""
        uid = row[uid_idx].strip() if uid_idx < len(row) else ""
        if team not in original_team_has_human:
            original_team_has_human[team] = False
        if not uid.startswith("Bot") and uid != "":
            original_team_has_human[team] = True

    print(f"Filtered rows: {len(filtered)}")
    print(f"Original team humans: {original_team_has_human}")
    result_rows = [header]
    for row in filtered:
        # Find original team name before rename
        current_team = row[team_idx].strip() if team_idx < len(row) else ""
        original_name = current_team
        for k, v in rename_map.items():
            if v == current_team:
                original_name = k
                break
        if original_team_has_human.get(original_name, False):
            result_rows.append(row)

    # Apply rename to included rows
    for row in result_rows[1:]:
        team = row[team_idx].strip() if team_idx < len(row) else ""
        for k, v in rename_map.items():
            if team == k:
                row[team_idx] = v
                break

    # Rename unknown teams
    team_first_human = {}
    for row in filtered:
        team = row[team_idx].strip() if team_idx < len(row) else ""
        uid = row[uid_idx].strip() if uid_idx < len(row) else ""
        name = row[name_idx].strip() if name_idx < len(row) else ""
        if original_team_has_human.get(team, False) and team not in team_first_human:
            if not uid.startswith("Bot") and uid != "":
                team_first_human[team] = name

    for row in result_rows[1:]:
        team = row[team_idx].strip() if team_idx < len(row) else ""
        if team not in KNOWN_TEAMS and team in team_first_human:
            first, last = team_first_human[team].split(" ", 1)
            row[team_idx] = f"Team {first} {last}"

    with open(output_path, "w", newline="", encoding="utf-8") as f_out:
        writer = csv.writer(f_out)
        for row in result_rows:
            writer.writerow(row)

    if race_name:
        race_file = Path(f"results_{race_name.replace(' ', '_')}.csv")
        with open(race_file, "a", newline="", encoding="utf-8") as f_race:
            writer_race = csv.writer(f_race)
            if f_race.tell() == 0:
                writer_race.writerow(header)
            for row in result_rows[1:]:
                writer_race.writerow(row)
        # Sort by Time column
        with open(race_file, newline="", encoding="utf-8") as f_read:
            reader_race = csv.reader(f_read)
            race_header = next(reader_race)
            race_data = list(reader_race)
        time_idx = race_header.index("Time") if "Time" in race_header else 4
        race_data.sort(key=lambda r: float(r[time_idx]) if r[time_idx] else float('inf'))
        with open(race_file, "w", newline="", encoding="utf-8") as f_write:
            writer_sort = csv.writer(f_write)
            writer_sort.writerow(race_header)
            for row in race_data:
                writer_sort.writerow(row)
        print(f"Race results updated: {race_file}")

    print(f"Processed {input_path} -> {output_path}")


if __name__ == "__main__":
    in_file = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("SampleData/Sample Data - Raw.csv")
    out_file = Path("output_new.csv")
    race = sys.argv[3] if len(sys.argv) > 3 else ""
    rename = {}
    if len(sys.argv) > 4:
        for pair in sys.argv[4].split(","):
            if "=" in pair:
                k, v = pair.split("=", 1)
                rename[k.strip()] = v.strip()
    process_csv(in_file, out_file, race_name=race, rename_map=rename)
