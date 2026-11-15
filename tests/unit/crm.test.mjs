import test from "node:test";
import assert from "node:assert/strict";
import * as leads from "../../.test-build/lib/crm/leads.js";
import * as names from "../../.test-build/lib/crm/display-names.js";

test("active verticals come from catalog rows and inactive rows are excluded", () => {
  const activeNames = [
    "WeLanterns Capital",
    "WeLanterns Media",
    "TradeStambh",
    "Group Operations",
    "Private Equity",
    "SME Advisory",
    "Loans & Credit Solutions",
  ];
  assert.deepEqual(leads.getActiveLeadVerticals([
    ...activeNames.map((name) => ({ name, is_active: true })),
    { name: "Retired Vertical", is_active: false },
  ]), activeNames);
});

test("active catalog verticals retain canonical labels and stale values are not presented as pending", () => {
  const activeCatalog = [
    "WeLanterns Capital",
    "WeLanterns Media",
    "TradeStambh",
    "Group Operations",
    "Private Equity",
    "SME Advisory",
    "Loans & Credit Solutions",
  ];
  assert.deepEqual(activeCatalog.map((vertical) => leads.getLeadVerticalOptionLabel(vertical, true)), activeCatalog);
  assert.equal(leads.getLeadVerticalOptionLabel("Legacy Vertical", false), "Legacy Vertical (inactive or unavailable)");
  assert.ok(!leads.getLeadVerticalOptionLabel("Private Equity", false).includes("pending database activation"));
});

test("phone normalization handles common Indian prefixes", () => {
  assert.equal(leads.normalizePhone("+91 98765 43210"), "9876543210");
  assert.equal(leads.normalizePhone("098765 43210"), "9876543210");
});

test("phone links handle Indian numbers with and without a leading zero", () => {
  assert.equal(leads.getPhoneLinks("98765 43210").whatsapp, "https://wa.me/919876543210");
  assert.equal(leads.getPhoneLinks("098765 43210").whatsapp, "https://wa.me/919876543210");
});

test("phone links safely omit invalid WhatsApp values", () => {
  assert.equal(leads.getPhoneLinks("987").whatsapp, null);
  assert.equal(leads.getPhoneLinks("+1 (415) 555-0123").telephone, "tel:+14155550123");
});

test("follow-up state respects terminal statuses and due dates", () => {
  const lead = { status: "New", followup: "2026-11-14" };
  assert.equal(leads.getFollowupState(lead, "2026-11-14"), "Due today");
  assert.equal(leads.getFollowupState({ ...lead, followup: "2026-11-13" }, "2026-11-14"), "Overdue");
  assert.equal(leads.getFollowupState({ ...lead, followup: null }, "2026-11-14"), "Unscheduled");
  assert.equal(leads.getFollowupState({ ...lead, status: "Won" }, "2026-11-14"), "Completed");
});

test("person names resolve admin roles and common CRM aliases", () => {
  assert.equal(names.getRoleDisplayName("super_admin"), "Mahesh Bhoir");
  assert.equal(names.getRoleDisplayName("group_admin"), "Preeti Bhoir");
  assert.equal(names.formatCrmPersonName("mahesh.bhoir@company.test"), "Mahesh Bhoir");
  assert.equal(names.getProfileDisplayName({ full_name: "My Account", role: "employee" }), "Team Member");
});
