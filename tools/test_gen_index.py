import json
import tempfile
import unittest
from pathlib import Path

from gen_index import build_index


def schedule(title, start, end):
    return {"schedule": {"conference": {"title": title, "start": start, "end": end, "days": []}}}


class GenIndexTests(unittest.TestCase):
    def test_builds_entries_and_skips_junk(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = Path(tmp)
            (d / "a-conf.json").write_text(json.dumps(schedule("A", "2026-01-01", "2026-01-02")), encoding="utf-8")
            (d / "b-conf.json").write_text(json.dumps(schedule("B", "2026-02-01", "2026-02-01")), encoding="utf-8")
            (d / "index.json").write_text("{}", encoding="utf-8")
            (d / "junk.json").write_text("not json", encoding="utf-8")
            (d / "notes.txt").write_text("ignore", encoding="utf-8")
            index, skipped = build_index(d, "Test")
            self.assertEqual(index["version"], "1.0")
            self.assertEqual(index["name"], "Test")
            self.assertEqual([s["id"] for s in index["schedules"]], ["a-conf", "b-conf"])
            self.assertEqual(index["schedules"][0]["url"], "a-conf.json")
            self.assertEqual(index["schedules"][0]["title"], "A")
            self.assertEqual(index["schedules"][0]["start"], "2026-01-01")
            self.assertEqual(index["schedules"][0]["end"], "2026-01-02")
            self.assertEqual(len(skipped), 1)
            self.assertIn("junk.json", skipped[0])

    def test_real_conferences_dir(self):
        conf_dir = Path(__file__).resolve().parent.parent / "conferences"
        index, skipped = build_index(conf_dir, "x")
        self.assertEqual(skipped, [])
        self.assertIn("fagfestival-2026", [s["id"] for s in index["schedules"]])


if __name__ == "__main__":
    unittest.main()
