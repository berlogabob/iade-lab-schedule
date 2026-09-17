"""Scrape IADE class timetables, keep lessons in the lab rooms, write static site + ICS.

Usage: uv run python scripts/fetch.py
"""
import hashlib
import html
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from zoneinfo import ZoneInfo

BASE = "https://horariosturmas.europeia.pt/UE_IADE/HorariosTurmas/"
# Exact room names as they appear on the source site (see rooms.txt).
LAB_ROOMS = [
    "Lab. e Estudo de Jogos - Tech Lab (Oriente)",
]
SITE_TITLE = "IADE Lab Schedule"
TZ = ZoneInfo("Europe/Lisbon")
ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
LINK_RE = re.compile(r'href="(turma_[^"?]+_\d*?(\d{8})\.html)')  # name ends in first+last week
TIME_RE = re.compile(r"^(\d{2}:\d{2})-(\d{2}:\d{2})$")


# ---------- fetch ----------

def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "iade-lab-schedule (+github pages)"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.read().decode("utf-8-sig", errors="replace")
        except OSError:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


def find_pages(index_html, today):
    """Return filenames whose last week is the current week or later."""
    this_monday = today - timedelta(days=today.weekday())
    return sorted({name for name, last in LINK_RE.findall(index_html)
                   if datetime.strptime(last, "%Y%m%d").date() >= this_monday})


# ---------- parse ----------

class _Cells(HTMLParser):
    """Collect table rows as lists of (text, rowspan, colspan)."""

    def __init__(self):
        super().__init__()
        self.rows, self.cell = [], None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "tr":
            self.rows.append([])
        elif tag == "td" and self.rows:
            self.cell = [[], int(a.get("rowspan") or 1), int(a.get("colspan") or 1)]
        elif tag == "br" and self.cell:
            self.cell[0].append("\n")

    def handle_endtag(self, tag):
        if tag == "td" and self.cell:
            text = "".join(self.cell[0]).replace("\xa0", " ")
            self.rows[-1].append((text, self.cell[1], self.cell[2]))
            self.cell = None

    def handle_data(self, data):
        if self.cell:
            self.cell[0].append(data)


def _brackets(line):
    """'[a; (b); c (x)]' -> ['a', 'b', 'c (x)']"""
    parts = [p.strip() for p in line.strip()[1:-1].split(";")]
    return [p[1:-1].strip() if p.startswith("(") and p.endswith(")") else p for p in parts if p]


def parse_cell(text):
    """Lesson cell -> dict. Lines: time, course, [groups], [(teachers)], [type], note."""
    lines = [re.sub(r"\s+", " ", l).strip() for l in text.split("\n")]
    lines = [l for l in lines if l]
    m = TIME_RE.match(lines[0]) if lines else None
    if not m:
        return None
    out = {"start": m[1], "end": m[2], "course": lines[1] if len(lines) > 1 else "",
           "groups": [], "teachers": [], "type": ""}
    for l in lines[2:]:
        if not (l.startswith("[") and l.endswith("]")):
            continue
        if l.startswith("[("):
            out["teachers"] = _brackets(l)
        elif not out["groups"]:
            out["groups"] = _brackets(l)
        else:
            out["type"] = ", ".join(_brackets(l))
    return out


