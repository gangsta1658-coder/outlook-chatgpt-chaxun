import assert from "node:assert/strict";
import { serializeMailboxMessages } from "../mail-parser.mjs";

// Provider payloads must never be copied wholesale into the browser response.
const providerMessage = {
  id: "graph-id-1",
  messageId: "<message@example.test>",
  subject: '<img src=x onerror="alert(1)">Notice',
  from: {
    emailAddress: {
      name: '<script>alert("name")</script>Alice',
      address: "alice@example.test",
    },
  },
  receivedDateTime: "2026-08-17T00:00:00Z",
  folder: "INBOX",
  body: {
    contentType: "html",
    content: '<p>Hello</p><script>steal("refresh_token")</script><img src="https://evil.test/x" onerror="pwn()">',
  },
  bodyPreview: "Hello preview",
  // These values must not cross the API boundary.
  accessToken: "access-token-secret",
  refreshToken: "refresh-token-secret",
  password: "password-secret",
  nested: { credentials: "nested-secret" },
};

const original = structuredClone(providerMessage);
const [serialized] = serializeMailboxMessages([providerMessage]);

assert.deepEqual(providerMessage, original, "serialization must not mutate provider data");
assert.deepEqual(
  Object.keys(serialized).sort(),
  ["body", "bodyPreview", "folder", "from", "id", "messageId", "receivedDateTime", "subject"],
  "only the documented message fields may be exposed",
);
assert.equal(JSON.stringify(serialized).includes("refresh-token-secret"), false);
assert.equal(JSON.stringify(serialized).includes("password-secret"), false);
assert.equal(JSON.stringify(serialized).includes("access-token-secret"), false);
assert.equal(JSON.stringify(serialized).includes("nested-secret"), false);
assert.equal(/<\s*script|<\s*img|onerror\s*=/i.test(serialized.body), false);
assert.equal(/<\s*script|<\s*img|onerror\s*=/i.test(serialized.subject), false);
assert.equal(/<\s*script|<\s*img|onerror\s*=/i.test(serialized.from), false);
assert.equal(serialized.body.includes("Hello"), true);

const long = "x".repeat(20_000);
const capped = serializeMailboxMessages([
  { id: "long", subject: "long", body: long, bodyPreview: long },
], { maxBodyChars: 128, maxPreviewChars: 64, maxTotalBodyChars: 96 });
assert.equal(capped.length, 1);
assert.equal(capped[0].body.length, 96, "per-account body budget must be enforced");
assert.equal(capped[0].bodyPreview.length, 64, "preview cap must be enforced");

const many = serializeMailboxMessages(Array.from({ length: 150 }, (_, index) => ({
  id: String(index),
  body: "body",
})));
assert.equal(many.length, 100, "message count must be capped before response serialization");

const customBudget = serializeMailboxMessages([
  { id: "a", body: "1234567890" },
  { id: "b", body: "abcdefghij" },
], { maxBodyChars: 10, maxTotalBodyChars: 13 });
assert.equal(customBudget[0].body, "1234567890");
assert.equal(customBudget[1].body, "abc");

console.log("mail serialization security tests passed");
