const REWARD_SUBJECT = /\bchatgpt\s+desktop\s+referral\s+reward\s+is\s+ready\b/i;
// Microsoft localizes this message for some inboxes. Keep the English subject
// matcher above, but recognize the Chinese subject/body used by the same
// referral reward email as well.
const REWARD_SUBJECT_ZH = /(?:chatgpt\s*)?桌面版[\s\S]{0,80}(?:推荐|推薦|邀请|邀請)[\s\S]{0,40}(?:奖励|獎勵|额度|額度)/iu;
const REWARD_BODY_ZH = /(?:chatgpt\s*)?桌面版[\s\S]{0,140}(?:推荐|推薦|邀请|邀請)[\s\S]{0,100}(?:奖励|獎勵|额度|額度|获得|獲得|添加)/iu;
const BANNED_SUBJECT = /\bopenai\b[\s\S]{0,100}\bapi\b[\s\S]{0,180}\baccess\b[\s\S]{0,80}\bdeactivat(?:ed|ion)\b/i;
const BANNED_REVERSED = /\baccess\b[\s\S]{0,80}\bdeactivat(?:ed|ion)\b[\s\S]{0,180}\bopenai\b[\s\S]{0,100}\bapi\b/i;
// Microsoft localizes account notices. Require a nearby OpenAI/API/account
// context so generic mail mentioning a restriction is not marked as banned.
// Both simplified and traditional Chinese terms are included.
const CHINESE_BANNED_CONTEXT = /(?:openai|chatgpt|api|应用程序接口|應用程式介面|接口|介面|账户|帐户|帳戶|账号|帐号|帳號|组织|組織|访问权限|訪問權限|存取權限|使用权限|使用權限|服务权限|服務權限|服务|服務|密钥|金鑰|令牌|權杖|订阅|訂閱)/iu;
const CHINESE_BANNED_STRONG_STATUS = /(?:停用|禁用|封禁|封鎖|封锁|封停|冻结|凍結|暂停|暫停|停权|停權|撤销|撤銷|撤回|终止|終止|关闭|關閉|受限|失效|不可用|無法使用|无法使用|無法存取|无法访问|無法訪問|无权访问|無權存取|無權訪問|无权使用|無權使用|访问被拒绝|訪問被拒絕|访问遭拒|訪問遭拒|存取被拒絕|存取遭拒|拒绝访问|拒絕存取|被拒绝|被拒絕|遭拒|登录受阻|登入受阻|登录被阻止|登入被阻止|无法登录|無法登入|锁定|鎖定|取消资格|取消資格|黑名单|黑名單|不再可用)/iu;
const CHINESE_BANNED_WEAK_STATUS = /(?:限制|禁止)/iu;
const CHINESE_BANNED_ACTIVE_MARKER = /(?:已|已经|被|遭(?:到|受)?|受到|无法|無法|不能|暂时|暫時|永久|目前|現已|你的|您的)/iu;
const CHINESE_BANNED_ACTIVE_STATUS = new RegExp(
  `(?:${CHINESE_BANNED_ACTIVE_MARKER.source})[\\s\\S]{0,8}(?:${CHINESE_BANNED_STRONG_STATUS.source}|${CHINESE_BANNED_WEAK_STATUS.source})`,
  "iu",
);
const CHINESE_BANNED_STRONG_MESSAGE = new RegExp(
  `(?:${CHINESE_BANNED_CONTEXT.source})[\\s\\S]{0,120}(?:${CHINESE_BANNED_STRONG_STATUS.source})|(?:${CHINESE_BANNED_STRONG_STATUS.source})[\\s\\S]{0,120}(?:${CHINESE_BANNED_CONTEXT.source})`,
  "iu",
);
const CHINESE_BANNED_WEAK_MESSAGE = new RegExp(
  `(?:${CHINESE_BANNED_CONTEXT.source})[\\s\\S]{0,120}(?:${CHINESE_BANNED_WEAK_STATUS.source})|(?:${CHINESE_BANNED_WEAK_STATUS.source})[\\s\\S]{0,120}(?:${CHINESE_BANNED_CONTEXT.source})`,
  "iu",
);
const CHINESE_BANNED_RESOLVED = /(?:解除(?:停用|禁用|封禁|封鎖|封锁|限制)|解封|恢復(?:正常|訪問|存取|使用)|恢复(?:正常|访问|使用)|重新啟用|重新启用|不再受限|限制已解除|停用已解除|封禁已解除|已恢復(?:訪問|存取)|已恢复访问)/iu;
const CREDITS_PATTERN = /(?:^|[^\d])([\d]{1,9}(?:,[\d]{3})*(?:\.\d{1,2})?)\s*(?:chatgpt\s+)?credits?\b/gi;
const CHINESE_CREDITS_PATTERN = /(?:^|[^\d０-９])([\d０-９]{1,9}(?:[,，]\s*[\d０-９]{3})*(?:[.．][\d０-９]{1,2})?)\s*(?:个\s*)?(?:额度|額度|积分|積分|点数|點數)(?![\p{L}\p{N}])/giu;
const MAX_CREDITS = 1_000_000_000;
const MAX_EXPOSED_MESSAGES = 100;
const MAX_EXPOSED_BODY_CHARS = 8 * 1024;
const MAX_EXPOSED_PREVIEW_CHARS = 2 * 1024;
const MAX_EXPOSED_TOTAL_BODY_CHARS = 1024 * 1024;
const MAX_EXPOSED_SUBJECT_CHARS = 240;
const MAX_EXPOSED_ADDRESS_CHARS = 320;
const MAX_EXPOSED_ID_CHARS = 256;
const MAX_EXPOSED_FOLDER_CHARS = 120;

