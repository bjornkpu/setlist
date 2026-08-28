"""Tests for validate.py. Run from repo root:
uv run python -m unittest discover -s tools -v
"""
import copy
import json
import pathlib
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


class RoomTests(unittest.TestCase):
    def test_case_variant_room_names_is_error(self):
        root = base_schedule()
        rooms = root["schedule"]["conference"]["days"][0]["rooms"]
        ev = make_event(9, "13:00", "00:50", "sal 1")
        rooms["sal 1"] = [ev]
        report = run(root)
        self.assertTrue(any("case" in m.lower() for lvl, p, m in report.findings if lvl == "ERROR"))

    def test_event_room_mismatching_map_key_is_error(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][0]["room"] = "Sal 2"
        self.assertTrue(any(p.endswith("[0].room") for p in paths(run(root))))


class OverlapTests(unittest.TestCase):
    def test_overlap_within_room_is_error(self):
        root = base_schedule()
        ev = root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][1]
        ev["date"] = "2026-08-26T10:30:00+02:00"
        ev["start"] = "10:30"  # event 1 runs 10:00-10:50
        self.assertTrue(any("overlap" in m for lvl, p, m in run(root).findings if lvl == "ERROR"))

    def test_parallel_rooms_do_not_overlap(self):
        root = base_schedule()
        rooms = root["schedule"]["conference"]["days"][0]["rooms"]
        rooms["Fellesareal"][0]["date"] = "2026-08-26T10:00:00+02:00"
        rooms["Fellesareal"][0]["start"] = "10:00"  # same time as Sal 1 event
        self.assertEqual(run(root).errors, [])

    def test_back_to_back_is_not_overlap(self):
        root = base_schedule()
        ev = root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][1]
        ev["date"] = "2026-08-26T10:50:00+02:00"
        ev["start"] = "10:50"  # starts exactly when event 1 ends
        self.assertEqual(run(root).errors, [])


