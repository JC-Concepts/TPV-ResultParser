#!/usr/bin/env python3
"""Scrape team list from TPV Hub API endpoint."""
import urllib.request
import json

URL = "https://tpvirtualhub.com/api/teams"

def main():
    try:
        with urllib.request.urlopen(URL, timeout=15) as resp:
            data = resp.read().decode("utf-8", errors="ignore")
        teams = json.loads(data)
        print(f"Total teams fetched: {len(teams)}")
        names = []
        for item in teams:
            if isinstance(item, dict):
                name = item.get("name") or item.get("teamName") or item.get("title") or item.get("label")
                if name:
                    names.append(name)
            elif isinstance(item, str):
                names.append(item)
        print(f"Team names extracted: {len(names)}")
        if names:
            print("Sample:", names[:10])
        with open("teams_list.json", "w", encoding="utf-8") as f:
            json.dump(names, f, indent=2)
        print("Saved to teams_list.json")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
