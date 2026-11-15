import test from "node:test";
import assert from "node:assert/strict";
import { groupClients, normalizedPhone, validDate } from "../../.test-build/lib/crm/export-utils.js";

test("export phone normalization groups Indian number formats", () => {
  assert.equal(normalizedPhone("+91 98765 43210"), "9876543210");
  assert.equal(normalizedPhone("09876543210"), "9876543210");
  assert.equal(normalizedPhone(""), null);
});

test("client export groups opportunities by normalized phone and owner", () => {
  const rows = groupClients([
    { id: "a", name: "Asha", phone: "+91 98765 43210", owner_id: "one" },
    { id: "b", name: "Asha", phone: "09876543210", owner_id: "one" },
    { id: "c", name: "Asha", phone: "9876543210", owner_id: "two" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].opportunity_count, 2);
  assert.equal(rows[1].opportunity_count, 1);
});

test("export date validation rejects malformed and impossible dates", () => {
  assert.equal(validDate(""), true);
  assert.equal(validDate("2026-11-14"), true);
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("14-11-2026"), false);
});
