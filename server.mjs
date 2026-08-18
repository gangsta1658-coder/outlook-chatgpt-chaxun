#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { inspectMailbox } from "./mail-service.mjs";
import { inspectMailboxMessages, parseFourPartInput, serializeMailboxMessages } from "./mail-parser.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_ROOT = path.join(ROOT, "public");
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 4399);
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_ACCOUNTS = 100;
const CHECK_CONCURRENCY = 4;
const MAIL_TIMEOUT_MS = 25_000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  setSecurityHeaders(res);
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/healthz") {
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/check") {
      return await handleCheck(req, res);
    }
    if (req.method === "GET" || req.method === "HEAD") {
      return await serveStatic(url.pathname, req.method, res);
    }
    return sendJson(res, 405, { error: "????????" });
  } catch (error) {
    const status = Number(error?.status || 500);
    return sendJson(res, status >= 400 && status < 600 ? status : 500, {
      error: status === 413 ? "??????" : "???????????",
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`mail-audit-site listening on ${HOST}:${PORT}`);
});

async function handleCheck(req, res) {
  const payload = await readJsonBody(req);
  const parsed = parseFourPartInput(payload?.input, MAX_ACCOUNTS);
  if (!parsed.accounts.length) {
    return sendJson(res, 400, {
      error: "??????????",
      errors: parsed.errors,
    });
  }

  const results = await mapConcurrent(parsed.accounts, CHECK_CONCURRENCY, inspectAccount);
  return sendJson(res, 200, fitResponseBudget({
    results,
    errors: parsed.errors,
    checkedCount: results.length,
    totalLines: parsed.totalLines,
  }));
}

async function inspectAccount(account) {
  const checkedAt = new Date().toISOString();
  const base = {
    email: account.email,
    checkedAt,
    credits: null,
    rewardStatus: "not_found",
    rewardReceivedAt: null,
    banned: null,
    bannedReceivedAt: null,
    bannedSubject: null,
    messageCount: 0,
    messages: [],
    messagesTruncated: false,
    status: "error",
    error: null,
  };
  try {
    const mailbox = await inspectMailbox(account, {
      maxMessages: 100,
      maxTotalMessages: 300,
      timeoutMs: MAIL_TIMEOUT_MS,
    });
    const { matchedMessageIndexes, ...parsed } = inspectMailboxMessages(mailbox.messages);
    const exposedMessages = serializeMailboxMessages(mailbox.messages, {
      maxMessages: 100,
      maxBodyChars: 8 * 1024,
      maxPreviewChars: 2 * 1024,
      maxTotalBodyChars: 1024 * 1024,
      priorityIndexes: matchedMessageIndexes,
    });
    return {
      ...base,
      ...parsed,
      messages: exposedMessages,
      messagesTruncated: mailbox.messages.length > exposedMessages.length,
      status: "ok",
      error: null,
    };
  } catch (error) {
    return {
      ...base,
      error: sanitizeClientError(error),
    };
  }
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function serveStatic(pathname, method, res) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const relative = decodeURIComponent(requested).replace(/^\/+/, "");
  const filePath = path.resolve(PUBLIC_ROOT, relative);
  if (filePath !== PUBLIC_ROOT && !filePath.startsWith(`${PUBLIC_ROOT}${path.sep}`)) {
    return sendJson(res, 400, { error: "????" });
  }
  let stat;
  try { stat = await fs.stat(filePath); } catch { return sendJson(res, 404, { error: "?????" }); }
  if (!stat.isFile()) return sendJson(res, 404, { error: "?????" });
  res.statusCode = 200;
  res.setHeader("content-type", MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream");
  res.setHeader("cache-control", requested === "/index.html" ? "no-store" : "public, max-age=300");
  if (method === "HEAD") return res.end();
  res.end(await fs.readFile(filePath));
}

async function readJsonBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("payload too large");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    const error = new Error("invalid json");
    error.status = 400;
    throw error;
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-length", Buffer.byteLength(payload));
  res.end(payload);
}

function fitResponseBudget(response) {
  if (jsonByteLength(response) <= MAX_RESPONSE_BYTES) return response;

  // Preserve the selectable message list first, then progressively remove the
  // heavier body fields when a very large batch would exceed the public limit.
  const withoutBodies = transformResultMessages(response.results, (message) => ({
    ...message,
    body: "",
  }));
  const bodyTrimmed = { ...response, results: withoutBodies };
  if (jsonByteLength(bodyTrimmed) <= MAX_RESPONSE_BYTES) return bodyTrimmed;

  const metadataOnly = transformResultMessages(withoutBodies, (message) => ({
    ...message,
    bodyPreview: "",
  }));
  const previewTrimmed = { ...response, results: metadataOnly };
  if (jsonByteLength(previewTrimmed) <= MAX_RESPONSE_BYTES) return previewTrimmed;

  const limited = metadataOnly.map((result) => Array.isArray(result.messages)
    ? { ...result, messages: result.messages.slice(0, 25), messagesTruncated: true }
    : result);
  const listTrimmed = { ...response, results: limited };
  if (jsonByteLength(listTrimmed) <= MAX_RESPONSE_BYTES) return listTrimmed;

  return {
    ...response,
    results: response.results.map((result) => Array.isArray(result.messages) && result.messages.length
      ? { ...result, messages: [], messagesTruncated: true }
      : result),
  };
}

function transformResultMessages(results, transform) {
  return results.map((result) => {
    if (!Array.isArray(result.messages) || !result.messages.length) return result;
    return {
      ...result,
      messages: result.messages.map(transform),
      messagesTruncated: true,
    };
  });
}

function jsonByteLength(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

function setSecurityHeaders(res) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader(
    "content-security-policy",
    "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; connect-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'",
  );
}

function sanitizeClientError(error) {
  return String(error?.message || "??????")
    .replace(/https?:\/\/\S+/gi, "<????>")
    .replace(/(?:access_token|refresh_token|client_secret|password)\s*[=:]\s*[^\s,}]+/gi, "$1=<???>")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 220);
}
