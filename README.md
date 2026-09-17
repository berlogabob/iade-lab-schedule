# IADE Lab Schedule

Static timetable and calendar feed for the IADE game lab, **Lab. e Estudo de Jogos - Tech Lab (Oriente)**.

- Site: https://berlogabob.github.io/iade-lab-schedule/
- Calendar (.ics): https://berlogabob.github.io/iade-lab-schedule/calendar/lab.ics
- Source: https://horariosturmas.europeia.pt/UE_IADE/HorariosTurmas/

> This is an unofficial timetable view.
> Always verify critical scheduling information with the official IADE timetable.

## How it works

`scripts/fetch.py` reads the official index page and downloads every class timetable page from the current week onward. It parses the weekly grids, keeps lessons held in the rooms listed in `LAB_ROOMS`, and writes:

- `docs/index.html`, `docs/today.html` and `docs/week.html`, which are plain HTML and CSS with no JavaScript
- `docs/filter.html`, which filters every IADE lesson (`docs/all.json`) by room or lab, professor, group, course, type and dates. It is the only page that uses JavaScript (`docs/filter.js`), and it keeps the chosen filters in the URL, so a view like `filter.html?teacher=José+Graça` can be bookmarked or left open on a TV
- `docs/calendar/lab.ics`
- `docs/lessons.json`, which holds the data and is used to detect changes
- `rooms.txt`, which lists every room name on the source site

GitHub Actions runs it every 6 hours and commits only when output changes. If the source looks broken, the script exits with an error before writing anything, so the published site keeps the last good version.

## Run locally

```bash
uv sync
uv run python tests/test_parse.py
uv run python scripts/fetch.py
open docs/index.html
```

The filter page loads `all.json` with `fetch()`, which browsers block for `file://` pages. Serve the folder to test it:

```bash
uv run python -m http.server -d docs
```

Then open http://localhost:8000/filter.html.

It uses only the Python standard library.

## Change the lab

Pick exact names from `rooms.txt` and put them in `LAB_ROOMS` at the top of `scripts/fetch.py`.

## Subscribe

- Google Calendar: go to Other calendars, choose From URL, and paste the .ics link.
- Apple Calendar: choose File, then New Calendar Subscription.
- Outlook: choose Add calendar, then Subscribe from web.

## Maintenance

GitHub disables scheduled workflows after 60 days without repository activity. If updates stop, re-enable the workflow in the Actions tab.
