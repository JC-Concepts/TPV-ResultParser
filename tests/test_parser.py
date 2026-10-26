import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "parser"))

from process import process_csv, load_known_teams

class TestParser(unittest.TestCase):
    def test_load_teams(self):
        teams = load_known_teams()
        self.assertIn("Jarvis Cycling Club", teams)
        self.assertIn("JCC", teams)

    def test_process_with_race_name(self):
        import tempfile, csv
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["EventKey","Pen","Position","Name","Team","Country","Time","DeltaTime","Distance","DeltaDistance","Points","Gender","UID","ARR","ARRBand","EventRating","EventRatingBand","AgeBand","NGB","NGB ID","UCI ID"])
            writer.writerow(["122653","0","7","Lem Curran","Team Lou","USA","3066.917","46.689","36720.644","0","0","Male","4C4549B1EEBD85F0","1088","Gold 1","1162","Gold 2","50-54","",""])
            temp_path = f.name
        out_path = Path("test_output.csv")
        process_csv(Path("SampleData/Sample Data - Raw.csv"), out_path, race_name="R1 Long")
        self.assertTrue(out_path.exists())
        race_path = Path("results_R1_Long.csv")
        self.assertTrue(race_path.exists())
        out_path.unlink(missing_ok=True)
        race_path.unlink(missing_ok=True)

    def test_rename_map(self):
        import tempfile, csv
        temp_path = "test_rename_input.csv"
        with open(temp_path, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["EventKey","Pen","Position","Name","Team","Country","Time","DeltaTime","Distance","DeltaDistance","Points","Gender","UID","ARR","ARRBand","EventRating","EventRatingBand","AgeBand","NGB","NGB ID","UCI ID"])
            writer.writerow(["122653","0","7","Lem Curran","Unknown Team","USA","3066.917","46.689","36720.644","0","0","Male","4C4549B1EEBD85F0","1088","Gold 1","1162","Gold 2","50-54","",""])
        out_path = Path("test_rename.csv")
        process_csv(Path("SampleData/Sample Data - Raw.csv"), out_path, rename_map={"Unknown Team": "Team Unknown Dev"})
        with open(out_path, newline="") as f:
            reader = csv.reader(f)
            rows = list(reader)
        team_col = rows[0].index("Team")
        team_names = [r[team_col] for r in rows[1:] if r]
        self.assertIn("Team Unknown Dev", team_names)
        out_path.unlink(missing_ok=True)
        Path(temp_path).unlink(missing_ok=True)

if __name__ == "__main__":
    unittest.main()
