import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { addCalendarDays, dateKey, isDateOnlyString, parseDateOnly, shortDate, todayKey } from "../src/lib/format.js";

const formatUrl = new URL("../src/lib/format.js", import.meta.url).href;
const attentionUrl = new URL("../src/lib/attentionItems.js", import.meta.url).href;

function inZone(tz, body) {
  const script = `
    const format = await import(${JSON.stringify(formatUrl)});
    const attention = await import(${JSON.stringify(attentionUrl)});
    const out = await (${body})(format, attention);
    process.stdout.write(JSON.stringify(out));
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    env: { ...process.env, TZ: tz },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

describe("date-only helper", () => {
  it("keeps a date-only string on that calendar day", () => {
    assert.equal(isDateOnlyString("2026-03-01"), true);
    assert.equal(dateKey("2026-03-01"), "2026-03-01");
    const noon = parseDateOnly("2026-03-01");
    assert.equal(noon.getDate(), 1);
    assert.equal(noon.getMonth(), 2);
    assert.equal(noon.getHours(), 12);
    assert.match(shortDate("2026-03-01"), /Mar/);
    assert.match(shortDate("2026-03-01"), /1/);
  });

  it("uses the local calendar day of a timestamp", () => {
    const stamp = "2026-03-01T07:30:00.000Z";
    assert.equal(isDateOnlyString(stamp), false);
    const local = parseDateOnly(stamp);
    const expected = new Date(stamp);
    assert.equal(local.getFullYear(), expected.getFullYear());
    assert.equal(local.getMonth(), expected.getMonth());
    assert.equal(local.getDate(), expected.getDate());
    assert.equal(dateKey(stamp), dateKey(expected));
  });

  it("steps across a month boundary without UTC conversion", () => {
    assert.equal(addCalendarDays("2026-02-28", 1), "2026-03-01");
    assert.equal(addCalendarDays("2026-03-01", -1), "2026-02-28");
    assert.equal(addCalendarDays("2026-03-31", 1), "2026-04-01");
  });

  it("todayKey is the local calendar day, not a UTC slice", () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    assert.equal(todayKey(now), `${y}-${m}-${d}`);
  });
});

describe("date-only helper across time zones", () => {
  const zones = ["America/Los_Angeles", "America/New_York", "Pacific/Auckland"];

  for (const tz of zones) {
    it(`keeps date-only days, DST, and month boundaries in ${tz}`, () => {
      const out = inZone(tz, `async (format) => {
        const utcMidnight = new Date("2026-03-01T00:00:00.000Z");
        const springForward = "2026-03-08";
        return {
          dateOnly: format.dateKey("2026-03-01"),
          monthStartShort: format.shortDate("2026-03-01"),
          timestampDay: format.dateKey("2026-03-01T04:30:00.000Z"),
          utcMidnightDay: format.dateKey(utcMidnight.toISOString()),
          dstDay: format.dateKey(springForward),
          dstShort: format.shortDate(springForward),
          afterDst: format.addCalendarDays("2026-03-07", 1),
          monthStep: format.addCalendarDays("2026-02-28", 1),
          back: format.addCalendarDays("2026-03-01", -1),
        };
      }`);
      assert.equal(out.dateOnly, "2026-03-01");
      assert.match(out.monthStartShort, /Mar/);
      assert.match(out.monthStartShort, /\b1\b/);
      assert.equal(out.dstDay, "2026-03-08");
      assert.match(out.dstShort, /Mar/);
      assert.match(out.dstShort, /\b8\b/);
      assert.equal(out.afterDst, "2026-03-08");
      assert.equal(out.monthStep, "2026-03-01");
      assert.equal(out.back, "2026-02-28");
      if (tz === "America/Los_Angeles" || tz === "America/New_York") {
        assert.equal(out.timestampDay, "2026-02-28");
        assert.equal(out.utcMidnightDay, "2026-02-28");
      }
      if (tz === "Pacific/Auckland") {
        assert.equal(out.timestampDay, "2026-03-01");
        assert.equal(out.utcMidnightDay, "2026-03-01");
      }
    });

    it(`places tomorrow from a date-only today in ${tz}`, () => {
      const out = inZone(tz, `async (format, attention) => {
        const rows = attention.buildAttentionItems({
          today: "2026-03-01",
          jobs: [{ id: "j1", title: "Fence", status: "Prep", start_date: "2026-03-02" }],
          estimates: [],
          changeOrders: [],
          invoices: [],
          expenses: [],
        });
        return {
          tomorrow: format.addCalendarDays("2026-03-01", 1),
          scheduled: rows.some((row) => row.id === "sched-j1" && row.detail === "Scheduled tomorrow"),
        };
      }`);
      assert.equal(out.tomorrow, "2026-03-02");
      assert.equal(out.scheduled, true);
    });
  }
});
