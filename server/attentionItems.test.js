import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { buildAttentionItems } from "../src/lib/attentionItems.js";
import {
  clearDismissals,
  dismissItem,
  filterDismissed,
  isDismissed,
  loadDismissals,
  saveDismissals,
} from "../src/lib/notificationDismissals.js";

before(() => {
  if (typeof globalThis.localStorage !== "undefined") return;
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => {
      mem.set(k, String(v));
    },
    removeItem: (k) => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
  };
});

describe("buildAttentionItems", () => {
  it("surfaces unassigned receipts, estimate approval, payment, and schedule", () => {
    const rows = buildAttentionItems({
      today: "2026-09-21",
      tomorrow: "2026-09-22",
      jobs: [
        { id: "j1", title: "Kitchen", phase: "working", status: "Estimate" },
        { id: "j2", title: "Deck", phase: "working", status: "Prep", start_date: "2026-09-21" },
      ],
      estimates: [{ id: "e1", job_id: "j1", status: "sent" }],
      changeOrders: [],
      invoices: [{ id: "i1", job_id: "j1", number: "INV-1", status: "sent", balance_due: 250, total: 250 }],
      expenses: [{ id: "x1", photo_url: "/f/r.jpg", job_id: null, amount: 42 }],
    });

    assert.equal(rows[0].id, "receipts-inbox");
    assert.equal(rows[0].to, "/receipts");
    assert.ok(rows.some((r) => r.id === "action-j1" && r.detail.includes("Estimate awaiting approval")));
    assert.ok(rows.some((r) => r.id === "inv-i1" && r.tone === "payment"));
    assert.ok(rows.some((r) => r.id === "sched-j2" && r.detail === "Scheduled today"));
  });

  it("skips schedule row when the job is already an action item", () => {
    const rows = buildAttentionItems({
      today: "2026-09-21",
      tomorrow: "2026-09-22",
      jobs: [{ id: "j1", title: "Kitchen", phase: "working", status: "Blocked", start_date: "2026-09-21" }],
      estimates: [],
      changeOrders: [],
      invoices: [],
      expenses: [],
    });
    assert.ok(rows.some((r) => r.id === "action-j1"));
    assert.ok(!rows.some((r) => r.id === "sched-j1"));
  });
});

describe("notificationDismissals", () => {
  it("filters by id + detail fingerprint and reappears when detail changes", () => {
    const key = "test-account-notifications";
    clearDismissals(key);
    const item = { id: "receipts-inbox", detail: "Unassigned in Receipts inbox · latest $42.00" };
    const map = dismissItem(key, item);
    assert.equal(isDismissed(item, map), true);
    assert.equal(filterDismissed([item], map).length, 0);

    const changed = { ...item, detail: "Unassigned in Receipts inbox · latest $99.00" };
    assert.equal(isDismissed(changed, map), false);
    assert.equal(filterDismissed([changed], map).length, 1);

    assert.deepEqual(loadDismissals(key), map);
    saveDismissals(key, {});
  });
});
