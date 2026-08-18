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

const chineseReward = inspectMailboxMessages([
  {
    subject: "你的 ChatGPT 桌面版推荐奖励已经准备就绪",
    bodyPreview: "你在 ChatGPT 桌面版发送第一条消息，因此你和好友各获得 1,000 额度。",
    receivedDateTime: "2026-08-17T09:00:00Z",
  },
]);
assert.equal(chineseReward.credits, 1000);
assert.equal(chineseReward.rewardStatus, "found");

const chineseBodyReward = inspectMailboxMessages([
  {
    subject: "OpenAI",
    bodyPreview: "你的 ChatGPT 桌面版推荐奖励已经准备就绪，你的额度已就绪。已添加 １０００ 额度。",
  },
]);
assert.equal(chineseBodyReward.credits, 1000);
assert.equal(chineseBodyReward.rewardStatus, "found");

const chineseBanned = inspectMailboxMessages([
  {
    subject: "OpenAI API - 访问权限已停用",
    bodyPreview: "你的 API 访问权限已被停用，暂时无法使用服务。",
  },
  {
    subject: "您的 ChatGPT 账号已被禁用",
    bodyPreview: "如需帮助，请联系支持团队。",
  },
  {
    subject: "账户封禁通知",
    bodyPreview: "你的 OpenAI 账户已被暂停。",
  },
]);
assert.equal(chineseBanned.banned, true);

const traditionalBanned = inspectMailboxMessages([
  {
    subject: "OpenAI API - 存取權限已停用",
    bodyPreview: "您的 OpenAI 帳戶已被凍結，無法使用 API。",
  },
]);
assert.equal(traditionalBanned.banned, true);

const chineseRestrictionResolved = inspectMailboxMessages([
  {
    subject: "OpenAI API - 访问限制已解除",
    bodyPreview: "您的访问权限已恢复，可以正常使用服务。",
  },
]);
assert.equal(chineseRestrictionResolved.banned, false);

const chinesePolicyNotice = inspectMailboxMessages([
  { subject: "OpenAI 服务条款", bodyPreview: "禁止自动化访问和滥用服务。" },
]);
assert.equal(chinesePolicyNotice.banned, false);

const chineseHelpNotice = inspectMailboxMessages([
  { subject: "ChatGPT 帮助中心", bodyPreview: "本文介绍访问限制和常见问题。" },
]);
assert.equal(chineseHelpNotice.banned, false);

const chineseConditionalNotice = inspectMailboxMessages([
  { subject: "OpenAI 使用指南", bodyPreview: "如果你的 API 访问权限被限制，请联系支持团队。" },
]);
assert.equal(chineseConditionalNotice.banned, false);

const chineseStatusGuide = inspectMailboxMessages([
  { subject: "OpenAI API 停用指南", bodyPreview: "本文说明停用和恢复的流程。" },
]);
assert.equal(chineseStatusGuide.banned, false);

const chineseActiveStatusNotice = inspectMailboxMessages([
  { subject: "OpenAI API 已停用：如何恢复访问", bodyPreview: "你的 API 访问权限已被停用。" },
]);
assert.equal(chineseActiveStatusNotice.banned, true);

const englishHelpNotice = inspectMailboxMessages([
  { subject: "How to tell whether OpenAI API access is deactivated", bodyPreview: "This guide explains account notifications." },
]);
assert.equal(englishHelpNotice.banned, false);

const englishConditionalNotice = inspectMailboxMessages([
  { subject: "OpenAI API access may be deactivated", bodyPreview: "Read the documentation for possible causes." },
]);
assert.equal(englishConditionalNotice.banned, false);

const englishHelpFalsePositive = inspectMailboxMessages([
  { subject: "OpenAI API account suspended: troubleshooting guide", bodyPreview: "This article explains how to appeal." },
]);
assert.equal(englishHelpFalsePositive.banned, false);

const englishQuotedFalsePositive = inspectMailboxMessages([
  { subject: "Re: Support ticket", bodyPreview: "See the email \"OpenAI API - Access Deactivated\" and submit an appeal." },
]);
assert.equal(englishQuotedFalsePositive.banned, false);

const forwardedCanonicalFalsePositive = inspectMailboxMessages([
  { subject: "Fwd: OpenAI API - Access Deactivated", bodyPreview: "Forwarded for reference." },
]);
assert.equal(forwardedCanonicalFalsePositive.banned, false);

