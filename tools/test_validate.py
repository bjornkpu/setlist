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


if __name__ == "__main__":
    unittest.main()
