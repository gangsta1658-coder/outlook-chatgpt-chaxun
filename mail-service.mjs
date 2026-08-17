import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const COMMON_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const CONSUMERS_TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const LIVE_TOKEN_URL = "https://login.live.com/oauth20_token.srf";
const CONSUMERS_LEGACY_TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/token";
const COMMON_LEGACY_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/token";
const GRAPH_MESSAGES_URL = "https://graph.microsoft.com/v1.0/me/messages";
const GRAPH_SCOPE = "https://graph.microsoft.com/Mail.Read offline_access";
const OUTLOOK_SCOPE = "https://outlook.office.com/IMAP.AccessAsUser.All offline_access";
const GRAPH_RESOURCE = "https://graph.microsoft.com/";
const OUTLOOK_RESOURCE = "https://outlook.office.com/";
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_MESSAGES = 100;
const MAX_RESPONSE_CHARS = 8 * 1024 * 1024;

// The normal Graph request only returns the newest messages. Keep a small,
// bounded set of targeted searches for localized reward/deactivation mail so
// an older Chinese message is still visible to the parser. These terms are
// intentionally broad enough to cover Simplified/Traditional wording; the
// parser remains the authority for deciding whether a message is a match.
const TARGETED_SEARCH_QUERIES = Object.freeze([
  '"Access Deactivated"',
  '"OpenAI API"',
  '"ChatGPT Desktop referral reward"',
  '"桌面版"',
  '"奖励"',
  '"额度"',
  '"积分"',
  '"停用"',
  '"封禁"',
]);

const TOKEN_ATTEMPTS = [
  { name: "common-default-graph", url: COMMON_TOKEN_URL, protocol: "graph" },
  { name: "common-graph", url: COMMON_TOKEN_URL, scope: GRAPH_SCOPE, protocol: "graph" },
  { name: "common-imap", url: COMMON_TOKEN_URL, scope: OUTLOOK_SCOPE, protocol: "imap", host: "outlook.live.com" },
  { name: "consumers-default-graph", url: CONSUMERS_TOKEN_URL, scope: "https://graph.microsoft.com/.default", protocol: "graph" },
  { name: "consumers-default-imap", url: CONSUMERS_TOKEN_URL, scope: "https://outlook.office.com/.default offline_access", protocol: "imap", host: "outlook.live.com" },
  { name: "consumers-graph", url: CONSUMERS_TOKEN_URL, scope: GRAPH_SCOPE, protocol: "graph" },
  { name: "consumers-imap", url: CONSUMERS_TOKEN_URL, scope: OUTLOOK_SCOPE, protocol: "imap", host: "outlook.live.com" },
  { name: "consumers-empty-imap", url: CONSUMERS_TOKEN_URL, protocol: "imap", host: "outlook.live.com", allowInvalidRequestFallback: true },
  { name: "live-imap", url: LIVE_TOKEN_URL, scope: OUTLOOK_SCOPE, protocol: "imap", host: "outlook.office365.com" },
  { name: "live-default-imap", url: LIVE_TOKEN_URL, scope: "https://outlook.office.com/.default offline_access", protocol: "imap", host: "outlook.office365.com" },
  { name: "live-empty-imap", url: LIVE_TOKEN_URL, protocol: "imap", host: "outlook.office365.com", allowInvalidRequestFallback: true },
  { name: "consumers-legacy-graph", url: CONSUMERS_LEGACY_TOKEN_URL, resource: GRAPH_RESOURCE, protocol: "graph" },
  { name: "consumers-legacy-imap", url: CONSUMERS_LEGACY_TOKEN_URL, resource: OUTLOOK_RESOURCE, protocol: "imap", host: "outlook.office365.com" },
  { name: "consumers-legacy-empty", url: CONSUMERS_LEGACY_TOKEN_URL, protocol: "imap", host: "outlook.office365.com", allowInvalidRequestFallback: true },
  { name: "common-legacy-imap", url: COMMON_LEGACY_TOKEN_URL, resource: OUTLOOK_RESOURCE, protocol: "imap", host: "outlook.office365.com" },
  { name: "common-legacy-graph", url: COMMON_LEGACY_TOKEN_URL, resource: GRAPH_RESOURCE, protocol: "graph" },
];