class DaysTests(unittest.TestCase):
    def test_day_date_outside_conference_range_is_error(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["date"] = "2026-08-27"
        self.assertTrue(any(".date" in p for p in paths(run(root))))

    def test_days_count_mismatch_is_error(self):
        root = base_schedule()
        root["schedule"]["conference"]["end"] = "2026-08-27"  # 2-day span, 1 day listed
        self.assertTrue(any("days" in p for p in paths(run(root))))

    def test_dayscount_field_mismatch_is_error(self):
        root = base_schedule()
        root["schedule"]["conference"]["daysCount"] = 3
        self.assertTrue(any("daysCount" in p for p in paths(run(root))))


class WarningTests(unittest.TestCase):
    def test_empty_title_is_warning(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][0]["title"] = ""
        report = run(root)
        self.assertTrue(any(p.endswith("[0].title") for p in paths(report, "WARN")))
        self.assertEqual(report.errors, [])

    def test_missing_speakers_outside_anchor_room_is_warning(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][0]["persons"] = []
        self.assertTrue(any(p.endswith("[0].persons") for p in paths(run(root), "WARN")))

    def test_anchor_without_speakers_is_fine(self):
        report = run(base_schedule())  # Fellesareal event has no persons
        self.assertFalse(any("Fellesareal" in p for p in paths(report, "WARN")))


class MalformedEventTests(unittest.TestCase):
    def test_non_dict_event_reports_error_not_crash(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"].append("not an event")
        report = run(root)  # must not raise
        self.assertTrue(any("not an object" in m for lvl, p, m in report.findings if lvl == "ERROR"))


class MalformedInputTests(unittest.TestCase):
    def test_naive_day_start_is_error_not_crash(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["day_start"] = "2026-08-26T08:00:00"  # no offset
        report = run(root)  # must not raise
        self.assertTrue(any(p.endswith(".day_start") for p in paths(report)))

    def test_naive_day_end_is_error_not_crash(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["day_end"] = "2026-08-26T18:00:00"  # no offset
        report = run(root)  # must not raise
        self.assertTrue(any(p.endswith(".day_end") for p in paths(report)))

    def test_days_as_string_does_not_crash(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"] = "not a list"
        report = run(root)  # must not raise
        self.assertTrue(any(p.endswith("days") for p in paths(report)))

    def test_non_dict_day_entry_is_error_not_crash(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"].append("not a day")
        report = run(root)  # must not raise
        self.assertTrue(any("day is not an object" in m for lvl, p, m in report.findings if lvl == "ERROR"))

    def test_list_guid_is_error_not_crash(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][0]["guid"] = ["oops"]
        report = run(root)  # must not raise
        self.assertTrue(any(p.endswith("[0].guid") for p in paths(report)))

    def test_non_list_room_value_is_error(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"] = "nope"
        report = run(root)
        self.assertTrue(any('rooms["Sal 1"]' in p for p in paths(report)))


class RoomDriftTests(unittest.TestCase):
    def test_room_only_in_conference_rooms_is_error(self):
        root = base_schedule()
        root["schedule"]["conference"]["rooms"].append("Ghost Room")
        report = run(root)
        self.assertTrue(any("Ghost Room" in m for lvl, p, m in report.findings if lvl == "ERROR"))

    def test_room_only_in_days_is_error(self):
        root = base_schedule()
        rooms = root["schedule"]["conference"]["days"][0]["rooms"]
        rooms["Loft"] = [make_event(10, "14:00", "00:30", "Loft")]
        report = run(root)
        self.assertTrue(any("Loft" in m for lvl, p, m in report.findings if lvl == "ERROR"))

    def test_conference_rooms_as_objects_with_name_key_is_fine(self):
        root = base_schedule()
        root["schedule"]["conference"]["rooms"] = [{"name": "Sal 1"}, {"name": "Fellesareal"}]
        self.assertEqual(run(root).errors, [])


class ThinConformanceTests(unittest.TestCase):
    def test_unknown_event_field_is_warning(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][0]["bogus_field"] = "x"
        report = run(root)
        self.assertTrue(any(p.endswith(".bogus_field") for p in paths(report, "WARN")))
        self.assertEqual(report.errors, [])

    def test_known_fields_do_not_warn(self):
        report = run(base_schedule())
        self.assertFalse(any("unknown" in m.lower() for lvl, p, m in report.findings if lvl == "WARN"))

    def test_person_without_public_name_is_warning(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][0]["persons"] = [{"id": 1}]
        report = run(root)
        self.assertTrue(any("public_name" in m for lvl, p, m in report.findings if lvl == "WARN"))

    def test_person_as_string_is_warning(self):
        root = base_schedule()
        root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][0]["persons"] = ["Kari Nordmann"]
        report = run(root)
        self.assertTrue(any("public_name" in m for lvl, p, m in report.findings if lvl == "WARN"))


class EndTimeDurationTests(unittest.TestCase):
    def test_end_time_style_duration_is_error(self):
        root = base_schedule()
        ev = root["schedule"]["conference"]["days"][0]["rooms"]["Sal 1"][0]
        ev["start"] = "10:00"
        ev["date"] = "2026-08-26T10:00:00+02:00"
        ev["duration"] = "12:00"  # looks like an end time, not a real 12h session
        report = run(root)
        self.assertTrue(any("end time" in m for lvl, p, m in report.findings if lvl == "ERROR"))

    def test_long_but_plausible_duration_after_late_start_is_not_error(self):
        root = base_schedule()
        ev = root["schedule"]["conference"]["days"][0]["rooms"]["Fellesareal"][0]
        ev["start"] = "17:00"
        ev["date"] = "2026-08-26T17:00:00+02:00"
        ev["duration"] = "06:00"  # dinner: 6h < 17h start, must stay clean of the end-time error
        report = run(root)
        self.assertFalse(any("end time" in m for lvl, p, m in report.findings if lvl == "ERROR"))


class OverlapBucketingTests(unittest.TestCase):
    def test_duplicate_day_entries_are_not_merged_into_one_overlap_bucket(self):
        root = base_schedule()
        days = root["schedule"]["conference"]["days"]
        days.append(copy.deepcopy(days[0]))  # accidental duplicate day entry, same index/date
        report = run(root)
        self.assertFalse(any("overlap" in m for lvl, p, m in report.findings if lvl == "ERROR"))


if __name__ == "__main__":
    unittest.main()
