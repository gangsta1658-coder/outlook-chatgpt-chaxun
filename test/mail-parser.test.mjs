import assert from "node:assert/strict";
import { inspectMailboxMessages, parseFourPartInput, serializeMailboxMessages } from "../mail-parser.mjs";

const parsed = parseFourPartInput([
  "User@outlook.com----pw----client----refresh----with----dashes",
  "bad-line",
  "second@outlook.com----pw----client----token",
].join("\n"));
assert.equal(parsed.accounts.length, 2);
assert.equal(parsed.accounts[0].email, "user@outlook.com");
assert.equal(parsed.accounts[0].refreshToken, "refresh----with----dashes");
assert.equal(parsed.errors.length, 1);

const result = inspectMailboxMessages([
  {
    subject: "Your ChatGPT Desktop referral reward is ready",
    bodyPreview: "You received 1,250 credits for your referral.",
    receivedDateTime: "2026-08-16T10:00:00Z",
  },
  {
    subject: "OpenAI API - Access Deactivated",
    bodyPreview: "Your API access has been deactivated.",
    receivedDateTime: "2026-08-17T10:00:00Z",
  },
]);
assert.equal(result.credits, 1250);
assert.equal(result.rewardStatus, "found");
assert.equal(result.banned, true);
assert.equal(result.bannedReceivedAt, "2026-08-17T10:00:00.000Z");

const noMatch = inspectMailboxMessages([
  { subject: "Your ChatGPT Desktop referral reward is ready", bodyPreview: "No amount here" },
  { subject: "OpenAI API - Access Active", bodyPreview: "" },
]);
assert.equal(noMatch.credits, null);
assert.equal(noMatch.banned, false);

const bodyOnly = inspectMailboxMessages([
  { subject: "Account notice", bodyPreview: "OpenAI API - Access Deactivated", receivedDateTime: "2026-08-17T11:00:00Z" },
]);
assert.equal(bodyOnly.banned, true);

const variants = inspectMailboxMessages([
  { subject: "OpenAI API access has been deactivated", bodyPreview: "" },
  { subject: "Access Deactivated | OpenAI API", bodyPreview: "" },
]);
assert.equal(variants.banned, true);

const sourceMessage = {
  id: "graph-id-1",
  messageId: "<message-1@example.com>",
  subject: "<b>Reward</b>",
  from: { emailAddress: { name: "Sender", address: "sender@example.com" } },
  receivedDateTime: "2026-08-17T12:00:00Z",
  body: { content: "Hello<br><script>alert('x')</script><img onerror=alert(1)>World" },
  bodyPreview: "Hello preview",
  folder: "INBOX",
  accessToken: "must-not-leak",
  refreshToken: "must-not-leak",
  password: "must-not-leak",
};
const serialized = serializeMailboxMessages([sourceMessage]);
assert.deepEqual(Object.keys(serialized[0]).sort(), [
  "body",
  "bodyPreview",
  "folder",
  "from",
  "id",
  "messageId",
  "receivedDateTime",
  "subject",
].sort());
assert.equal(serialized[0].subject, "Reward");
assert.equal(serialized[0].from, "Sender <sender@example.com>");
assert.equal(serialized[0].body, "Hello\nWorld");
assert.equal(serialized[0].body.includes("script"), false);
assert.equal(serialized[0].body.includes("onerror"), false);
assert.equal(serialized[0].receivedDateTime, "2026-08-17T12:00:00.000Z");
assert.equal(serialized[0].folder, "INBOX");
assert.equal(Object.prototype.hasOwnProperty.call(serialized[0], "accessToken"), false);
assert.equal(Object.prototype.hasOwnProperty.call(serialized[0], "refreshToken"), false);

const longBody = "x".repeat(20_000);
const manyMessages = Array.from({ length: 105 }, (_, index) => ({
  id: `id-${index}`,
  body: longBody,
  bodyPreview: longBody,
}));
const bounded = serializeMailboxMessages(manyMessages);
assert.equal(bounded.length, 100);
assert.equal(bounded[0].body.length, 8 * 1024);
assert.equal(bounded[0].bodyPreview.length, 2 * 1024);
assert.ok(bounded.reduce((sum, message) => sum + message.body.length, 0) <= 1024 * 1024);

const malformed = serializeMailboxMessages([{ id: null, subject: null, from: { nope: true }, body: { secret: "x" } }]);
assert.equal(malformed[0].id, "message-1");
assert.equal(malformed[0].subject, "");
assert.equal(malformed[0].from, "");
assert.equal(malformed[0].body, "");

console.log("mail-parser tests passed");
