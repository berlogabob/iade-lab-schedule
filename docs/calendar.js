// Date maths and overlap layout for the calendar views. No DOM, so node can test it.
export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December"];

const d = iso => new Date(iso + "T12:00:00Z"); // noon: no DST edge to trip over
const iso = date => date.toISOString().slice(0, 10);
const monday = date => {
  const m = new Date(date);
  m.setUTCDate(m.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return m;
};

export function periodRange(view, anchor) {
  const a = d(anchor);
  if (view === "day") return [anchor, anchor];
  if (view === "week") {
    const first = monday(a), last = new Date(first);
    last.setUTCDate(last.getUTCDate() + 6);
    return [iso(first), iso(last)];
  }
  const first = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1, 12));
  const last = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 0, 12));
  return [iso(first), iso(last)];
}

export function shift(view, anchor, step) {
  const a = d(anchor);
  if (view === "day") a.setUTCDate(a.getUTCDate() + step);
  else if (view === "week") a.setUTCDate(a.getUTCDate() + 7 * step);
  else a.setUTCMonth(a.getUTCMonth() + step, 1);
  return iso(a);
}

export function periodLabel(view, anchor) {
  const a = d(anchor);
  if (view === "day") return `${DAYS[a.getUTCDay()]}, ${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()}`;
  if (view === "month") return `${MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()}`;
  const [from, to] = periodRange("week", anchor).map(d);
  const left = from.getUTCMonth() === to.getUTCMonth() ? `${from.getUTCDate()}` :
    `${from.getUTCDate()} ${MONTHS[from.getUTCMonth()]}`;
  return `${left}–${to.getUTCDate()} ${MONTHS[to.getUTCMonth()]} ${to.getUTCFullYear()}`;
}

// Every date of the month grid: whole weeks, Monday first, including neighbouring days.
export function monthCells(anchor) {
  const [from, to] = periodRange("month", anchor);
  const cells = [];
  for (let day = monday(d(from)); iso(day) <= to || cells.length % 7; day.setUTCDate(day.getUTCDate() + 1))
    cells.push(iso(day));
  return cells;
}

const minutes = hhmm => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// One day's lessons placed in percent of the day column: overlapping ones sit side by side.
export function layout(dayLessons, dayStart, dayEnd) {
  const span = dayEnd - dayStart;
  const sorted = [...dayLessons].sort((a, b) => minutes(a.start) - minutes(b.start) || minutes(a.end) - minutes(b.end));
  const out = [];
  let cluster = [], clusterEnd = -1;
  const place = () => { // split one cluster of overlapping lessons into columns
    const columns = [];
    for (const l of cluster) {
      let c = columns.findIndex(col => minutes(col[col.length - 1].end) <= minutes(l.start));
      if (c < 0) c = columns.push([]) - 1;
      columns[c].push(l);
      l._col = c;
    }
    for (const l of cluster) {
      out.push({
        lesson: l,
        top: (minutes(l.start) - dayStart) / span * 100,
        height: Math.max(minutes(l.end) - minutes(l.start), 20) / span * 100,
        left: l._col / columns.length * 100,
        width: 100 / columns.length,
      });
      delete l._col;
    }
    cluster = [];
  };
  for (const l of sorted) {
    if (cluster.length && minutes(l.start) >= clusterEnd) place();
    cluster.push(l);
    clusterEnd = Math.max(clusterEnd, minutes(l.end));
  }
  if (cluster.length) place();
  return out;
}

export const startMinutes = minutes;
