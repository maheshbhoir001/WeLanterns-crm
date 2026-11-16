import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWhatsAppText,
  classifyInboundText,
  buildWelcomeMessage,
  isWithinCustomerServiceWindow,
  canSendFreeformReply,
  isFinancialAdviceRequest,
  routeForService,\n  nextRetryAt,
} from "../../.test-build/lib/whatsapp/domain.js";

test("normalizes customer input without throwing on missing text", () => {
  assert.equal(normalizeWhatsAppText("  HELLO  "), "hello");
  assert.equal(normalizeWhatsAppText(undefined), "");
  assert.equal(normalizeWhatsAppText("  "), "");
});

test("classifies stop and human handoff commands", () => {
  assert.equal(classifyInboundText("STOP"), "opt_out");
  assert.equal(classifyInboundText("unsubscribe"), "opt_out");
  assert.equal(classifyInboundText("8"), "human_handoff");
  assert.equal(classifyInboundText("agent"), "human_handoff");
  assert.equal(classifyInboundText("hello"), "message");
});

test("welcome message includes all business verticals and never promises returns", () => {
  const message = buildWelcomeMessage();
  for (const service of ["Mutual Funds", "Demat", "Bonds", "Insurance", "SME Advisory", "Unlisted Shares", "Digital Marketing"]) {
    assert.ok(message.includes(service), service);
  }
  assert.doesNotMatch(message, /guaranteed returns|assured profit/i);
});

test("24-hour customer-service window is calculated from last inbound message", () => {
  const now = Date.parse("2026-11-16T12:00:00.000Z");
  assert.equal(isWithinCustomerServiceWindow("2026-11-15T13:00:00.000Z", now), true);
  assert.equal(isWithinCustomerServiceWindow("2026-11-15T11:59:59.000Z", now), false);
  assert.equal(isWithinCustomerServiceWindow(null, now), false);
  assert.equal(canSendFreeformReply("2026-11-15T13:00:00.000Z", now), true);
  assert.equal(canSendFreeformReply("2026-11-15T11:59:59.000Z", now), false);
});

test("financial recommendations and trading instructions are routed to a human", () => {
  assert.equal(isFinancialAdviceRequest("Which mutual fund should I buy?"), true);
  assert.equal(isFinancialAdviceRequest("Give me XAUUSD buy signal"), true);
  assert.equal(isFinancialAdviceRequest("What are your office hours?"), false);
});

test("service selection maps to known vertical and product", () => {
  assert.deepEqual(routeForService("1"), { vertical: "WeLanterns Capital", product: "Mutual Funds & SIP" });
  assert.deepEqual(routeForService("5"), { vertical: "SME Advisory", product: "SME Advisory" });
  assert.equal(routeForService("99"), null);
});

test("retry schedule is bounded and increases with attempts", () => {
  const now = Date.parse("2026-11-16T12:00:00.000Z");
  assert.equal(nextRetryAt(1, now), new Date(now + 60_000).toISOString());
  assert.equal(nextRetryAt(2, now), new Date(now + 120_000).toISOString());
  assert.equal(nextRetryAt(99, now), new Date(now + 60 * 60 * 1000).toISOString());
});