def week_mondays(page_html):
    """'Semanas: 12/10/2026 - 14/12/2026' -> every Monday in that range (inclusive)."""
    found = re.search(r"Semanas:\s*([\d/]+)(?:\s*-\s*([\d/]+))?", page_html)
    first = datetime.strptime(found[1], "%d/%m/%Y").date()
    last = datetime.strptime(found[2], "%d/%m/%Y").date() if found[2] else first
    return [first + timedelta(weeks=i) for i in range((last - first).days // 7 + 1)]


def parse_page(page_html, source_url=""):
    """Weekly grid -> lessons. Handles rowspan, and days widened to 4+ columns by overlaps."""
    p = _Cells()
    p.feed(page_html)
    header = next((i for i, r in enumerate(p.rows) if r and r[0][0].strip() == "Horas"), None)
    if header is None:
        raise ValueError("timetable header row 'Horas' not found")
    day_of_col = [None]  # column 0 = time labels
    for day, (_, _, colspan) in enumerate(p.rows[header][1:]):
        day_of_col += [day] * colspan
    mondays = week_mondays(page_html)
    taken, lessons = set(), []
    for r, row in enumerate(p.rows[header + 1:]):
        col, pending = 0, None
        for text, rowspan, colspan in row:
            while (r, col) in taken:
                col += 1
            for dr in range(rowspan):
                for dc in range(colspan):
                    taken.add((r + dr, col + dc))
            if col > 0:
                if pending:  # the cell right after a lesson holds its rooms
                    rooms = _brackets(text) if text.strip().startswith("[") else [text.strip()]
                    day = day_of_col[pending.pop("_col")]
                    for monday in mondays:
                        lessons.append(pending | {"rooms": rooms, "source_url": source_url,
                                                  "date": (monday + timedelta(days=day)).isoformat()})
                    pending = None
                else:
                    pending = parse_cell(text)
                    if pending:
                        pending["_col"] = col
            col += colspan
    return lessons


# ---------- build ----------

def key(l):
    return (l["date"], l["start"], l["course"], l["room"])


def lab_lessons(all_lessons):
    seen = {}
    for l in all_lessons:
        for room in l["rooms"]:
            if room in LAB_ROOMS:
                item = {k: v for k, v in l.items() if k != "rooms"} | {"room": room}
                k = key(item)
                if k in seen:  # same lesson listed on several groups' pages
                    seen[k]["groups"] = sorted(set(seen[k]["groups"]) | set(item["groups"]))
                else:
                    seen[k] = item
    return sorted(seen.values(), key=lambda l: (l["date"], l["start"], l["room"]))


def all_lessons_unique(all_lessons):
    """Every lesson once (for the filter page); a lesson in several rooms stays one entry."""
    seen = {}
    for l in all_lessons:
        k = (l["date"], l["start"], l["end"], l["course"], tuple(l["rooms"]))
        if k in seen:
            seen[k]["groups"] = sorted(set(seen[k]["groups"]) | set(l["groups"]))
        else:
            seen[k] = {k2: v for k2, v in l.items() if k2 != "source_url"}
    return sorted(seen.values(), key=lambda l: (l["date"], l["start"], l["course"]))


def e(s):
    return html.escape(s, quote=True)


def render(title, lessons, active, updated, empty_msg, before_main=""):
    nav = " | ".join(
        f'<strong>{label}</strong>' if href == active else f'<a href="{href}">{label}</a>'
        for href, label in [("today.html", "Today"), ("week.html", "This week"), ("index.html", "All"), ("filter.html", "Filter")])
    body, current = [], None
    for l in lessons:
        if l["date"] != current:
            if current:
                body.append("</section>")
            current = l["date"]
            d = date.fromisoformat(current)
            body.append(f'<section><h2>{DAYS[d.weekday()]}, {d.day} {d.strftime("%B")} {d.year}</h2>')
        meta = [", ".join(l["teachers"]), ", ".join(l["groups"]), l["type"]]
        body.append(
            f'<article><p class="time">{l["start"]}–{l["end"]}</p>'
            f'<p class="course">{e(l["course"])}</p>'
            + "".join(f"<p>{e(m)}</p>" for m in meta if m)
            + f'<p class="room">{e(l["room"])}</p></article>')
    if current:
        body.append("</section>")
    if not lessons:
        body.append(f'<p class="empty">{empty_msg}</p>')
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)} · {SITE_TITLE}</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<header>
<h1>{SITE_TITLE}</h1>
<p class="rooms">{e(", ".join(LAB_ROOMS))}</p>
<nav>{nav}</nav>
</header>
{before_main}<main>
{chr(10).join(body)}
</main>
<footer>
<p>Data last changed: {updated}</p>
<p><a href="calendar/lab.ics">Subscribe to calendar (.ics)</a> · <a href="{BASE}">Official IADE timetable</a></p>
<p>Unofficial timetable view. Always verify critical scheduling information with the official IADE timetable.</p>
</footer>
</body>
</html>
"""


VTIMEZONE = """BEGIN:VTIMEZONE
TZID:Europe/Lisbon
BEGIN:STANDARD
DTSTART:19701025T020000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
TZOFFSETFROM:+0100
TZOFFSETTO:+0000
TZNAME:WET
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700329T010000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
TZOFFSETFROM:+0000
TZOFFSETTO:+0100
TZNAME:WEST
END:DAYLIGHT
END:VTIMEZONE"""


def ics_text(s):
    return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def fold(line):
    raw, out = line.encode(), []
    while len(raw) > 75:
        cut = 75 if not out else 74
        while (raw[cut] & 0xC0) == 0x80:  # don't split a UTF-8 char
            cut -= 1
        out.append(raw[:cut].decode())
        raw = raw[cut:]
    out.append(raw.decode())
    return "\r\n ".join(out)


def render_ics(lessons, stamp):
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//iade-lab-schedule//EN", "CALSCALE:GREGORIAN",
             "METHOD:PUBLISH", f"X-WR-CALNAME:{SITE_TITLE}", "X-WR-TIMEZONE:Europe/Lisbon",
             *VTIMEZONE.split("\n")]
    for l in lessons:
        d = l["date"].replace("-", "")
        uid = hashlib.sha1("|".join(key(l)).encode()).hexdigest()
        desc = "\n".join(x for x in [", ".join(l["teachers"]), "Groups: " + ", ".join(l["groups"]),
                                     l["type"], l["source_url"]] if x)
        lines += ["BEGIN:VEVENT", f"UID:{uid}@iade-lab-schedule", f"DTSTAMP:{stamp}",
                  f"DTSTART;TZID=Europe/Lisbon:{d}T{l['start'].replace(':', '')}00",
                  f"DTEND;TZID=Europe/Lisbon:{d}T{l['end'].replace(':', '')}00",
                  f"SUMMARY:{ics_text(l['course'])}", f"LOCATION:{ics_text(l['room'])}",
                  f"DESCRIPTION:{ics_text(desc)}", "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return "\r\n".join(fold(x) for x in lines) + "\r\n"


FILTER_FORM = """<form id="filters" data-default-room="{room}">
<label>Room / lab <input name="room" list="room-list" placeholder="any"></label><datalist id="room-list"></datalist>
<label>Professor <input name="teacher" list="teacher-list" placeholder="any"></label><datalist id="teacher-list"></datalist>
<label>Group <input name="group" list="group-list" placeholder="any"></label><datalist id="group-list"></datalist>
<label>Course <input name="course" list="course-list" placeholder="any"></label><datalist id="course-list"></datalist>
<label>Type <select name="type"><option value="">any</option></select></label>
<label>From <input name="from" type="date"></label>
<label>To <input name="to" type="date"></label>
</form>
<noscript><p class="empty">The filter page needs JavaScript. Use Today, This week or All instead.</p></noscript>
<script src="filter.js" defer></script>
"""


def main():
    now = datetime.now(TZ)
    today = now.date()
    pages = find_pages(get(BASE), today)
    print(f"Pages found: {len(pages)}")
    if not pages:
        sys.exit("No timetable pages found. Source format may have changed.")

    def work(name):
        url = BASE + name
        return parse_page(get(url), url)

    all_lessons, failed = [], 0
    with ThreadPoolExecutor(max_workers=4) as pool:  # ponytail: 4 workers keeps load polite
        futures = {name: pool.submit(work, name) for name in pages}
        for name, f in futures.items():
            try:
                all_lessons += [l for l in f.result() if l["date"] >= today.isoformat()]
            except Exception as ex:  # one broken page must not stop the run
                failed += 1
                if failed <= 5:
                    print(f"  failed {name}: {ex!r}", file=sys.stderr)

    rooms = sorted({r for l in all_lessons for r in l["rooms"]})
    print(f"Pages parsed: {len(pages) - failed}\nPages failed: {failed}")
    print(f"Lessons found: {len(all_lessons)}\nUnique rooms: {len(rooms)}")
    # sanity checks: never overwrite a working site with a broken one
    if len(all_lessons) < 10 or failed > len(pages) // 2:
        sys.exit("Too few lessons or too many failures. Source format may have changed.")
    (ROOT / "rooms.txt").write_text("\n".join(rooms) + "\n", encoding="utf-8")

    lab = lab_lessons(all_lessons)
    everything = all_lessons_unique(all_lessons)
    all_json = "[\n" + ",\n".join(json.dumps(l, ensure_ascii=False, separators=(",", ":"))
                                   for l in everything) + "\n]\n"
    all_sha = hashlib.sha1(all_json.encode()).hexdigest()
    print(f"Lab lessons: {len(lab)}")
    if not lab:
        sys.exit(f"No lessons found for LAB_ROOMS={LAB_ROOMS}. Check rooms.txt.")

    data_file = DOCS / "lessons.json"
    old = json.loads(data_file.read_text(encoding="utf-8")) if data_file.exists() else {}
    if old.get("lessons") == lab and old.get("all_sha") == all_sha:
        updated, stamp = old["updated"], old["stamp"]
    else:
        updated = now.strftime("%Y-%m-%d %H:%M")
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    week_end = (today + timedelta(days=6 - today.weekday())).isoformat()
    t = today.isoformat()
    outputs = {  # build everything first, then write
        "index.html": render("All", [l for l in lab if l["date"] >= t], "index.html", updated,
                             "No upcoming lessons."),
        "today.html": render("Today", [l for l in lab if l["date"] == t], "today.html", updated,
                             "No lessons in the lab today."),
        "week.html": render("This week", [l for l in lab if t <= l["date"] <= week_end], "week.html",
                            updated, "No more lessons in the lab this week."),
        "filter.html": render("Filter", [], "filter.html", updated, "Loading…",
                              FILTER_FORM.format(room=e(LAB_ROOMS[0]))),
        "all.json": all_json,
        "calendar/lab.ics": render_ics(lab, stamp),
        "lessons.json": json.dumps({"updated": updated, "stamp": stamp, "all_sha": all_sha, "lessons": lab},
                                   ensure_ascii=False, indent=1) + "\n",
    }
    for name, content in outputs.items():
        path = DOCS / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8", newline="")
    print(f"Wrote {len(outputs)} files to docs/")


if __name__ == "__main__":
    main()
