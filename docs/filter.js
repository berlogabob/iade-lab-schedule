// Filter page: loads all.json, filters in the browser, keeps filters in the URL (?room=...&teacher=...).
const form = document.getElementById("filters");
const main = document.querySelector("main");
const MAX = 300; // ponytail: render cap, add paging if people need to scroll past it
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December"];
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());

function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}

const FIELDS = { degree: l => l.degrees, programme: l => l.programmes, room: l => l.rooms, teacher: l => l.teachers, group: l => l.groups, course: l => [l.course], type: l => [l.type] };
const options = {};

function fill(name, lessons) {
  options[name] = new Set(lessons.flatMap(FIELDS[name]).filter(Boolean));
  const list = document.getElementById(name + "-list");
  list.append(new Option("any"));
  for (const v of [...options[name]].sort((a, b) => a.localeCompare(b))) list.append(new Option(v));
}

const plain = s => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase(); // "computacao" finds "Computação"

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
}

function show(lessons) {
  const f = Object.fromEntries(new FormData(form));
  const hit = lessons.filter(l =>
    Object.keys(FIELDS).every(name => matches(name, FIELDS[name](l), f[name])) &&
    (!f.from || l.date >= f.from) && (!f.to || l.date <= f.to));
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
}

fetch("all.json").then(r => r.json()).then(lessons => {
  for (const name in FIELDS) fill(name, lessons), openList(form.elements[name]);
  const params = new URLSearchParams(location.search);
  if (!params.size) params.set("room", form.dataset.defaultRoom), params.set("from", today);
  for (const [k, v] of params) if (form.elements[k]) form.elements[k].value = v;
  show(lessons);
  form.addEventListener("input", () => show(lessons));
  form.addEventListener("submit", ev => ev.preventDefault());
}).catch(() => main.replaceChildren(el("p", "Could not load the timetable data.", "empty")));
