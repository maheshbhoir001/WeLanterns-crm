import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

let origin = "http://127.0.0.1:3000";
const fallbackPort = 3217;
let server;
let serverOutput = "";

before(async () => {
  try {
    const existing = await fetch(origin);
    const html = await existing.text();
    if (existing.ok && html.includes("WeLanterns") && html.includes("Sign In")) return;
  } catch {}

  origin = `http://127.0.0.1:${fallbackPort}`;
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(fallbackPort)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  server.stdout.setEncoding("utf8").on("data", (chunk) => { serverOutput += chunk; });
  server.stderr.setEncoding("utf8").on("data", (chunk) => { serverOutput += chunk; });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next.js server exited early:\n${serverOutput}`);
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`Next.js server did not become ready:\n${serverOutput}`);
});

after(() => {
  if (server && server.exitCode === null) server.kill("SIGTERM");
});

test("login route responds with the CRM sign-in page", async () => {
  const response = await fetch(origin);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Sign In/);
  assert.match(html, /WeLanterns/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(response.headers.get("permissions-policy"), "camera=(), microphone=(), geolocation=()");
});

test("CRM dashboard sections redirect unauthenticated visitors to sign-in", async () => {
  const routes = [
    ["/dashboard", "Business overview"], ["/dashboard/leads", "Lead Management"],
    ["/dashboard/clients", "Client 360"], ["/dashboard/followups", "Follow-ups"],
    ["/dashboard/tasks", "Independent assignments"], ["/dashboard/revenue", "Revenue Management"],
    ["/dashboard/reports", "Reports and MIS"], ["/dashboard/exports", "Data Export Centre"],
    ["/dashboard/users", "User Management"],
    ["/dashboard/capital", "Lead Management"], ["/dashboard/media", "Lead Management"],
    ["/dashboard/tradestambh", "Lead Management"], ["/dashboard/private-equity", "Lead Management"],
    ["/dashboard/sme-advisory", "Lead Management"], ["/dashboard/loans-credit", "Lead Management"],
    ["/dashboard/operations", "Lead Management"],
  ];
  for (const [path, protectedContent] of routes) {
    const response = await fetch(`${origin}${path}`, { redirect: "manual" });
    if ([307, 308].includes(response.status)) {
      assert.match(response.headers.get("location") || "", /\/(?:access-denied)?(?:\?|$)/, `${path} should redirect to sign-in or access denied`);
      continue;
    }
    assert.equal(response.status, 200, `${path} should stream a sign-in redirect`);
    const html = await response.text();
    assert.match(html, /NEXT_REDIRECT|__next-page-redirect/, `${path} should include Next.js redirect metadata`);
    assert.ok(!html.includes(protectedContent), `${path} must not render its protected content`);
  }
});

test("export route rejects requests without an authenticated CRM account", async () => {
  const response = await fetch(`${origin}/api/exports`);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { error: "Sign in with an authorized CRM account." });
});
