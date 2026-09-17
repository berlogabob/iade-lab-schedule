# IADE Schedule

Static timetable for every IADE class, filterable by degree, programme, room, professor, group, course, type and date, plus a calendar feed for the game lab, **Lab. e Estudo de Jogos - Tech Lab (Oriente)**.

- Site: https://berlogabob.github.io/iade-lab-schedule/
- Calendar (.ics): https://berlogabob.github.io/iade-lab-schedule/calendar/lab.ics
- Source: https://horariosturmas.europeia.pt/UE_IADE/HorariosTurmas/

> This is an unofficial timetable view.
> Always verify critical scheduling information with the official IADE timetable.

## How it works

`scripts/fetch.py` reads the official index page and downloads every class timetable page from the current week onward. It parses the weekly grids, keeps lessons held in the rooms listed in `LAB_ROOMS`, and writes:

- `docs/today.html`, `docs/week.html` and `docs/all.html`, which show the lab only and are plain HTML and CSS with no JavaScript
- `docs/index.html`, the main page, which filters every IADE lesson (`docs/all.json`) by degree (Bachelor, Master, PhD), programme, room or lab, professor, group, course, type and dates. Programmes come from the headings in the official index page. It is the only page that uses JavaScript (`docs/filter.js`), and it keeps the chosen filters in the URL, so a view like `?teacher=José+Graça` can be bookmarked or left open on a TV. Up to 5 filter sets can be saved as favourites (stored in the browser), and the filter block can be collapsed. `filter.html` redirects there for old links
- `docs/calendar/lab.ics`
- `docs/lessons.json`, which holds the data and is used to detect changes
- `rooms.txt`, which lists every room name on the source site

GitHub Actions runs it every 6 hours and commits only when output changes. If the source looks broken, the script exits with an error before writing anything, so the published site keeps the last good version.

## Run locally

```bash
uv sync
uv run python tests/test_parse.py
uv run python scripts/fetch.py
open docs/today.html
```

The main page loads `all.json` with `fetch()`, which browsers block for `file://` pages. Serve the folder to test it:

```bash
uv run python -m http.server -d docs
```

Then open http://localhost:8000/.

It uses only the Python standard library.

## Change the lab

Pick exact names from `rooms.txt` and put them in `LAB_ROOMS` at the top of `scripts/fetch.py`.

## Subscribe

- Google Calendar: go to Other calendars, choose From URL, and paste the .ics link.
- Apple Calendar: choose File, then New Calendar Subscription.
- Outlook: choose Add calendar, then Subscribe from web.

## Maintenance

GitHub disables scheduled workflows after 60 days without repository activity. If updates stop, re-enable the workflow in the Actions tab.
