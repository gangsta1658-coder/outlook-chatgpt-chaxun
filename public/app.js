const PAGE_SIZE = 100;
const input = document.querySelector("#account-input");
const checkButton = document.querySelector("#check-button");
const clearButton = document.querySelector("#clear-button");
const parseSummary = document.querySelector("#parse-summary");
const parseErrors = document.querySelector("#parse-errors");
const resultsBody = document.querySelector("#results-body");
const resultsCaption = document.querySelector("#results-caption");
const pagination = document.querySelector("#pagination");
const pageLabel = document.querySelector("#page-label");
const prevPage = document.querySelector("#prev-page");
const nextPage = document.querySelector("#next-page");
const toast = document.querySelector("#toast");
const mailModal = document.querySelector("#mail-modal");
const mailClose = document.querySelector("#mail-close");
const mailDialogTitle = document.querySelector("#mail-dialog-title");
const mailDialogCaption = document.querySelector("#mail-dialog-caption");
const mailList = document.querySelector("#mail-list");
const mailListCount = document.querySelector("#mail-list-count");
const mailListEmpty = document.querySelector("#mail-list-empty");
const mailContent = document.querySelector("#mail-content");
const mailContentEmpty = document.querySelector("#mail-content-empty");
const mailContentSubject = document.querySelector("#mail-content-subject");
const mailContentFrom = document.querySelector("#mail-content-from");
const mailContentTime = document.querySelector("#mail-content-time");
const mailContentFolder = document.querySelector("#mail-content-folder");
const mailContentBody = document.querySelector("#mail-content-body");

let results = [];
let activeFilter = "all";
let page = 1;
let busy = false;
let activeMailbox = null;
let activeMessageIndex = -1;
let previousFocus = null;

input.addEventListener("input", updateParsePreview);
clearButton.addEventListener("click", () => {
  input.value = "";
  clearParsePreview();
});
checkButton.addEventListener("click", checkMailboxes);
document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    page = 1;
    document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
    renderResults();
  });
});
prevPage.addEventListener("click", () => { page = Math.max(1, page - 1); renderResults(); });
nextPage.addEventListener("click", () => { page += 1; renderResults(); });
resultsBody.addEventListener("click", handleResultAction);
mailList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-message-index]");
  if (!button) return;
  selectMessage(Number(button.dataset.messageIndex));
});
mailClose.addEventListener("click", closeMailbox);
mailModal.addEventListener("click", (event) => {
  if (event.target.matches("[data-close-mail-modal]")) closeMailbox();
});
mailModal.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeMailbox();
});
document.addEventListener("keydown", (event) => {
  if (mailModal.hidden) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeMailbox();
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    const direction = event.key === "ArrowDown" ? 1 : -1;
    if (activeMailbox?.messages?.length) {
      event.preventDefault();
      const next = activeMessageIndex < 0
        ? 0
        : (activeMessageIndex + direction + activeMailbox.messages.length) % activeMailbox.messages.length;
      selectMessage(next);
    }
  }
});

updateParsePreview();
renderResults();

function updateParsePreview() {
  const parsed = parseInputPreview(input.value);
  parseSummary.textContent = parsed.total
    ? `有效 ${parsed.valid} 条 · 错误 ${parsed.invalid} 条`
    : "等待输入";
  if (parsed.errors.length) {
    parseErrors.hidden = false;
    parseErrors.textContent = parsed.errors.slice(0, 8).join("\n") + (parsed.errors.length > 8 ? "\n…" : "");
  } else {
    clearParsePreview();
  }
}

async function checkMailboxes() {
  if (busy) return;
  const parsed = parseInputPreview(input.value);
  if (!parsed.valid) {
    showToast("请先输入至少一条完整的四段邮箱格式");
    updateParsePreview();
    return;
  }
  busy = true;
  checkButton.disabled = true;
  checkButton.textContent = "查询中…";
  try {
    const response = await fetch("/api/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: input.value }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "查询失败");
    results = Array.isArray(data.results) ? data.results : [];
    activeFilter = "all";
    page = 1;
    document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item.dataset.filter === "all"));
    input.value = "";
    clearParsePreview();
    renderResults();
    showToast(`已完成 ${results.length} 个邮箱的邮件查询`);
  } catch (error) {
    showToast(error.message || "查询失败");
  } finally {
    busy = false;
    checkButton.disabled = false;
    checkButton.textContent = "查询邮件";
  }
}

