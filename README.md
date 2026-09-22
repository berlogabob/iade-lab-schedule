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
- `docs/index.html`, the main page, which filters every IADE lesson (`docs/all.json`) by degree (Bachelor, Master, PhD), programme, room or lab, professor, group, course, type and dates. Programmes come from the headings in the official index page. It shows results as a list or as a day, week or month calendar grid (`view=day|week|month` and `date=YYYY-MM-DD` in the address). It is the only page that uses JavaScript (`docs/filter.js`, with the date and overlap maths in `docs/calendar.js`), and it keeps the chosen filters in the URL, so a view like `?teacher=José+Graça` can be bookmarked or left open on a TV. Up to 5 filter sets can be saved as favourites (stored in the browser), and the filter block can be collapsed. `filter.html` redirects there for old links
- `docs/calendar/lab.ics`
- `docs/lessons.json`, which holds the data and is used to detect changes
- `rooms.txt`, which lists every room name on the source site

GitHub Actions runs it every 6 hours and commits only when output changes. If the source looks broken, the script exits with an error before writing anything, so the published site keeps the last good version.

## Run locally

```bash
uv sync
uv run python tests/test_parse.py
node tests/test_calendar.mjs
uv run python scripts/fetch.py
open docs/today.html
```

The main page loads `all.json` with `fetch()`, which browsers block for `file://` pages. Serve the folder to test it:

```bash
uv run python -m http.server -d docs
```

Then open http://localhost:8000/.

It uses the Python standard library plus `recurring-ical-events` (and `icalendar`) for the bookings calendar.

## Change the lab

Pick exact names from `rooms.txt` and put them in `LAB_ROOMS` at the top of `scripts/fetch.py`.

## Bookings

Confirmed lab bookings (student consultations, club meetings, extra classes, events) come from a separate Google Calendar and appear everywhere lessons do: the main page, the lab pages and `lab.ics`. On the site they're shown in blue (`--booking` in `docs/style.css`), which pairs with the red accent, so they stand apart from the official timetable.

Setup, once:

1. In Google Calendar, create a new calendar called "IADE Lab Bookings". Don't use your main calendar.
2. In its settings, turn on "Make available to public".
3. Copy the **Public address in iCal format** into `BOOKINGS_ICS` at the top of `scripts/fetch.py`. Never use the secret address, because this repository is public.

Everything on that calendar is public, so keep personal details out of event titles.

To add a booking, create an event on that calendar:

- **Title**: what shows as the course, for example "Project consultation".
- **Location**: exact room names from `rooms.txt`, separated by `;`. Leave it empty for the lab.
- **Description**: optional lines `Type: Club`, `Group: TechLab`, `Teacher: Prof. Silva`. The type defaults to `Booking`.
- Repeating events work. All-day events are ignored.

The site picks up bookings on its next run, which happens every 6 hours. To publish sooner, open Actions → Update schedule → Run workflow. If the calendar can't be read, the run fails and the site keeps its last version.

The main page checks for a new `all.json` on every load (`cache: "no-cache"`), so new bookings appear as soon as GitHub Pages has deployed, usually within a minute or two of the run. The Today, This week and All pages are plain HTML that browsers may keep for up to 10 minutes. Refresh them if a booking is missing.

## Subscribe

- Google Calendar: go to Other calendars, choose From URL, and paste the .ics link.
- Apple Calendar: choose File, then New Calendar Subscription.
- Outlook: choose Add calendar, then Subscribe from web.

## Maintenance

GitHub disables scheduled workflows after 60 days without repository activity. If updates stop, re-enable the workflow in the Actions tab.
