// Filter page: loads all.json, filters in the browser, keeps filters in the URL (?room=...&teacher=...).
const form = document.getElementById("filters");
const main = document.querySelector("main");
const MAX = 300; // ponytail: render cap, add paging if people need to scroll past it
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December"];
const box = document.getElementById("filters-box");
const dateNav = document.querySelectorAll("nav [data-range]");
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
  show(lessons);
}

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

function show(lessons) {
  const f = Object.fromEntries(new FormData(form));
  // pass[i][j]: lesson i passes field j (the date range counts as one more field)
  const pass = lessons.map(l => [...NAMES.map(name => matches(name, FIELDS[name](l), f[name])),
    (!f.from || l.date >= f.from) && (!f.to || l.date <= f.to)]);
  const hit = lessons.filter((l, i) => pass[i].every(Boolean));
  updateLists(lessons, pass);
  const out = [];
  let section, current;
  for (const l of hit.slice(0, MAX)) {
    if (l.date !== current) {
      current = l.date;
      const d = new Date(l.date + "T12:00:00Z");
      section = el("section");
      section.append(el("h2", `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`));
      out.push(section);
    }
    const a = el("article");
    a.append(el("p", `${l.start}–${l.end}`, "time"), el("p", l.course, "course"));
    for (const m of [l.rooms.join(", "), l.teachers.join(", "), l.groups.join(", "), l.type])
      if (m) a.append(el("p", m));
    section.append(a);
  }
  if (!hit.length) out.push(el("p", "No lessons match these filters.", "empty"));
  if (hit.length > MAX) out.push(el("p", `Showing the first ${MAX} of ${hit.length} lessons. Narrow the filters to see more.`, "empty"));
  main.replaceChildren(...out);
  const params = new URLSearchParams(Object.entries(f).filter(([k, v]) => (v && v !== "any") || k === "room").map(([k, v]) => [k, v === "any" ? "" : v]));
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
  box.open = load("filtersOpen", true);
  box.addEventListener("toggle", () => save("filtersOpen", box.open));
  form.addEventListener("input", () => show(lessons));
  form.addEventListener("submit", ev => ev.preventDefault());
}).catch(() => main.replaceChildren(el("p", "Could not load the timetable data.", "empty")));