function renderResults() {
  const filtered = results.filter(matchesFilter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  page = Math.min(page, totalPages);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  resultsBody.innerHTML = pageItems.length
    ? pageItems.map(renderRow).join("")
    : '<tr class="empty-row"><td colspan="6">导入邮箱后，结果会显示在这里</td></tr>';
  resultsCaption.textContent = results.length ? `共 ${results.length} 个邮箱，结果仅来自邮箱邮件` : "还没有查询记录";
  updateFilterCounts();
  pagination.hidden = filtered.length <= PAGE_SIZE;
  pageLabel.textContent = `第 ${page} / ${totalPages} 页`;
  prevPage.disabled = page <= 1;
  nextPage.disabled = page >= totalPages;
}

function renderRow(item) {
  const email = escapeHtml(item.email);
  const credits = item.credits == null ? '<span class="muted">未找到</span>' : `<span class="number">${formatNumber(item.credits)}</span>`;
  const banned = item.status === "error"
    ? '<span class="badge error">查询失败</span>'
    : item.banned
      ? '<span class="badge banned">已封禁</span>'
      : '<span class="badge ok">未发现</span>';
  const reward = item.status === "error"
    ? '<span class="badge error">未完成</span>'
    : item.rewardStatus === "found"
      ? `<span class="badge ok">已识别${item.rewardReceivedAt ? ` · ${formatTime(item.rewardReceivedAt)}` : ""}</span>`
      : '<span class="muted">未找到</span>';
  const detail = item.status === "error"
    ? `<span class="detail error" title="${escapeHtml(item.error || "邮箱读取失败")}">${escapeHtml(item.error || "邮箱读取失败")}</span>`
    : item.banned
      ? `<span class="detail" title="${escapeHtml(item.bannedSubject || "OpenAI API - Access Deactivated")}">${escapeHtml(item.bannedSubject || "OpenAI API - Access Deactivated")}</span>`
      : `<span class="detail">已读取 ${item.messageCount || 0} 封邮件</span>`;
  const messageCount = Array.isArray(item.messages) ? item.messages.length : 0;
  const viewButton = messageCount
    ? `<button class="view-button" type="button" data-view-mail="${results.indexOf(item)}" title="打开邮件列表">查看邮件 <span>${messageCount}</span></button>`
    : "";
  return `<tr>
    <td><div class="email-cell"><span class="email-text" title="${email}">${email}</span><button class="copy-button" type="button" data-email="${email}">复制</button></div></td>
    <td>${credits}</td>
    <td>${banned}</td>
    <td>${reward}</td>
    <td class="time">${formatTime(item.checkedAt)}</td>
    <td><div class="detail-cell">${detail}${viewButton}</div></td>
  </tr>`;
}

function handleResultAction(event) {
  const copyButton = event.target.closest(".copy-button");
  if (copyButton) {
    copyEmail(copyButton.dataset.email);
    return;
  }
  const viewButton = event.target.closest("[data-view-mail]");
  if (!viewButton) return;
  const item = results[Number(viewButton.dataset.viewMail)];
  if (item) openMailbox(item);
}

function openMailbox(item) {
  const messages = normalizeMessages(item.messages);
  activeMailbox = {
    email: String(item.email || ""),
    messages,
    messagesTruncated: item.messagesTruncated === true,
  };
  activeMessageIndex = -1;
  previousFocus = document.activeElement;
  mailDialogTitle.textContent = activeMailbox.email || "邮箱邮件";
  mailDialogCaption.textContent = `${messages.length} 封邮件 · 仅显示本次读取结果${activeMailbox.messagesTruncated ? " · 批量过大，部分正文已省略" : ""}`;
  mailListCount.textContent = String(messages.length);
  mailListEmpty.hidden = messages.length > 0;
  mailList.innerHTML = messages.map(renderMessageListItem).join("");
  mailModal.hidden = false;
  if (typeof mailModal.showModal === "function" && !mailModal.open) mailModal.showModal();
  document.body.classList.add("modal-open");
  resetMessageContent();
  mailClose.focus();
  if (messages.length) selectMessage(0);
}

function closeMailbox() {
  if (mailModal.hidden) return;
  if (typeof mailModal.close === "function" && mailModal.open) mailModal.close();
  mailModal.hidden = true;
  document.body.classList.remove("modal-open");
  activeMailbox = null;
  activeMessageIndex = -1;
  mailList.replaceChildren();
  resetMessageContent();
  if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
  previousFocus = null;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && typeof message === "object")
    .map((message, index) => {
      const body = typeof message.body === "string"
        ? message.body
        : message.body && typeof message.body === "object"
          ? (message.body.content || message.body.text || message.body.body || "")
          : "";
      return {
        id: String(message.id || message.messageId || `message-${index}`),
        subject: String(message.subject || "无主题").trim() || "无主题",
        from: senderText(message.from || message.sender) || "未知发件人",
        receivedDateTime: String(message.receivedDateTime || message.receivedAt || message.date || ""),
        folder: String(message.folder || "").trim(),
        body: String(body).slice(0, 128 * 1024),
        bodyPreview: String(message.bodyPreview || message.text || "").slice(0, 16 * 1024),
      };
    });
}