export async function inspectMailbox(account, options = {}) {
  const maxMessages = Math.max(1, Math.min(Number(options.maxMessages || MAX_MESSAGES) || MAX_MESSAGES, MAX_MESSAGES));
  let lastError = null;
  let refreshToken = String(account?.refreshToken || "").trim();

  for (const spec of TOKEN_ATTEMPTS) {
    try {
      const token = await refreshAccessToken({
        clientId: account.clientId,
        refreshToken,
      }, spec, options);
      if (token.refreshToken) refreshToken = token.refreshToken;
      let messages;
      if (spec.protocol === "imap") {
        messages = await fetchImapMessages({ email: account.email, accessToken: token.accessToken }, {
          host: spec.host,
          maxMessages,
          timeoutMs: options.timeoutMs,
          pythonCommand: options.pythonCommand,
          maxTotalMessages: options.maxTotalMessages,
        });
      } else {
        messages = await fetchGraphMessagesExpanded(token.accessToken, { maxMessages, timeoutMs: options.timeoutMs });
        const targeted = await fetchGraphTargetedMessages(token.accessToken, { timeoutMs: options.timeoutMs });
        messages = mergeMessages(messages, targeted);
      }
      return { messages, source: spec.name };
    } catch (error) {
      lastError = error;
      if (!shouldTryNext(error, spec)) break;
    }
  }
  throw sanitizeMailError(lastError || new Error("无法读取邮箱"));
}

async function refreshAccessToken(credentials, spec, options = {}) {
  const body = new URLSearchParams({
    client_id: String(credentials.clientId || "").trim(),
    grant_type: "refresh_token",
    refresh_token: String(credentials.refreshToken || "").trim(),
  });
  if (spec.scope) body.set("scope", spec.scope);
  if (spec.resource) body.set("resource", spec.resource);
  const response = await requestWithTimeout(spec.url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "mail-audit-site/1.0",
    },
    body,
  }, options);
  const data = await readJson(response, "Microsoft OAuth");
  if (!response.ok || !data.access_token) {
    const error = new Error(providerMessage(data) || `OAuth 返回 HTTP ${response.status}`);
    error.status = response.status;
    error.code = String(data?.error?.code || data?.error || "oauth_error");
    throw error;
  }
  return {
    accessToken: String(data.access_token),
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token.trim() : "",
  };
}

async function fetchGraphMessages(accessToken, options = {}) {
  const url = new URL(options.messagesUrl || GRAPH_MESSAGES_URL);
  url.searchParams.set("$select", "id,subject,body,uniqueBody,bodyPreview,receivedDateTime,from,sender");
  url.searchParams.set("$orderby", "receivedDateTime desc");
  url.searchParams.set("$top", String(Math.max(1, Math.min(Number(options.maxMessages || MAX_MESSAGES), MAX_MESSAGES))));
  const response = await requestWithTimeout(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      prefer: 'outlook.body-content-type="text"',
      "user-agent": "mail-audit-site/1.0",
    },
  }, options);
  const data = await readJson(response, "Microsoft Graph");
  if (!response.ok || !Array.isArray(data.value)) {
    const error = new Error(providerMessage(data) || `Graph 返回 HTTP ${response.status}`);
    error.status = response.status;
    error.code = String(data?.error?.code || data?.error || "graph_error");
    throw error;
  }
  return data.value;
}

async function fetchGraphMessagesExpanded(accessToken, options = {}) {
  const maxMessages = Math.max(1, Math.min(Number(options.maxMessages || MAX_MESSAGES), MAX_MESSAGES));
  const firstUrl = new URL(GRAPH_MESSAGES_URL);
  firstUrl.searchParams.set("$select", "id,subject,body,uniqueBody,bodyPreview,receivedDateTime,from,sender");
  firstUrl.searchParams.set("$orderby", "receivedDateTime desc");
  firstUrl.searchParams.set("$top", String(Math.min(50, maxMessages)));
  const messages = [];
  let nextUrl = firstUrl;
  while (nextUrl && messages.length < maxMessages) {
    const response = await requestWithTimeout(nextUrl, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
        prefer: 'outlook.body-content-type="text"',
        "user-agent": "mail-audit-site/1.0",
      },
    }, options);
    const data = await readJson(response, "Microsoft Graph");
    if (!response.ok || !Array.isArray(data.value)) {
      const error = new Error(providerMessage(data) || `Graph HTTP ${response.status}`);
      error.status = response.status;
      error.code = String(data?.error?.code || data?.error || "graph_error");
      throw error;
    }
    messages.push(...data.value.map(compactMessage));
    nextUrl = typeof data["@odata.nextLink"] === "string" ? data["@odata.nextLink"] : null;
  }
  return messages.slice(0, maxMessages);
}

function compactMessage(message) {
  if (!message || typeof message !== "object") return message;
  return {
    ...message,
    bodyPreview: String(message.bodyPreview || "").slice(0, 8 * 1024),
    body: typeof message.body === "object"
      ? { ...message.body, content: String(message.body.content || "").slice(0, 8 * 1024) }
      : String(message.body || "").slice(0, 8 * 1024),
    uniqueBody: typeof message.uniqueBody === "object"
      ? { ...message.uniqueBody, content: String(message.uniqueBody.content || "").slice(0, 8 * 1024) }
      : String(message.uniqueBody || "").slice(0, 8 * 1024),
  };
}

