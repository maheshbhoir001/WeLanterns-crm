import test from "node:test";
import assert from "node:assert/strict";
import { canAccessAssignedRecord, isFinanceAdmin } from "../../.test-build/lib/crm/permissions.js";

const maheshId = "super-admin-id";
const preetiId = "group-admin-id";
const assignedEmployeeId = "assigned-employee-id";
const otherEmployeeId = "other-employee-id";

test("Super Admin and Group Admin retain finance-wide access", () => {
  assert.equal(isFinanceAdmin("super_admin"), true);
  assert.equal(isFinanceAdmin("group_admin"), true);
  assert.equal(canAccessAssignedRecord("super_admin", maheshId, otherEmployeeId), true);
  assert.equal(canAccessAssignedRecord("group_admin", preetiId, otherEmployeeId), true);
});

test("Assigned Employee can access only records assigned to their account", () => {
  assert.equal(isFinanceAdmin("employee"), false);
  assert.equal(canAccessAssignedRecord("employee", assignedEmployeeId, assignedEmployeeId), true);
  assert.equal(canAccessAssignedRecord("employee", assignedEmployeeId, otherEmployeeId), false);
});

test("Unassigned Employee cannot access another employee's records", () => {
  assert.equal(canAccessAssignedRecord("employee", otherEmployeeId, assignedEmployeeId), false);
  assert.equal(canAccessAssignedRecord("employee", otherEmployeeId, null), false);
  assert.equal(canAccessAssignedRecord("employee", null, assignedEmployeeId), false);
});