function senderText(value) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  const address = value.emailAddress || value.address || value.email || value;
  if (typeof address === "string") return address.trim();
  if (address && typeof address === "object") {
    const name = String(address.name || "").trim();
    const email = String(address.address || address.email || "").trim();
    return name && email ? `${name} <${email}>` : name || email;
  }
  return "";
}

function renderMessageListItem(message, index) {
  const preview = bodyText(message).replace(/\s+/g, " ").slice(0, 150);
  const received = formatTime(message.receivedDateTime);
  return `<button class="mail-list-item" type="button" role="option" aria-selected="false" data-message-index="${index}" aria-label="${escapeHtml(message.subject)}，${escapeHtml(received)}">
    <span class="mail-list-subject">${escapeHtml(message.subject)}</span>
    <span class="mail-list-meta">${escapeHtml(message.from)} · ${escapeHtml(received)}</span>
    <span class="mail-list-preview">${escapeHtml(preview || "（无正文预览）")}</span>
  </button>`;
}

function selectMessage(index) {
  if (!activeMailbox?.messages?.length) return;
  const nextIndex = Math.max(0, Math.min(index, activeMailbox.messages.length - 1));
  const message = activeMailbox.messages[nextIndex];
  activeMessageIndex = nextIndex;
  mailList.querySelectorAll("[data-message-index]").forEach((button) => {
    const selected = Number(button.dataset.messageIndex) === nextIndex;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  });
  mailContent.hidden = false;
  mailContentEmpty.hidden = true;
  mailContentSubject.textContent = message.subject || "无主题";
  mailContentFrom.textContent = message.from || message.sender || "未知发件人";
  mailContentTime.textContent = formatTime(message.receivedDateTime || message.receivedAt || message.date);
  mailContentFolder.textContent = message.folder || "—";
  mailContentBody.textContent = bodyText(message)
    || (activeMailbox.messagesTruncated ? "（本次批量过大，这封邮件的正文未返回）" : "（这封邮件没有可显示的正文）");
}

function resetMessageContent() {
  mailContent.hidden = true;
  mailContentEmpty.hidden = false;
  mailContentSubject.textContent = "";
  mailContentFrom.textContent = "—";
  mailContentTime.textContent = "—";
  mailContentFolder.textContent = "—";
  mailContentBody.textContent = "";
}

function bodyText(message) {
  let value = String(message?.body || "");
  if (!value.trim()) value = String(message?.bodyPreview || "");
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<(br|\/p|\/div|\/li|\/tr)\s*\/?>/gi, "\n")
    .replace(/<\/?(?:a|body|div|em|h[1-6]|head|html|img|li|ol|p|pre|span|strong|table|tbody|td|th|tr|ul)\b[^>]*>/gi, " ")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function matchesFilter(item) {
  if (activeFilter === "banned") return item.banned === true;
  if (activeFilter === "ok") return item.status === "ok" && item.banned === false;
  if (activeFilter === "error") return item.status === "error";
  return true;
}

function updateFilterCounts() {
  const counts = {
    all: results.length,
    banned: results.filter((item) => item.banned === true).length,
    ok: results.filter((item) => item.status === "ok" && item.banned === false).length,
    error: results.filter((item) => item.status === "error").length,
  };
  document.querySelectorAll(".filter").forEach((button) => {
    const span = button.querySelector("span");
    if (span) span.textContent = counts[button.dataset.filter] ?? 0;
  });
}

function parseInputPreview(value) {
  const lines = String(value || "").split(/\r?\n/).filter((line) => line.trim());
  const errors = [];
  let valid = 0;
  for (const [index, line] of lines.entries()) {
    const parts = line.trim().split("----");
    if (parts.length < 4) { errors.push(`第 ${index + 1} 行：需要四段`); continue; }
    const [email, password, clientId, ...token] = parts.map((part) => part.trim());
    if (!/^\S+@\S+\.\S+$/.test(email)) { errors.push(`第 ${index + 1} 行：邮箱格式不正确`); continue; }
    if (!password || !clientId || !token.join("----")) { errors.push(`第 ${index + 1} 行：四段均不能为空`); continue; }
    valid += 1;
  }
  return { total: lines.length, valid, invalid: errors.length, errors };
}

function clearParsePreview() {
  parseErrors.hidden = true;
  parseErrors.textContent = "";
}

async function copyEmail(email) {
  try {
    await navigator.clipboard.writeText(email);
    showToast("邮箱已复制");
  } catch {
    showToast("复制失败，请手动选择邮箱");
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value));
}

function formatTime(value) {
  const date = new Date(value || "");
  return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", { hour12: false }) : "—";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[character]));
}

let toastTimer;
function showToast(message) {
  toast.hidden = false;
  toast.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3600);
}