export function parseFourPartLine(line, lineNumber = 1) {
  const raw = String(line ?? "").trim();
  if (!raw) return { ok: false, lineNumber, error: "空行" };

  // Keep the first three separators stable. Refresh tokens occasionally contain
  // punctuation that should not make an otherwise valid row unusable.
  const parts = raw.split("----");
  if (parts.length < 4) {
    return { ok: false, lineNumber, error: "需要四段：邮箱----密码----client_id----refresh_token" };
  }
  const [email, password, clientId, ...refreshParts] = parts.map((part) => part.trim());
  const refreshToken = refreshParts.join("----");
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, lineNumber, error: "邮箱格式不正确" };
  if (!password) return { ok: false, lineNumber, error: "密码为空" };
  if (!clientId) return { ok: false, lineNumber, error: "client_id 为空" };
  if (!refreshToken) return { ok: false, lineNumber, error: "refresh_token 为空" };
  return {
    ok: true,
    lineNumber,
    account: { email: email.toLowerCase(), password, clientId, refreshToken },
  };
}

export function parseFourPartInput(input, maxAccounts = 100) {
  const rows = String(input ?? "").split(/\r?\n/);
  const accounts = [];
  const errors = [];
  const seen = new Set();
  for (const [index, row] of rows.entries()) {
    if (!row.trim()) continue;
    const parsed = parseFourPartLine(row, index + 1);
    if (!parsed.ok) {
      errors.push(parsed);
      continue;
    }
    if (seen.has(parsed.account.email)) {
      errors.push({ lineNumber: index + 1, error: "邮箱重复" });
      continue;
    }
    if (accounts.length >= maxAccounts) {
      errors.push({ lineNumber: index + 1, error: `最多支持 ${maxAccounts} 个邮箱` });
      continue;
    }
    seen.add(parsed.account.email);
    accounts.push(parsed.account);
  }
  return { accounts, errors, totalLines: rows.filter((row) => row.trim()).length };
}

