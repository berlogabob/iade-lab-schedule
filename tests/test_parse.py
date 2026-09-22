"""Run: uv run python tests/test_parse.py"""
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent / "scripts"))
import fetch  # noqa: E402

# single week, rowspan grid
ls = fetch.parse_page((HERE / "fixture_turma.html").read_text(encoding="utf-8-sig"))
got = sorted((l["date"], l["start"], l["end"]) for l in ls)
assert got == [("2026-12-14", "14:00", "16:30"), ("2026-12-15", "13:00", "17:00"), ("2026-12-16", "13:00", "17:00"),
               ("2026-12-17", "14:00", "16:30"), ("2026-12-18", "13:00", "17:00")], got
l = ls[0]
assert l["course"] == "Exploração Profissional I / Professional Exploration I"
assert l["groups"] == ["LDGL001D01", "LDGL001D02", "LDGL001D03"]
assert l["teachers"] == ["Pedro Machado", "Tânia Fernandes"]
assert l["type"] == "P"
assert l["rooms"] == ["Sala 012 (Oriente)", "Sala 013 (Oriente)", "Sala 014 (Oriente)", "Sala 015 (Oriente)"]

# week range 12/10 - 14/12 (10 weeks), Thursday/Friday widened to 4 columns
html = (HERE / "fixture_multiweek.html").read_text(encoding="utf-8-sig")
ms = fetch.week_mondays(html)
assert len(ms) == 10 and ms[0].isoformat() == "2026-10-12" and ms[-1].isoformat() == "2026-12-14"
ls = fetch.parse_page(html)
first_week = sorted((l["date"], l["start"], l["course"][:12]) for l in ls if l["date"] < "2026-10-19")
assert ("2026-10-15", "13:00", "Fundamentos ") in first_week, first_week  # Thursday
assert len(ls) % 10 == 0

# index link filter keeps names ending with a future week
idx = 'href="turma_A_1_20260921.html?1" href="turma_B_2_2026092120261005.html?1" href="turma_C_3_20260901.html?1"'
assert fetch.find_pages(idx, datetime(2026, 9, 30).date()) == ["turma_B_2_2026092120261005.html"]

# index tree -> programme per group, and degree level
tree = """<li>IADE: Mestrado em Computação Criativa e Inteligência Artificial<ul>
<li>Ano 1<ul>
<li>IADE M-CIA 1ºS<ul>
<li>MCIA001N01<ul>
<li><a href="turma_MCIA001N01_452_20260907.html">Semanas</a></li>
<li>IADE: Licenciatura em Desenvolvimento de Jogos<ul>
<li>LDJO001D01<ul>"""
progs = fetch.group_programmes(tree)
assert progs == {"MCIA001N01": "Mestrado em Computação Criativa e Inteligência Artificial",
                 "LDJO001D01": "Licenciatura em Desenvolvimento de Jogos"}, progs
assert [fetch.degree(x) for x in progs.values()] == ["Master", "Bachelor"]
assert fetch.degree("Erasmus 2022") == "Other"

# lab filter merges groups of the same lesson and ignores other rooms
room = fetch.LAB_ROOMS[0]
base = {"date": "2026-10-01", "start": "09:00", "end": "12:00", "course": "X", "teachers": [], "type": "P",
        "source_url": ""}
lab = fetch.lab_lessons([base | {"groups": ["G1"], "rooms": [room, "Sala 1"]},
                         base | {"groups": ["G2"], "rooms": [room]},
                         base | {"groups": ["G3"], "rooms": ["Sala 1"]}])
assert len(lab) == 1 and lab[0]["groups"] == ["G1", "G2"] and lab[0]["room"] == room

# all-lessons list merges groups per (lesson, rooms) and drops source_url
every = fetch.all_lessons_unique([base | {"groups": ["G1"], "rooms": [room, "Sala 1"]},
                                  base | {"groups": ["G2"], "rooms": [room, "Sala 1"]},
                                  base | {"groups": ["G3"], "rooms": ["Sala 1"]}])
assert len(every) == 2 and all("source_url" not in l for l in every)
assert {tuple(l["groups"]) for l in every} == {("G1", "G2"), ("G3",)}

# ICS: escaping, folding, CRLF, TZID
ics = fetch.render_ics([lab[0] | {"course": "A, B; C " + "é" * 60}], "20260101T000000Z")
assert "SUMMARY:A\\, B\\; C" in ics and "DTSTART;TZID=Europe/Lisbon:20261001T090000" in ics
assert all(len(x.encode()) <= 75 for x in ics.split("\r\n")), "line not folded"
assert "\n" not in ics.replace("\r\n", "")

# bookings calendar: weekly repeat with one skipped date, description fields, UTC -> Lisbon
feed = """BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:a\r\nSUMMARY:Club meeting\r
DTSTART:20261006T160000Z\r\nDTEND:20261006T180000Z\r\nRRULE:FREQ=WEEKLY;COUNT=3\r
EXDATE:20261013T160000Z\r\nDESCRIPTION:Type: Club<br>Group: TechLab\r\nEND:VEVENT\r
BEGIN:VEVENT\r\nUID:b\r\nSUMMARY:Consultation\r\nLOCATION:Sala 1; Sala 2\r
DTSTART:20261007T100000Z\r\nDTEND:20261007T110000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"""
bk = sorted(fetch.bookings(feed, datetime(2026, 10, 1).date()), key=lambda l: l["date"])
assert [l["date"] for l in bk] == ["2026-10-06", "2026-10-07", "2026-10-20"], bk
assert bk[0]["start"] == "17:00" and bk[0]["type"] == "Club" and bk[0]["groups"] == ["TechLab"]
assert bk[0]["rooms"] == fetch.LAB_ROOMS[:1] and bk[1]["rooms"] == ["Sala 1", "Sala 2"]
assert bk[1]["type"] == "Booking" and bk[1]["teachers"] == []
print("ok")
