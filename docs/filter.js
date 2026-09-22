// Filter page: loads all.json, filters in the browser, keeps filters and the view in the URL.
import { DAYS, MONTHS, periodRange, shift, periodLabel, monthCells, layout, startMinutes as minutes }
  from "./calendar.js";

const form = document.getElementById("filters");
const main = document.querySelector("main");
const MAX = 300; // ponytail: render cap, add paging if people need to scroll past it
const box = document.getElementById("filters-box");
const dateNav = document.querySelectorAll("nav [data-range]");
const viewNav = document.querySelectorAll("nav [data-view]");
const periodBox = document.getElementById("period");
let view = "list", anchor = "";
const favList = document.getElementById("fav-list");
const favSave = document.getElementById("fav-save");
const MAX_FAVS = 5;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());

function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}

const FIELDS = { degree: l => l.degrees, programme: l => l.programmes, room: l => l.rooms, teacher: l => l.teachers, group: l => l.groups, course: l => [l.course], type: l => [l.type] };
const options = {};

const shown = {};

// Smart lists: each field only offers values that still have lessons under all the other filters.
function updateLists(lessons, pass) {
  for (const name in FIELDS) {
    const values = new Set();
    lessons.forEach((l, i) => {
      if (pass[i].every((ok, j) => ok || NAMES[j] === name)) FIELDS[name](l).forEach(v => v && values.add(v));
    });
    const sorted = [...values].sort((a, b) => a.localeCompare(b));
    if (shown[name] === sorted.join("\n")) continue; // don't rebuild a list that didn't change
    shown[name] = sorted.join("\n");
    document.getElementById(name + "-list").replaceChildren(new Option("any"), ...sorted.map(v => new Option(v)));
  }
}

const NAMES = Object.keys(FIELDS);
const plainCache = new Map();
const plain = s => { // "computacao" finds "Computação"
  if (!plainCache.has(s)) plainCache.set(s, s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase());
  return plainCache.get(s);
};

// A value picked from the list matches exactly; typed text matches anywhere, ignoring case ("lab" -> every lab).
function matches(name, values, q) {
  if (!q || q === "any") return true;
  if (options[name].has(q)) return values.includes(q);
  q = plain(q);
  return values.some(v => plain(v).includes(q));
}

