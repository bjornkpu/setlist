import json
import unittest
from pathlib import Path

from sessionize_to_frab import convert


def fixture():
    return {
        "sessions": [
            {"id": "101", "title": "Talk A", "description": "About A",
             "startsAt": "2026-10-19T09:00:00", "endsAt": "2026-10-19T09:45:00",
             "isServiceSession": False, "speakers": ["sp-1"], "roomId": 1},
            {"id": "102", "title": "Registration", "description": None,
             "startsAt": "2026-10-19T08:00:00", "endsAt": "2026-10-19T09:00:00",
             "isServiceSession": True, "speakers": [], "roomId": 2},
            {"id": "103", "title": "Day 2 talk", "description": "",
             "startsAt": "2026-10-20T10:00:00", "endsAt": "2026-10-20T11:30:00",
             "isServiceSession": False, "speakers": ["sp-1", "sp-2"], "roomId": 1},
            {"id": "104", "title": "Unscheduled", "startsAt": None, "endsAt": None,
             "speakers": [], "roomId": None},
        ],
        "speakers": [
            {"id": "sp-1", "fullName": "Kari Nordmann"},
            {"id": "sp-2", "fullName": "Ola Nordmann"},
        ],
        "rooms": [{"id": 2, "name": "Fellesareal"}, {"id": 1, "name": "Aurora"}],
        "questions": [], "categories": [],
    }


class ConvertTests(unittest.TestCase):
    def setUp(self):
        self.conf = convert(fixture(), "Test Conf", "tc26", "+02:00", "Europe/Oslo")["schedule"]["conference"]

    def test_conference_frame(self):
        self.assertEqual(self.conf["title"], "Test Conf")
        self.assertEqual(self.conf["start"], "2026-10-19")
        self.assertEqual(self.conf["end"], "2026-10-20")
        self.assertEqual(self.conf["daysCount"], 2)
        self.assertEqual(self.conf["time_zone_name"], "Europe/Oslo")
        self.assertEqual(self.conf["rooms"], ["Fellesareal", "Aurora"])  # sessionize order, used only

    def test_events_and_days(self):
        day1 = self.conf["days"][0]
        self.assertEqual(day1["index"], 0)
        self.assertEqual(day1["date"], "2026-10-19")
        self.assertEqual(day1["day_start"], "2026-10-19T08:00:00+02:00")
        self.assertEqual(day1["day_end"], "2026-10-19T09:45:00+02:00")
        talk = day1["rooms"]["Aurora"][0]
        self.assertEqual(talk["id"], 101)
        self.assertEqual(talk["start"], "09:00")
        self.assertEqual(talk["duration"], "00:45")
        self.assertEqual(talk["date"], "2026-10-19T09:00:00+02:00")
        self.assertEqual(talk["abstract"], "About A")
        self.assertEqual(talk["persons"], [{"id": 1, "public_name": "Kari Nordmann"}])
        reg = day1["rooms"]["Fellesareal"][0]
        self.assertEqual(reg["persons"], [])
        self.assertEqual(reg["duration"], "01:00")
        self.assertEqual(reg["abstract"], "")

    def test_speaker_ids_stable_and_unscheduled_dropped(self):
        day2 = self.conf["days"][1]
        talk = day2["rooms"]["Aurora"][0]
        self.assertEqual(talk["duration"], "01:30")
        self.assertEqual(talk["persons"][0], {"id": 1, "public_name": "Kari Nordmann"})
        self.assertEqual(talk["persons"][1], {"id": 2, "public_name": "Ola Nordmann"})
        total = sum(len(v) for d in self.conf["days"] for v in d["rooms"].values())
        self.assertEqual(total, 3)  # unscheduled session dropped

    def test_guid_deterministic(self):
        again = convert(fixture(), "Test Conf", "tc26", "+02:00", "Europe/Oslo")["schedule"]["conference"]
        g1 = self.conf["days"][0]["rooms"]["Aurora"][0]["guid"]
        g2 = again["days"][0]["rooms"]["Aurora"][0]["guid"]
        self.assertEqual(g1, g2)
        self.assertEqual(len({g1, self.conf["days"][0]["rooms"]["Fellesareal"][0]["guid"]}), 2)


class RealPayloadTests(unittest.TestCase):
    def test_real_tdc_payload_validates_clean(self):
        src = Path(__file__).resolve().parent / "sources" / "trondheimdc-2026-sessionize.json"
        data = json.loads(src.read_text(encoding="utf-8"))
        root = convert(data, "Trondheim Developer Conference 2026", "tdc2026", "+02:00", "Europe/Oslo")
        import validate
        report = validate.validate(root)
        self.assertEqual([f for f in report.findings if f[0] == "ERROR"], [], report.render())


if __name__ == "__main__":
    unittest.main()