export function inspectMailboxMessages(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const rewardMatches = [];
  const bannedMatches = [];
  for (const [index, message] of list.entries()) {
    const subject = normalizeText(message?.subject || "");
    const body = normalizeText(messageBody(message));
    const receivedAt = normalizeDate(message?.receivedDateTime || message?.receivedAt || message?.date);
    const bannedText = normalizeSubject(`${subject} ${body}`);
    if (isDeactivationMessage(bannedText)) {
      bannedMatches.push({
        receivedAt,
        index,
        subject: subject.slice(0, 180) || "OpenAI API - Access Deactivated",
      });
    }
    const rewardText = `${subject}\n${body}`;
    const credits = extractCredits(rewardText);
    if (credits != null && isRewardMessage(subject, body)) {
      rewardMatches.push({ credits, receivedAt, index, subject: subject.slice(0, 180) });
    }
  }
  rewardMatches.sort(newestFirst);
  bannedMatches.sort(newestFirst);
  const reward = rewardMatches[0] || null;
  const banned = bannedMatches[0] || null;
  return {
    credits: reward?.credits ?? null,
    rewardStatus: reward ? "found" : "not_found",
    rewardReceivedAt: reward?.receivedAt || null,
    banned: Boolean(banned),
    bannedReceivedAt: banned?.receivedAt || null,
    bannedSubject: banned?.subject || null,
    messageCount: list.length,
  };
}

/**
 * Convert provider messages into the small, plain-text shape exposed to the
 * browser. Provider responses contain many fields that are not needed by the
 * UI (and may contain nested account data), so do not spread the source object.
 */
export function serializeMailboxMessages(messages, options = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const maxMessages = clampInteger(options.maxMessages, MAX_EXPOSED_MESSAGES, 1, MAX_EXPOSED_MESSAGES);
  const maxBodyChars = clampInteger(options.maxBodyChars, MAX_EXPOSED_BODY_CHARS, 0, MAX_EXPOSED_BODY_CHARS);
  const maxPreviewChars = clampInteger(options.maxPreviewChars, MAX_EXPOSED_PREVIEW_CHARS, 0, MAX_EXPOSED_PREVIEW_CHARS);
  const maxTotalBodyChars = clampInteger(
    options.maxTotalBodyChars,
    MAX_EXPOSED_TOTAL_BODY_CHARS,
    0,
    MAX_EXPOSED_TOTAL_BODY_CHARS,
  );
  let bodyBudget = maxTotalBodyChars;

  return list.slice(0, maxMessages).map((message, index) => {
    const rawBody = messageContent(message);
    const body = plainText(rawBody);
    const previewSource = plainText(contentText(message?.bodyPreview) || body);
    const bodyLength = Math.min(maxBodyChars, bodyBudget);
    const exposedBody = body.slice(0, bodyLength);
    bodyBudget -= exposedBody.length;

    const subject = singleLine(plainText(message?.subject)).slice(0, MAX_EXPOSED_SUBJECT_CHARS);
    const from = singleLine(formatAddress(message?.from ?? message?.sender)).slice(0, MAX_EXPOSED_ADDRESS_CHARS);
    const receivedValue = message?.receivedDateTime ?? message?.receivedAt ?? message?.date;
    const receivedDateTime = normalizeDate(receivedValue) || singleLine(plainText(receivedValue)).slice(0, 120) || null;
    const sourceId = singleLine(plainText(message?.id ?? message?.messageId)).slice(0, MAX_EXPOSED_ID_CHARS);
    const id = sourceId || `message-${index + 1}`;
    const messageId = singleLine(plainText(message?.messageId)).slice(0, MAX_EXPOSED_ID_CHARS) || null;
    const folder = singleLine(plainText(message?.folder)).slice(0, MAX_EXPOSED_FOLDER_CHARS) || null;

    return {
      id,
      messageId,
      subject,
      from,
      receivedDateTime,
      bodyPreview: previewSource.slice(0, maxPreviewChars),
      body: exposedBody,
      folder,
    };
  });
}

