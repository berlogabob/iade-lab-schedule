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

function fill(list, values) {
  for (const v of [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b)))
    list.append(new Option(v, v));
}

function show(lessons) {
  const f = Object.fromEntries(new FormData(form));
  const hit = lessons.filter(l =>
    (!f.room || l.rooms.includes(f.room)) && (!f.teacher || l.teachers.includes(f.teacher)) &&
    (!f.group || l.groups.includes(f.group)) && (!f.course || l.course === f.course) &&
    (!f.type || l.type === f.type) && (!f.from || l.date >= f.from) && (!f.to || l.date <= f.to));
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
  const params = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
  history.replaceState(null, "", params.size ? "?" + params : location.pathname);
}

fetch("all.json").then(r => r.json()).then(lessons => {
  fill(document.getElementById("room-list"), lessons.flatMap(l => l.rooms));
  fill(document.getElementById("teacher-list"), lessons.flatMap(l => l.teachers));
  fill(document.getElementById("group-list"), lessons.flatMap(l => l.groups));
  fill(document.getElementById("course-list"), lessons.map(l => l.course));
  fill(form.elements.type, lessons.map(l => l.type));
  const params = new URLSearchParams(location.search);
  if (!params.size) params.set("room", form.dataset.defaultRoom), params.set("from", today);
  for (const [k, v] of params) if (form.elements[k]) form.elements[k].value = v;
  show(lessons);
  form.addEventListener("input", () => show(lessons));
  form.addEventListener("submit", ev => ev.preventDefault());
}).catch(() => main.replaceChildren(el("p", "Could not load the timetable data.", "empty")));