const quotedActiveFalsePositive = inspectMailboxMessages([
  { subject: "OpenAI account notice", bodyPreview: "Thanks for the reply.\n> Your API access has been deactivated." },
]);
assert.equal(quotedActiveFalsePositive.banned, false);

const englishAgentNotice = inspectMailboxMessages([
  { subject: "OpenAI account notice", bodyPreview: "We have deactivated your API access." },
]);
assert.equal(englishAgentNotice.banned, true);

const englishNotDeactivated = inspectMailboxMessages([
  { subject: "OpenAI API account notice", bodyPreview: "Your API access has not been deactivated." },
]);
assert.equal(englishNotDeactivated.banned, false);

const englishRestoredNotice = inspectMailboxMessages([
  { subject: "OpenAI API - Access Deactivated", bodyPreview: "Your API access has been restored." },
]);
assert.equal(englishRestoredNotice.banned, false);

const historicalBanResolved = inspectMailboxMessages([
  {
    subject: "OpenAI API - Access Deactivated",
    bodyPreview: "Your API access has been deactivated.",
    receivedDateTime: "2026-08-16T10:00:00Z",
  },
  {
    subject: "OpenAI API - Access Restored",
    bodyPreview: "Your API access has been restored.",
    receivedDateTime: "2026-08-17T10:00:00Z",
  },
]);
assert.equal(historicalBanResolved.banned, false);

const unrelatedAccountSecurity = inspectMailboxMessages([
  { subject: "Microsoft account security", bodyPreview: "Your account has been locked. Please verify your identity." },
]);
assert.equal(unrelatedAccountSecurity.banned, false);

const openAiKeyLifecycle = inspectMailboxMessages([
  { subject: "OpenAI API key revoked", bodyPreview: "Your API key has been revoked. Create a new key." },
]);
assert.equal(openAiKeyLifecycle.banned, false);

const unrelatedChineseAccountSecurity = inspectMailboxMessages([
  { subject: "Microsoft 账户安全", bodyPreview: "你的账户已被锁定，请验证身份。" },
]);
assert.equal(unrelatedChineseAccountSecurity.banned, false);

const chineseKeyLifecycle = inspectMailboxMessages([
  { subject: "OpenAI API 密钥已撤销", bodyPreview: "请创建新的 API 密钥。" },
]);
assert.equal(chineseKeyLifecycle.banned, false);

const chineseRestoredNotice = inspectMailboxMessages([
  { subject: "OpenAI API - 访问限制已解除", bodyPreview: "此前账户已被暂停，现在已经恢复正常。" },
]);
assert.equal(chineseRestoredNotice.banned, false);

const rewardWithUsageNotice = inspectMailboxMessages([
  {
    subject: "你的 ChatGPT 桌面版推荐奖励已准备就绪",
    bodyPreview: "你和好友各获得 1,000 额度，禁止滥用服务。",
  },
]);
assert.equal(rewardWithUsageNotice.credits, 1000);
assert.equal(rewardWithUsageNotice.banned, false);

const unrelatedChineseAmount = inspectMailboxMessages([
  { subject: "账户通知", bodyPreview: "本月账单金额为 1,000 元。" },
]);
assert.equal(unrelatedChineseAmount.credits, null);
assert.equal(unrelatedChineseAmount.rewardStatus, "not_found");

const noMatch = inspectMailboxMessages([
  { subject: "Your ChatGPT Desktop referral reward is ready", bodyPreview: "No amount here" },
  { subject: "OpenAI API - Access Active", bodyPreview: "" },
]);
assert.equal(noMatch.credits, null);
assert.equal(noMatch.banned, false);

const bodyOnly = inspectMailboxMessages([
  { subject: "OpenAI account notice", bodyPreview: "Your API access has been deactivated.", receivedDateTime: "2026-08-17T11:00:00Z" },
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

const priorityMessages = Array.from({ length: 101 }, (_, index) => ({
  id: `priority-${index}`,
  subject: `Message ${index}`,
}));
const prioritized = serializeMailboxMessages(priorityMessages, { maxMessages: 100, priorityIndexes: [100] });
assert.equal(prioritized.length, 100);
assert.equal(prioritized[0].id, "priority-100");

const malformed = serializeMailboxMessages([{ id: null, subject: null, from: { nope: true }, body: { secret: "x" } }]);
assert.equal(malformed[0].id, "message-1");
assert.equal(malformed[0].subject, "");
assert.equal(malformed[0].from, "");
assert.equal(malformed[0].body, "");

console.log("mail-parser tests passed");