// Empty the box on focus so the whole list shows; put the old value back if nothing was typed.
function openList(input) {
  let old, typed;
  input.addEventListener("focus", () => { old = input.value; typed = false; input.placeholder = old || "any"; input.value = ""; });
  input.addEventListener("input", () => { typed = true; });
  input.addEventListener("blur", () => { if (!typed) input.value = old; input.placeholder = "any"; });
  input.nextElementSibling.addEventListener("click", () => { // the × button: back to "any"
    old = input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

// Per-browser conveniences; the page works the same if storage is blocked.
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function apply(lessons, query) {
  const params = new URLSearchParams(query);
  for (const input of form.elements) input.value = params.get(input.name) ?? "";
  view = ["day", "week", "month"].includes(params.get("view")) ? params.get("view") : "list";
  anchor = /^\d{4}-\d\d-\d\d$/.test(params.get("date") ?? "") ? params.get("date") : today;
  show(lessons);
}

const datesOf = (from, to) => { // every ISO date from..to
  const out = [];
  for (let d = new Date(from + "T12:00:00Z"); ; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (iso > to) return out;
    out.push(iso);
  }
};

function describe(f, dates) {
  const parts = Object.entries(f).filter(([k, v]) => v && v !== "any" && !(dates && (k === "from" || k === "to")))
    .map(([k, v]) => k === "from" ? "from " + v : k === "to" ? "to " + v : v);
  return (dates ? [dates, ...parts] : parts).join(" · ");
}

function renderFavs(lessons) {
  const favs = load("favs", []);
  favList.replaceChildren(...favs.map((fav, i) => {
    const chip = el("span", "", "fav" + ("?" + fav.query === location.search ? " on" : ""));
    const go = el("button", fav.name);
    go.type = "button";
    go.title = "Show " + fav.name;
    go.onclick = ev => { ev.stopPropagation(); apply(lessons, fav.query); };
    const x = el("button", "×", "fav-x");
    x.type = "button";
    x.setAttribute("aria-label", "Remove favourite " + fav.name);
    x.onclick = ev => { ev.stopPropagation(); favs.splice(i, 1); save("favs", favs); renderFavs(lessons); };
    chip.append(go, x);
    return chip;
  }));
  favSave.disabled = favs.length >= MAX_FAVS;
  favSave.title = favSave.disabled ? `Up to ${MAX_FAVS} favourites. Remove one first.` : "Save the current filters";
}

function saveFav(lessons) {
  const favs = load("favs", []);
  const params = new URLSearchParams(location.search);
  if (params.get("from") === today) params.delete("from"); // "from today" should stay today, not freeze the date
  params.delete("date"); // a favourite opens on the period around today
  const query = params.toString();
  if (favs.length >= MAX_FAVS || favs.some(fav => fav.query === query)) return;
  const name = prompt("Name this favourite", describe(Object.fromEntries(params)) || "Everything");
  if (!name) return;
  favs.push({ name: name.trim().slice(0, 60), query });
  save("favs", favs);
  renderFavs(lessons);
}

// Today / This week / All dates, as [from, to] for the date fields.
function range(name) {
  if (name === "all") return ["", ""];
  if (name === "today") return [today, today];
  const sunday = new Date(today + "T12:00:00Z");
  sunday.setUTCDate(sunday.getUTCDate() + (7 - (sunday.getUTCDay() || 7)));
  return [today, sunday.toISOString().slice(0, 10)];
}

const dayName = date => {
  const d = new Date(date + "T12:00:00Z");
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

const bk = l => l.source === "booking" ? " booking" : "";

const details = l => [l.course, l.rooms.join(", "), l.teachers.join(", "), l.groups.join(", "), l.type]
  .filter(Boolean).join(" · ");

function renderList(hit) {
  const out = [];
  let section, current;
  for (const l of hit.slice(0, MAX)) {
    if (l.date !== current) {
      current = l.date;
      section = el("section");
      section.append(el("h2", dayName(l.date)));
      out.push(section);
    }
    const a = el("article", "", bk(l).trim());
    a.append(el("p", `${l.start}–${l.end}`, "time"), el("p", l.course, "course"));
    for (const m of [l.rooms.join(", "), l.teachers.join(", "), l.groups.join(", "), l.type])
      if (m) a.append(el("p", m));
    section.append(a);
  }
  if (hit.length > MAX) out.push(el("p", `Showing the first ${MAX} of ${hit.length} lessons. Narrow the filters to see more.`, "empty"));
  return out;
}

// Day and week: hour rows down the side, one column per day, overlapping lessons side by side.
function renderGrid(hit, dates) {
  let first = 8 * 60, last = 20 * 60;
  for (const l of hit) { first = Math.min(first, minutes(l.start)); last = Math.max(last, minutes(l.end)); }
  first = Math.floor(first / 60) * 60;
  last = Math.ceil(last / 60) * 60;

  const busy = hit.length > 150 // ponytail: a whole campus week is unreadable as a grid
    ? el("p", `${hit.length} lessons in this period. Narrow the filters to read the grid.`, "empty")
    : null;

  const cal = el("div", "", "cal");
  cal.style.setProperty("--days", dates.length);
  cal.style.setProperty("--rows", (last - first) / 60);

  const head = el("div", "", "cal-head");
  head.append(el("div", "", "cal-corner"));
  for (const date of dates) {
    const d = new Date(date + "T12:00:00Z");
    head.append(el("div", `${DAYS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()}`,
      "cal-day" + (date === today ? " on" : "")));
  }

  const body = el("div", "", "cal-body");
  const gutter = el("div", "", "cal-gutter");
  for (let h = first / 60; h < last / 60; h++) gutter.append(el("div", `${String(h).padStart(2, "0")}:00`, "cal-hour"));
  body.append(gutter);
  for (const date of dates) {
    const col = el("div", "", "cal-col" + (date === today ? " on" : ""));
    for (const { lesson, top, height, left, width } of layout(hit.filter(l => l.date === date), first, last)) {
      const ev = el("div", "", "ev" + bk(lesson));
      ev.style.cssText = `top:${top}%;height:${height}%;left:${left}%;width:${width}%`;
      ev.title = details(lesson);
      ev.append(el("span", `${lesson.start}–${lesson.end}`, "ev-time"), el("span", lesson.course, "ev-course"),
        el("span", [lesson.rooms.join(", "), lesson.teachers.join(", ")].filter(Boolean).join(" · "), "ev-meta"));
      col.append(ev);
    }
    body.append(col);
  }
  cal.append(head, body);
  return busy ? [busy, cal] : [cal];
}

function renderMonth(hit, lessons) {
  const cells = monthCells(anchor);
  const [from, to] = periodRange("month", anchor);
  const byDate = new Map();
  for (const l of hit) byDate.set(l.date, [...(byDate.get(l.date) ?? []), l]);

  const grid = el("div", "", "month");
  for (const name of [1, 2, 3, 4, 5, 6, 0]) grid.append(el("div", DAYS[name].slice(0, 3), "month-head"));
  for (const date of cells) {
    const cell = el("div", "", "month-cell" + (date < from || date > to ? " other" : "") + (date === today ? " on" : ""));
    cell.append(el("div", String(Number(date.slice(8))), "month-num"));
    const day = (byDate.get(date) ?? []).sort((a, b) => a.start.localeCompare(b.start));
    for (const l of day.slice(0, 3)) {
      const line = el("div", "", "month-ev" + bk(l));
      line.title = details(l);
      line.append(el("span", l.start, "ev-time"), el("span", l.course, "ev-course"));
      cell.append(line);
    }
    if (day.length > 3) cell.append(el("div", `+${day.length - 3} more`, "month-more"));
    cell.onclick = () => { view = "day"; anchor = date; show(lessons); };
    grid.append(cell);
  }
  return [grid];
}

function show(lessons) {
  const f = Object.fromEntries(new FormData(form));
  const [from, to] = view === "list" ? [f.from, f.to] : periodRange(view, anchor);
  // pass[i][j]: lesson i passes field j (the date range counts as one more field)
  const pass = lessons.map(l => [...NAMES.map(name => matches(name, FIELDS[name](l), f[name])),
    (!from || l.date >= from) && (!to || l.date <= to)]);
  const hit = lessons.filter((l, i) => pass[i].every(Boolean));
  updateLists(lessons, pass);
  let out = view === "list" ? renderList(hit)
    : view === "month" ? renderMonth(hit, lessons)
      : renderGrid(hit, view === "day" ? [anchor] : datesOf(from, to));
  if (!hit.length && view === "list") out = [el("p", "No lessons match these filters.", "empty")];
  main.replaceChildren(...out);
  for (const b of viewNav) b.classList.toggle("on", b.dataset.view === view);
  for (const label of document.querySelectorAll(".date-field")) label.hidden = view !== "list";
  document.getElementById("ranges").hidden = view !== "list";
  periodBox.hidden = view === "list";
  if (view !== "list") document.getElementById("period-label").textContent = periodLabel(view, anchor);
  const params = new URLSearchParams(Object.entries(f).filter(([k, v]) => (v && v !== "any") || k === "room").map(([k, v]) => [k, v === "any" ? "" : v]));
  if (view !== "list") params.set("view", view), params.set("date", anchor);
  history.replaceState(null, "", "?" + params); // room always present, so "any room" survives a reload
  const preset = ["today", "week", "all"].find(r => range(r).join() === [f.from, f.to].join());
  const active = describe(f, preset && preset !== "all" && (preset === "today" ? "Today" : "This week"));
  document.getElementById("summary-text").textContent = "Filters" + (active ? ": " + active : "");
  for (const b of dateNav) b.classList.toggle("on", range(b.dataset.range).join() === [f.from, f.to].join());
  renderFavs(lessons);
}

fetch("all.json").then(r => r.json()).then(lessons => {
  for (const name in FIELDS) {
    options[name] = new Set(lessons.flatMap(FIELDS[name]).filter(Boolean));
    openList(form.elements[name]);
  }
  const params = new URLSearchParams(location.search);
  if (!params.size) params.set("room", form.dataset.defaultRoom), params.set("from", today);
  apply(lessons, params);
  favSave.onclick = ev => { ev.stopPropagation(); saveFav(lessons); };
  for (const b of dateNav) b.onclick = () => {
    [form.from.value, form.to.value] = range(b.dataset.range);
    show(lessons);
  };
  for (const b of viewNav) b.onclick = () => {
    if (view === "list" && b.dataset.view !== "list" && form.from.value) anchor = form.from.value;
    view = b.dataset.view;
    show(lessons);
  };
  document.getElementById("prev").onclick = () => { anchor = shift(view, anchor, -1); show(lessons); };
  document.getElementById("next").onclick = () => { anchor = shift(view, anchor, 1); show(lessons); };
  document.getElementById("now").onclick = () => { anchor = today; show(lessons); };
  box.open = load("filtersOpen", true);
  box.addEventListener("toggle", () => save("filtersOpen", box.open));
  form.addEventListener("input", () => show(lessons));
  form.addEventListener("submit", ev => ev.preventDefault());
}).catch(() => main.replaceChildren(el("p", "Could not load the timetable data.", "empty")));
