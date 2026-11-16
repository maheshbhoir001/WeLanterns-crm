import http from "k6/http";
import { check } from "k6";
import { hmac } from "k6/crypto";

const endpoint = __ENV.WHATSAPP_WEBHOOK_URL;
const secret = __ENV.META_APP_SECRET;

export const options = {
  stages: [
    { duration: "2m", target: 100 },
    { duration: "3m", target: 100 },
    { duration: "3m", target: 500 },
    { duration: "3m", target: 500 },
    { duration: "5m", target: 1000 },
    { duration: "5m", target: 2000 },
    { duration: "2m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500", "p(99)<1500"],
  },
};

export default function () {
  if (!endpoint || !secret) throw new Error("Set WHATSAPP_WEBHOOK_URL and META_APP_SECRET.");
  const id = `LOADTEST-${__VU}-${__ITER}-${Date.now()}`;
  const waId = `919900${String(__VU).padStart(4, "0")}`;
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{
      id: "LOADTEST-WABA",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { phone_number_id: "LOADTEST-PHONE" },
          contacts: [{ wa_id: waId, profile: { name: "Load Test" } }],
          messages: [{ from: waId, id, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "hello" } }],
        },
      }],
    }],
  });
  const signature = "sha256=" + hmac("sha256", secret, body, "hex");
  const response = http.post(endpoint, body, {
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature },
    tags: { name: "whatsapp_webhook_ingest" },
  });
  check(response, {
    "webhook accepted event": (r) => r.status === 200,
  });
}
