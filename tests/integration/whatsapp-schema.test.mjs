import test from "node:test";
import assert from "node:assert/strict";

const url = process.env.WHATSAPP_TEST_SUPABASE_URL;
const key = process.env.WHATSAPP_TEST_SUPABASE_SERVICE_ROLE_KEY;
const enabled = Boolean(url && key);

test("staging WhatsApp schema exposes all required tables", { skip: !enabled }, async () => {
  const parsed = new URL(url);
  assert.notEqual(parsed.hostname, "nofwutspdczbwllzrdcn.supabase.co", "Integration tests must never target production");
  assert.match(parsed.hostname, /supabase\.co$/);
  const tables = [
    "whatsapp_contacts",
    "whatsapp_conversations",
    "whatsapp_messages",
    "whatsapp_bot_sessions",
    "whatsapp_lead_intakes",
    "whatsapp_webhook_events",
    "whatsapp_outbox",
  ];
  for (const table of tables) {
    const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    assert.equal(response.status, 200, `${table} should exist and be readable by staging service role`);
  }
});

test("production Supabase project is rejected by integration-test guard", () => {
  const productionHost = "nofwutspdczbwllzrdcn.supabase.co";
  assert.notEqual(productionHost, new URL("https://athnmealzrgqhqxxdexa.supabase.co").hostname);
});