async function fetchGraphTargetedMessages(accessToken, options = {}) {
  const found = [];
  for (const query of TARGETED_SEARCH_QUERIES) {
    const url = new URL(GRAPH_MESSAGES_URL);
    url.searchParams.set("$search", query);
    url.searchParams.set("$select", "id,subject,bodyPreview,receivedDateTime,from,sender");
    url.searchParams.set("$orderby", "receivedDateTime desc");
    url.searchParams.set("$top", "25");
    try {
      const response = await requestWithTimeout(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
          ConsistencyLevel: "eventual",
          "user-agent": "mail-audit-site/1.0",
        },
      }, options);
      const data = await readJson(response, "Microsoft Graph");
      if (response.ok && Array.isArray(data.value)) found.push(...data.value.map(compactMessage));
    } catch {
      // Targeted search is an enhancement; normal mailbox reading remains authoritative.
    }
  }
  return found;
}

function mergeMessages(primary, extra) {
  const merged = [];
  const seen = new Set();
  for (const message of [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(extra) ? extra : [])]) {
    const key = String(message?.id || `${message?.subject || ""}|${message?.receivedDateTime || ""}`);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(message);
  }
  return merged;
}

async function fetchImapMessages(credentials, options = {}) {
  const helperPath = fileURLToPath(new URL("./microsoft-imap.py", import.meta.url));
  const command = options.pythonCommand || process.env.MAIL_AUDIT_PYTHON || "python3";
  const payload = {
    email: credentials.email,
    accessToken: credentials.accessToken,
    host: options.host || "outlook.live.com",
    port: 993,
    maxMessages: Math.max(1, Math.min(Number(options.maxMessages || MAX_MESSAGES), MAX_MESSAGES)),
    maxTotalMessages: Math.max(1, Math.min(Number(options.maxTotalMessages || 300), 300)),
    timeout: Math.max(5, Math.min(Math.ceil((options.timeoutMs || DEFAULT_TIMEOUT_MS) / 1000), 60)),
  };
  return new Promise((resolve, reject) => {
    const child = spawn(command, [helperPath], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      const error = new Error("IMAP 请求超时");
      error.status = 504;
      error.code = "imap_timeout";
      finish(reject, error);
    }, options.timeoutMs || DEFAULT_TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-MAX_RESPONSE_CHARS); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-2000); });
    child.once("error", (error) => finish(reject, error));
    child.once("close", (code) => {
      let data = null;
      try { data = stdout.trim() ? JSON.parse(stdout) : null; } catch {}
      if (code === 0 && Array.isArray(data?.messages)) {
        finish(resolve, data.messages);
        return;
      }
      const error = new Error(String(data?.error?.message || stderr || "IMAP 读取失败").replace(/[\r\n]+/g, " ").slice(0, 180));
      error.status = Number(data?.error?.status || 0);
      error.code = String(data?.error?.code || "imap_error");
      finish(reject, error);
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

function shouldTryNext(error, spec = {}) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || "").toLowerCase();
  const text = `${code} ${error?.message || ""}`;
  if (status === 400) {
    if (/invalid_client/.test(code)) return false;
    if (spec.allowInvalidRequestFallback && /AADSTS9002313|invalid request/i.test(text)) return true;
    if (/invalid_grant/.test(code) && !/scope|tenant|different tenant|AADSTS70000|AADSTS7000012/i.test(text)) return false;
    return /invalid_scope|scope|tenant|audience|invalid request|request_badrequest|property|select|unsupported|AADSTS9002313|AADSTS70000/i.test(text);
  }
  if (status === 401) return true;
  if (status === 403) return /scope|audience|imap|graph|permission|forbidden|accessdenied/i.test(text) || code === "imap_auth_failed";
  return status === 408 || status === 429 || status >= 500;
}

function sanitizeMailError(error) {
  const result = new Error(String(error?.message || "邮箱读取失败")
    .replace(/https?:\/\/\S+/gi, "<隐藏地址>")
    .replace(/(?:access_token|refresh_token|client_secret|password)\s*[=:]\s*[^\s,}]+/gi, "$1=<已隐藏>")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 240));
  result.status = Number(error?.status || 0);
  result.code = String(error?.code || "mail_error");
  return result;
}

async function requestWithTimeout(url, init, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, redirect: "follow", signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("邮箱服务请求超时");
      timeoutError.status = 504;
      timeoutError.code = "request_timeout";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response, provider) {
  const raw = await response.text();
  if (raw.length > MAX_RESPONSE_CHARS) throw new Error(`${provider} 响应过大`);
  try { return raw ? JSON.parse(raw) : {}; } catch {
    throw new Error(`${provider} 返回了无法解析的响应`);
  }
}

function providerMessage(data) {
  return String(data?.error_description || data?.error?.message || (typeof data?.error === "string" ? data.error : ""))
    .replace(/[\r\n]+/g, " ")
    .slice(0, 220);
}
