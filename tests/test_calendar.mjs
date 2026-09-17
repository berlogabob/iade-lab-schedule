// Run: node tests/test_calendar.mjs
import assert from "node:assert";
import { periodRange, shift, periodLabel, monthCells, layout } from "../docs/calendar.js";

// periods
assert.deepEqual(periodRange("day", "2026-09-17"), ["2026-09-17", "2026-09-17"]);
assert.deepEqual(periodRange("week", "2026-09-17"), ["2026-09-14", "2026-09-20"]); // Thursday -> Mon..Sun
assert.deepEqual(periodRange("week", "2026-09-14"), ["2026-09-14", "2026-09-20"]); // Monday stays
assert.deepEqual(periodRange("week", "2026-09-20"), ["2026-09-14", "2026-09-20"]); // Sunday stays
assert.deepEqual(periodRange("month", "2026-02-10"), ["2026-02-01", "2026-02-28"]);

// stepping
assert.equal(shift("day", "2026-12-31", 1), "2027-01-01");
assert.equal(shift("week", "2026-09-17", -1), "2026-09-10");
assert.equal(shift("month", "2026-01-31", 1), "2026-02-01"); // no 31 February
assert.equal(shift("month", "2026-01-15", -1), "2025-12-01");

// labels
assert.equal(periodLabel("day", "2026-09-17"), "Thursday, 17 September 2026");
assert.equal(periodLabel("week", "2026-09-17"), "14–20 September 2026");
assert.equal(periodLabel("week", "2026-09-30"), "28 September–4 October 2026"); // across months
assert.equal(periodLabel("month", "2026-09-17"), "September 2026");

// month grid: whole weeks, Monday first, includes neighbouring days
const cells = monthCells("2026-09-17");
assert.equal(cells.length % 7, 0);
assert.equal(cells[0], "2026-08-31"); // Monday before 1 September
assert.equal(cells.at(-1), "2026-10-04");
assert.ok(cells.includes("2026-09-30"));

// layout: percent of the 08:00-20:00 window
const at = (start, end, course) => ({ start, end, course });
const one = layout([at("08:00", "20:00", "A")], 480, 1200)[0];
assert.deepEqual([one.top, one.height, one.left, one.width], [0, 100, 0, 100]);

const two = layout([at("09:00", "11:00", "A"), at("10:00", "12:00", "B")], 480, 1200);
assert.deepEqual(two.map(x => [x.lesson.course, x.left, x.width]), [["A", 0, 50], ["B", 50, 50]]);

const apart = layout([at("09:00", "10:00", "A"), at("10:00", "11:00", "B")], 480, 1200);
assert.deepEqual(apart.map(x => [x.lesson.course, x.left, x.width]), [["A", 0, 100], ["B", 0, 100]]);

const nested = layout([at("09:00", "13:00", "A"), at("10:00", "11:00", "B"), at("11:00", "12:00", "C")], 480, 1200);
assert.deepEqual(nested.map(x => [x.lesson.course, x.left, x.width]),
  [["A", 0, 50], ["B", 50, 50], ["C", 50, 50]]); // B and C don't overlap: same column

const half = layout([at("09:00", "11:00", "A")], 480, 1200)[0];
assert.equal(half.top, (540 - 480) / 720 * 100);
assert.equal(half.height, 120 / 720 * 100);

console.log("ok");