function extractCredits(text) {
  let best = null;
  for (const [pattern, patternScore] of [
    [CREDITS_PATTERN, 0],
    [CHINESE_CREDITS_PATTERN, 3],
  ]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) {
      const value = parseCreditNumber(match[1]);
      if (!Number.isFinite(value) || value <= 0 || value > MAX_CREDITS) continue;
      const context = text.slice(Math.max(0, match.index - 140), match.index + match[0].length + 80);
      const score = patternScore + (isRewardContext(context) ? 2 : 0);
      if (!best || score > best.score) best = { value, score };
    }
  }
  return best?.value ?? null;
}

function parseCreditNumber(value) {
  return Number(String(value)
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/[，,]/g, "")
    .replace(/[．]/g, "."));
}

function isRewardContext(value) {
  return /\b(?:reward|bonus|referral|received?|claim(?:ed|ing)?)\b/i.test(value)
    || /奖励|獎勵|推荐|推薦|邀请|邀請|获得|獲得|领取|領取|添加|赠送|贈送|额度已就绪|額度已就緒/i.test(value);
}

function isRewardMessage(subject, body) {
  return REWARD_SUBJECT.test(subject)
    || REWARD_SUBJECT_ZH.test(subject)
    || REWARD_BODY_ZH.test(body);
}

function messageBody(message) {
  return [message?.bodyPreview, contentText(message?.body), contentText(message?.uniqueBody), message?.text]
    .filter((value) => typeof value === "string" && value.trim())
    .join("\n");
}

function messageContent(message) {
  return contentText(message?.body)
    || contentText(message?.uniqueBody)
    || contentText(message?.text)
    || contentText(message?.bodyPreview);
}

function contentText(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  for (const key of ["content", "text", "body", "value"]) {
    if (typeof value[key] === "string") return value[key];
  }
  return "";
}

function formatAddress(value) {
  if (typeof value === "string") return plainText(value);
  if (!value || typeof value !== "object") return "";
  const address = value.emailAddress && typeof value.emailAddress === "object"
    ? value.emailAddress
    : value;
  const name = plainText(address.name);
  const email = plainText(address.address || address.email);
  if (name && email) return `${name} <${email}>`;
  return name || email;
}

function plainText(value) {
  if (value == null) return "";
  return decodeEntities(String(value))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function singleLine(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(Math.floor(parsed), maximum));
}

function normalizeSubject(value) {
  return normalizeText(value).replace(/[–—−]/g, "-");
}

function isDeactivationMessage(value) {
  const text = normalizeSubject(value);
  if (BANNED_SUBJECT.test(text) || BANNED_REVERSED.test(text)) return true;
  if (!isChineseBannedMessage(text)) return false;
  // A localized follow-up can say that a restriction was lifted. Do not keep
  // that message in the banned bucket unless it also contains an explicit
  // unresolved status phrase (for example, “账号已停用”).
  return !CHINESE_BANNED_RESOLVED.test(text) || CHINESE_BANNED_ACTIVE_STATUS.test(text);
}

function isChineseBannedMessage(text) {
  const sentences = text.split(/[。！？!?；;\n]+/).map((part) => part.trim()).filter(Boolean);
  return sentences.some((sentence) => {
    if (CHINESE_BANNED_STRONG_MESSAGE.test(sentence)) return true;
    return CHINESE_BANNED_WEAK_MESSAGE.test(sentence) && CHINESE_BANNED_ACTIVE_STATUS.test(sentence);
  });
}

function normalizeText(value) {
  return decodeEntities(String(value || ""))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u00a0\u2000-\u200b\u2028\u2029\u3000]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function normalizeDate(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function newestFirst(left, right) {
  return (Date.parse(right.receivedAt || "") || 0) - (Date.parse(left.receivedAt || "") || 0)
    || right.index - left.index;
}
