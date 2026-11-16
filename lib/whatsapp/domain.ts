export type InboundIntent = "opt_out" | "human_handoff" | "message";
export type ServiceRoute = { vertical: string; product: string };

const services: Record<string, ServiceRoute> = {
  "1": { vertical: "WeLanterns Capital", product: "Mutual Funds & SIP" },
  "2": { vertical: "WeLanterns Capital", product: "Demat & Trading" },
  "3": { vertical: "WeLanterns Capital", product: "Bonds & Fixed Income" },
  "4": { vertical: "WeLanterns Capital", product: "Insurance" },
  "5": { vertical: "SME Advisory", product: "SME Advisory" },
  "6": { vertical: "Private Equity", product: "Unlisted Shares" },
  "7": { vertical: "WeLanterns Media", product: "Digital Marketing" },
};

export function normalizeWhatsAppText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-IN") : "";
}

export function classifyInboundText(value: unknown): InboundIntent {
  const text = normalizeWhatsAppText(value);
  if (/^(stop|unsubscribe|opt\s*out|रोकें|बंद)$/.test(text)) return "opt_out";
  if (/^(8|agent|human|person|representative|team|support)$/.test(text)) return "human_handoff";
  return "message";
}

export function buildWelcomeMessage(): string {
  return [
    "Welcome to WeLanterns Capital! 🙏",
    "",
    "How can we help you today?",
    "",
    "1. Mutual Funds & SIP",
    "2. Demat & Trading",
    "3. Bonds & Fixed Income",
    "4. Insurance",
    "5. SME Advisory",
    "6. Unlisted Shares",
    "7. Digital Marketing",
    "8. Speak with our team",
    "",
    "Reply with a number to select a service. For a team member, reply 8.",
    "Please do not share passwords, OTPs, bank PINs or sensitive account credentials here.",
  ].join("\n");
}

export function routeForService(value: unknown): ServiceRoute | null {
  const key = typeof value === "string" ? value.trim() : "";
  return services[key] ?? null;
}

export function isWithinCustomerServiceWindow(lastInboundAt: string | null, nowMs = Date.now()): boolean {
  if (!lastInboundAt) return false;
  const timestamp = Date.parse(lastInboundAt);
  if (!Number.isFinite(timestamp)) return false;
  const age = nowMs - timestamp;
  return age >= 0 && age < 24 * 60 * 60 * 1000;
}

export function canSendFreeformReply(lastInboundAt: string | null, nowMs = Date.now()): boolean {
  return isWithinCustomerServiceWindow(lastInboundAt, nowMs);
}

export function isFinancialAdviceRequest(value: unknown): boolean {
  const text = normalizeWhatsAppText(value);
  return /\b(which (mutual fund|fund|stock|share)|should i (buy|sell|invest)|buy signal|sell signal|trading signal|target price|guaranteed return|assured return|portfolio recommendation|best stock)\b/.test(text);
}

export function nextRetryAt(attempts: number, nowMs = Date.now()): string {
  const safeAttempt = Math.max(1, Math.min(Math.floor(attempts || 1), 8));
  const delayMs = Math.min(60_000 * (2 ** (safeAttempt - 1)), 60 * 60 * 1000);
  return new Date(nowMs + delayMs).toISOString();
}
