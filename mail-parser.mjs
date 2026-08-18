const REWARD_SUBJECT = /\bchatgpt\s+desktop\s+referral\s+reward\s+is\s+ready\b/i;
// Microsoft localizes this message for some inboxes. Keep the English subject
// matcher above, but recognize the Chinese subject/body used by the same
// referral reward email as well.
const REWARD_SUBJECT_ZH = /(?:chatgpt\s*)????[\s\S]{0,80}(?:??|??|??|??)[\s\S]{0,40}(?:??|??|??|??)/iu;
const REWARD_BODY_ZH = /(?:chatgpt\s*)????[\s\S]{0,140}(?:??|??|??|??)[\s\S]{0,100}(?:??|??|??|??|??|??|??)/iu;
const ENGLISH_BANNED_BRAND_CONTEXT = /\b(?:openai|chatgpt)\b/i;
const ENGLISH_BANNED_CANONICAL = /\b(?:openai\s+api\s*[-:|]\s*(?:access\s+)?(?:deactivat(?:ed|ion)|disabled|suspended|blocked|revoked|terminated)|(?:access\s+)?(?:deactivat(?:ed|ion)|disabled|suspended|blocked|revoked|terminated)\s*[-:|]\s*openai\s+api)\b/i;
const ENGLISH_BANNED_DIRECT = /\b(?:openai|chatgpt)\b[\s\S]{0,100}\b(?:api\s+)?(?:access|account)\b[\s\S]{0,50}\b(?:deactivat(?:ed|ion)|disabled|suspended|blocked|revoked|terminated)\b/i;
const ENGLISH_BANNED_ACTIVE = /\b(?:(?:your|the)\s+)?(?:openai\s+)?(?:api\s+)?(?:access|account)\b[\s\S]{0,60}\b(?:has\s+been|have\s+been|is|was|were)\b[\s\S]{0,24}\b(?:deactivat(?:ed|ion)|disabled|suspended|blocked|revoked|terminated)\b/i;
const ENGLISH_BANNED_AGENT = /\b(?:we|openai)\b[\s\S]{0,20}\b(?:have|has)\b[\s\S]{0,12}\b(?:deactivat(?:ed|ion)|disabled|suspended|blocked|revoked|terminated)\b[\s\S]{0,60}\b(?:your\s+)?(?:openai\s+)?(?:api\s+)?(?:access|account)\b/i;
const ENGLISH_BANNED_RESOLVED = /\b(?:not|never|has\s+not|hasn['?]t|isn['?]t|wasn['?]t)\b[\s\S]{0,30}\b(?:deactivat|disabl|suspend|block|revok)|\b(?:access|account)\b[\s\S]{0,60}\b(?:restored|reactivated|re-?enabled|enabled|active)\b/i;
const ENGLISH_BANNED_CONDITIONAL = /^\s*(?:if|when|whether)\b[\s\S]{0,90}\b(?:access|account)\b[\s\S]{0,60}\b(?:deactivat(?:ed|ion)|disabled|suspended|blocked|revoked|terminated)\b|\b(?:may|might|could|would|can)\b[\s\S]{0,60}\b(?:deactivat(?:ed|ion)|disabled|suspended|blocked|revoked|terminated)\b/i;
const ENGLISH_BANNED_INSTRUCTIONAL = /\b(?:how\s+to|guide|documentation|help\s+center|learn|example|faq|avoid|prevent|troubleshooting)\b/i;
const REPLY_SUBJECT_PREFIX = /^(?:(?:re|fw|fwd)\s*[:?]\s*|(?:??|??|??|??)\s*[:?]\s*)+/i;
// Only evaluate Chinese phrases as an account/API notification when the
// message explicitly identifies OpenAI or ChatGPT. This avoids generic
// Microsoft security notices and API-key lifecycle mail being called a ban.
const CHINESE_BANNED_BRAND_CONTEXT = /(?:openai|chatgpt)/iu;
const CHINESE_BANNED_RESOURCE = /(?:api(?:\s*(?:????|????|????|??|??|??|????|????))?|??|??|??|??|??|??)/iu;
const CHINESE_BANNED_KEY_CONTEXT = /(?:api\s*)?(?:??|??|key|??|??)/iu;
const CHINESE_BANNED_STRONG_STATUS = /(?:??|??|??|??|??|??|??|??|??|??|??|??|??|??|??|??|??|??|??|??|??|???|????|????|????|????|????|????|????|????|????|????|?????|?????|????|????|?????|????|????|????|???|???|??|????|????|?????|?????|????|????|??|??|????|????|???|???|????)/iu;
const CHINESE_BANNED_WEAK_STATUS = /(?:??)/iu;
const CHINESE_BANNED_ACTIVE_MARKER = /(?:?|??|?|?(?:?|?)?|??|??|??|??|??|??|??|??|??)/iu;
const CHINESE_BANNED_NON_NOTICE_PREFIX = /^(?:??|?|?|??|??|??|??|??|??|??|??|??|??|??|??|??|??|??|??)/iu;
const CHINESE_BANNED_INSTRUCTIONAL = /(?:????|????|????|????|??|??|??|????|????|faq|??|??|????|????)/iu;
const CHINESE_BANNED_ACTIVE_STATUS = new RegExp(
  `(?:${CHINESE_BANNED_ACTIVE_MARKER.source})[\\s\\S]{0,8}(?:${CHINESE_BANNED_STRONG_STATUS.source}|${CHINESE_BANNED_WEAK_STATUS.source})`,
  "iu",
);
const CHINESE_BANNED_DIRECT = new RegExp(
  `(?:${CHINESE_BANNED_RESOURCE.source})[\\s\\S]{0,60}(?:${CHINESE_BANNED_ACTIVE_STATUS.source})|(?:${CHINESE_BANNED_ACTIVE_STATUS.source})[\\s\\S]{0,60}(?:${CHINESE_BANNED_RESOURCE.source})`,
  "iu",
);
const CHINESE_BANNED_RESOLVED = /(?:?|??|??|??|??|??)(?![\s\S]{0,8}(?:??|??|??))[\s\S]{0,8}(?:??(?:??|??|??|??|??|??)|??|??(?:??|??|??|??)|??(?:??|??|??)|????|????)|(?:??|??|??|??|??)[\s\S]{0,8}(?:???|????|????|????)/iu;
const CREDITS_PATTERN = /(?:^|[^\d])([\d]{1,9}(?:,[\d]{3})*(?:\.\d{1,2})?)\s*(?:chatgpt\s+)?credits?\b/gi;
const CHINESE_CREDITS_PATTERN = /(?:^|[^\d?-?])([\d?-?]{1,9}(?:[,?]\s*[\d?-?]{3})*(?:[.?][\d?-?]{1,2})?)\s*(?:?\s*)?(?:??|??|??|??|??|??)(?![\p{L}\p{N}])/giu;
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
  if (!raw) return { ok: false, lineNumber, error: "??" };

  // Keep the first three separators stable. Refresh tokens occasionally contain
  // punctuation that should not make an otherwise valid row unusable.
  const parts = raw.split("----");
  if (parts.length < 4) {
    return { ok: false, lineNumber, error: "???????----??----client_id----refresh_token" };
  }
  const [email, password, clientId, ...refreshParts] = parts.map((part) => part.trim());
  const refreshToken = refreshParts.join("----");
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, lineNumber, error: "???????" };
  if (!password) return { ok: false, lineNumber, error: "????" };
  if (!clientId) return { ok: false, lineNumber, error: "client_id ??" };
  if (!refreshToken) return { ok: false, lineNumber, error: "refresh_token ??" };
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
      errors.push({ lineNumber: index + 1, error: "????" });
      continue;
    }
    if (accounts.length >= maxAccounts) {
      errors.push({ lineNumber: index + 1, error: `???? ${maxAccounts} ???` });
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
  const resolvedMatches = [];
  for (const [index, message] of list.entries()) {
    const subject = normalizeText(message?.subject || "");
    const body = normalizeText(messageBody(message));
    const receivedAt = normalizeDate(message?.receivedDateTime || message?.receivedAt || message?.date);
    if (isResolutionMessage(subject, body)) {
      resolvedMatches.push({ receivedAt, index });
    } else if (isDeactivationMessage(subject, body)) {
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
  resolvedMatches.sort(newestFirst);
  const reward = rewardMatches[0] || null;
  const latestBan = bannedMatches[0] || null;
  const latestResolution = resolvedMatches[0] || null;
  const banned = latestBan && (!latestResolution || newestFirst(latestBan, latestResolution) <= 0) ? latestBan : null;
  return {
    credits: reward?.credits ?? null,
    rewardStatus: reward ? "found" : "not_found",
    rewardReceivedAt: reward?.receivedAt || null,
    banned: Boolean(banned),
    bannedReceivedAt: banned?.receivedAt || null,
    bannedSubject: banned?.subject || null,
    matchedMessageIndexes: [banned?.index, reward?.index].filter(Number.isInteger),
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
  const priorityIndexes = Array.isArray(options.priorityIndexes)
    ? options.priorityIndexes.filter((index) => Number.isInteger(index) && index >= 0 && index < list.length)
    : [];
  const orderedIndexes = [...new Set([...priorityIndexes, ...list.map((_, index) => index)])].slice(0, maxMessages);
  let bodyBudget = maxTotalBodyChars;

  return orderedIndexes.map((sourceIndex) => {
    const message = list[sourceIndex];
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
    const id = sourceId || `message-${sourceIndex + 1}`;
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
    .replace(/[?-?]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xff10 + 0x30))
    .replace(/[?,]/g, "")
    .replace(/[?]/g, "."));
}

function isRewardContext(value) {
  return /\b(?:reward|bonus|referral|received?|claim(?:ed|ing)?)\b/i.test(value)
    || /??|??|??|??|??|??|??|??|??|??|??|??|??|?????|?????/i.test(value);
}

function isRewardMessage(subject, body) {
  return REWARD_SUBJECT.test(subject)
    || REWARD_SUBJECT_ZH.test(subject)
    || REWARD_BODY_ZH.test(body);
}

function messageBody(message) {
  const source = [contentText(message?.uniqueBody), contentText(message?.body), message?.text, message?.bodyPreview]
    .find((value) => typeof value === "string" && value.trim());
  return stripQuotedContent(source || "");
}

function stripQuotedContent(value) {
  return String(value || "")
    .replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*>+/.test(line))
    .join("\n")
    .split(/\n\s*(?:On .+ wrote:|-----Original Message-----)\s*\n/i, 1)[0];
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
  return normalizeText(value).replace(/[???]/g, "-");
}

function isDeactivationMessage(subject, body) {
  const subjectText = normalizeSubject(subject);
  const bodyText = normalizeSubject(body);
  const messageText = `${subjectText}\n${bodyText}`;
  return isEnglishBannedMessage(subjectText, bodyText, messageText)
    || isChineseBannedMessage(subjectText, bodyText, messageText);
}

function isResolutionMessage(subject, body) {
  const subjectText = normalizeSubject(subject);
  const bodyText = normalizeSubject(body);
  const messageText = `${subjectText}\n${bodyText}`;
  return isEnglishResolutionMessage(subjectText, bodyText, messageText)
    || isChineseResolutionMessage(subjectText, bodyText, messageText);
}

function isEnglishBannedMessage(subject, body, message) {
  if (!ENGLISH_BANNED_BRAND_CONTEXT.test(message) || ENGLISH_BANNED_RESOLVED.test(message)) return false;
  return isEnglishBannedNotice(subject, true) || isEnglishBannedNotice(body, false);
}

function isEnglishResolutionMessage(subject, body, message) {
  if (!ENGLISH_BANNED_BRAND_CONTEXT.test(message)) return false;
  return [subject, body].some((text) => noticeSegments(text).some((sentence) => {
    if (!sentence || ENGLISH_BANNED_CONDITIONAL.test(sentence) || ENGLISH_BANNED_INSTRUCTIONAL.test(sentence)) return false;
    return ENGLISH_BANNED_RESOLVED.test(sentence);
  }));
}

function isEnglishBannedNotice(text, isSubject) {
  return noticeSegments(text).some((sentence) => {
    if (!sentence || (isSubject && REPLY_SUBJECT_PREFIX.test(sentence))) return false;
    if (ENGLISH_BANNED_CONDITIONAL.test(sentence) || ENGLISH_BANNED_INSTRUCTIONAL.test(sentence)) return false;
    return (isSubject && (ENGLISH_BANNED_CANONICAL.test(sentence) || ENGLISH_BANNED_DIRECT.test(sentence)))
      || ENGLISH_BANNED_ACTIVE.test(sentence)
      || ENGLISH_BANNED_AGENT.test(sentence);
  });
}

function isChineseBannedMessage(subject, body, message) {
  if (!CHINESE_BANNED_BRAND_CONTEXT.test(message) || CHINESE_BANNED_RESOLVED.test(message)) return false;
  return [subject, body].some((text, index) => {
    if (index === 0 && REPLY_SUBJECT_PREFIX.test(text)) return false;
    return noticeSegments(text).some((sentence) => {
    if (!sentence || CHINESE_BANNED_KEY_CONTEXT.test(sentence)) return false;
    if (CHINESE_BANNED_NON_NOTICE_PREFIX.test(sentence) || CHINESE_BANNED_INSTRUCTIONAL.test(sentence)) return false;
    return CHINESE_BANNED_DIRECT.test(sentence);
    });
  });
}

function isChineseResolutionMessage(subject, body, message) {
  if (!CHINESE_BANNED_BRAND_CONTEXT.test(message)) return false;
  return [subject, body].some((text, index) => {
    if (index === 0 && REPLY_SUBJECT_PREFIX.test(text)) return false;
    return noticeSegments(text).some((sentence) => {
    if (!sentence || CHINESE_BANNED_KEY_CONTEXT.test(sentence)) return false;
    if (CHINESE_BANNED_NON_NOTICE_PREFIX.test(sentence) || CHINESE_BANNED_INSTRUCTIONAL.test(sentence)) return false;
    return CHINESE_BANNED_RESOLVED.test(sentence);
    });
  });
}

function noticeSegments(text) {
  return String(text || "")
    .split(/[???!??;\.\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
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
