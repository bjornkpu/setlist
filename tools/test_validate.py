"""Tests for validate.py. Run from repo root:
uv run python -m unittest discover -s tools -v
"""
import unittest

import validate


def make_event(eid, start, duration, room, persons=None, title=None):
    return {
        "guid": f"guid-{eid}",
        "id": eid,
        "date": f"2026-08-26T{start}:00+02:00",
        "start": start,
        "duration": duration,
        "room": room,
        "title": f"Event {eid}" if title is None else title,
        "persons": [] if persons is None else persons,
    }


def base_schedule():
    """Minimal valid one-day schedule: two talks in Sal 1, one anchor."""
    kari = [{"id": 1, "public_name": "Kari Nordmann"}]
    return {
        "schedule": {
            "version": "1.0",
            "conference": {
                "title": "Test Conf",
                "acronym": "test",
                "start": "2026-08-26",
                "end": "2026-08-26",
                "daysCount": 1,
                "time_zone_name": "Europe/Oslo",
                "rooms": ["Sal 1", "Fellesareal"],
                "days": [
                    {
                        "index": 0,
                        "date": "2026-08-26",
                        "day_start": "2026-08-26T08:00:00+02:00",
                        "day_end": "2026-08-26T18:00:00+02:00",
                        "rooms": {
                            "Sal 1": [
                                make_event(1, "10:00", "00:50", "Sal 1", persons=kari),
                                make_event(2, "11:00", "00:50", "Sal 1", persons=kari),
                            ],
                            "Fellesareal": [
                                make_event(3, "12:00", "00:50", "Fellesareal"),
                            ],
                        },
                    }
                ],
            },
        }
    }


def run(root):
    return validate.validate(root)


def paths(report, level="ERROR"):
    return [p for lvl, p, m in report.findings if lvl == level]


class StructureTests(unittest.TestCase):
    def test_valid_schedule_has_no_errors(self):
        self.assertEqual(run(base_schedule()).errors, [])

    def test_missing_conference_is_error(self):
        root = base_schedule()
        del root["schedule"]["conference"]
        self.assertTrue(any("conference" in p for p in paths(run(root))))

    def test_missing_event_duration_is_error(self):
        root = base_schedule()
        del root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][0]["duration"]
        self.assertTrue(
            any(p.endswith("[0].duration") for p in paths(run(root)))
        )

    def test_rooms_not_a_dict_is_error(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["rooms"] = []
        self.assertTrue(any(p.endswith("].rooms") for p in paths(run(root))))


class DurationTests(unittest.TestCase):
    def test_minutes_style_duration_is_error(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][0]["duration"] = "50"
        report = run(root)
        self.assertTrue(any(p.endswith("[0].duration") for p in paths(report)))
        msg = [m for lvl, p, m in report.findings if p.endswith("[0].duration")][0]
        self.assertIn("minutes", msg)

    def test_malformed_duration_is_error(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][0]["duration"] = "0:75"
        self.assertTrue(any(p.endswith("[0].duration") for p in paths(run(root))))

    def test_long_duration_is_warning(self):
        root = base_schedule()
        ev = root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][1]
        ev["duration"] = "05:00"
        self.assertTrue(any(p.endswith("[1].duration") for p in paths(run(root), "WARN")))

    def test_anchor_long_duration_not_warned(self):
        root = base_schedule()
        ev = root["schedule"]["conference"]["days"][0]["rooms"]["Fellesareal"][0]
        ev["duration"] = "05:00"
        self.assertFalse(any("Fellesareal" in p for p in paths(run(root), "WARN")))


class TimeTests(unittest.TestCase):
    def _ev(self, root, room="Sal 1", i=0):
        return root["schedule"]["conference"]["days"][0]["rooms"][room][i]

    def test_unparseable_date_is_error(self):
        root = base_schedule()
        self._ev(root)["date"] = "26/08/2026 10:00"
        self.assertTrue(any(p.endswith("[0].date") for p in paths(run(root))))

    def test_start_disagreeing_with_date_is_error(self):
        root = base_schedule()
        self._ev(root)["start"] = "10:30"  # date still says 10:00
        self.assertTrue(any(p.endswith("[0].start") for p in paths(run(root))))

    def test_event_before_day_start_is_error(self):
        root = base_schedule()
        ev = self._ev(root)
        ev["date"] = "2026-08-26T07:00:00+02:00"
        ev["start"] = "07:00"
        self.assertTrue(any(p.endswith("[0].date") for p in paths(run(root))))

    def test_event_ending_after_day_end_is_warning(self):
        root = base_schedule()
        ev = self._ev(root, i=1)
        ev["date"] = "2026-08-26T17:30:00+02:00"
        ev["start"] = "17:30"
        ev["duration"] = "01:00"  # ends 18:30, day_end 18:00
        self.assertTrue(any(p.endswith("[1].duration") for p in paths(run(root), "WARN")))


class IdTests(unittest.TestCase):
    def test_duplicate_guid_is_error(self):
        root = base_schedule()
        rooms = root["schedule"]["conference"]["days"][0]["rooms"]
        rooms["Sal 1"][1]["guid"] = rooms["Sal 1"][0]["guid"]
        self.assertTrue(any(p.endswith("[1].guid") for p in paths(run(root))))

    def test_duplicate_id_is_error(self):
        root = base_schedule()
        rooms = root["schedule"]["conference"]["days"][0]["rooms"]
        rooms["Fellesareal"][0]["id"] = rooms["Sal 1"][0]["id"]
        report = run(root)
        self.assertTrue(any(".id" in p for p in paths(report)))


if __name__ == "__main__":
    unittest.main()
