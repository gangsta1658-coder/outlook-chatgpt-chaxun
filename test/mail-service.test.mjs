import assert from "node:assert/strict";
import { inspectMailbox } from "../mail-service.mjs";

const originalFetch = globalThis.fetch;
let tokenCalls = 0;
globalThis.fetch = async (url) => {
  const target = String(url);
  if (target.includes("oauth2/v2.0/token")) {
    tokenCalls += 1;
    if (tokenCalls === 1) {
      return new Response(JSON.stringify({ error: "invalid_scope", error_description: "scope is not valid" }), { status: 400 });
    }
    return new Response(JSON.stringify({ access_token: "access-token", expires_in: 3600 }), { status: 200 });
  }
  if (target.includes("graph.microsoft.com/v1.0/me/messages")) {
    return new Response(JSON.stringify({ value: [{ subject: "OpenAI API - Access Deactivated", bodyPreview: "" }] }), { status: 200 });
  }
  throw new Error(`unexpected URL: ${target}`);
};

try {
  const result = await inspectMailbox({ email: "user@example.com", clientId: "client", refreshToken: "refresh" }, { timeoutMs: 1000 });
  assert.equal(result.messages.length, 1);
  assert.ok(tokenCalls >= 2);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("mail-service tests passed");
