#!/usr/bin/env python3
import json
import sys
import imaplib
import socket
from datetime import timezone
from email import policy
from email.parser import BytesParser
from email.header import decode_header, make_header
from email.utils import parsedate_to_datetime


MAX_MESSAGE_BYTES = 512 * 1024
MAX_BODY_CHARS = 8 * 1024


def fail(message, code="imap_error", status=0):
    print(json.dumps({
        "error": {
            "code": str(code)[:80],
            "message": str(message)[:240],
            "status": int(status or 0),
        },
    }, ensure_ascii=True))
    return 1


def parse_message(uid, raw):
    raw = raw[:MAX_MESSAGE_BYTES]
    message = BytesParser(policy=policy.default).parsebytes(raw)
    body_parts = []
    parts = message.walk() if message.is_multipart() else [message]
    for part in parts:
        if part.get_content_maintype() != "text":
            continue
        if part.get_content_disposition() == "attachment":
            continue
        try:
            content = part.get_content()
        except Exception:
            continue
        if content:
            body_parts.append(str(content))
    received = None
    if message.get("Date"):
        try:
            parsed = parsedate_to_datetime(str(message.get("Date")))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            received = parsed.isoformat()
        except Exception:
            received = str(message.get("Date"))
    return {
        "id": uid.decode("ascii", "replace"),
        "messageId": str(message.get("Message-ID", "")),
        "subject": decode_mime_header(message.get("Subject", "")),
        "bodyPreview": "\n\n".join(body_parts)[:MAX_BODY_CHARS],
        "receivedDateTime": received,
        "from": str(message.get("From", "")),
    }


def decode_mime_header(value):
    try:
        return str(make_header(decode_header(str(value or ""))))
    except Exception:
        return str(value or "")


def main():
    try:
        payload = json.load(sys.stdin)
        email = str(payload.get("email", "")).strip()
        token = str(payload.get("accessToken", "")).strip()
        host = str(payload.get("host", "outlook.live.com")).strip()
        port = int(payload.get("port", 993))
        max_messages = max(1, min(int(payload.get("maxMessages", 100)), 100))
        max_total_messages = max(max_messages, min(int(payload.get("maxTotalMessages", 300)), 300))
        folders = payload.get("folders") or [
            "INBOX",
            "Junk Email",
            "Junk",
            "Archive",
            "Deleted Items",
            "Deleted",
            "Other",
            "Clutter",
        ]
        if not isinstance(folders, list):
            folders = ["INBOX"]
        if not email or not token:
            return fail("IMAP OAuth credentials are incomplete", "imap_auth_failed", 401)
        timeout = max(5, min(int(payload.get("timeout", 30)), 60))
        client = imaplib.IMAP4_SSL(host, port, timeout=timeout)
        try:
            auth = f"user={email}\x01auth=Bearer {token}\x01\x01".encode()
            auth_status, auth_data = client.authenticate("XOAUTH2", lambda _challenge: auth)
            if auth_status != "OK":
                # Do not echo the server challenge; it may contain token-related
                # material and is not useful to the caller.
                return fail("IMAP OAuth authentication failed", "imap_auth_failed", 401)
            messages = []
            seen_message_ids = set()
            fetch_failures = 0
            selected_folders = 0
            for folder in folders:
                if len(messages) >= max_total_messages:
                    break
                select_status, _ = client.select(str(folder), readonly=True)
                if select_status != "OK":
                    continue
                selected_folders += 1
                search_status, data = client.uid("search", None, "ALL")
                if search_status != "OK" or not data or not data[0]:
                    continue
                remaining = max_total_messages - len(messages)
                recent_uids = data[0].split()[-min(max_messages, remaining):]
                targeted_uids = []
                for term in ('"Access Deactivated"', '"OpenAI API"', '"ChatGPT Desktop referral reward"'):
                    try:
                        target_status, target_data = client.uid("search", None, "SUBJECT", term)
                        if target_status == "OK" and target_data and target_data[0]:
                            targeted_uids.extend(target_data[0].split()[-25:])
                    except Exception:
                        continue
                ordered_uids = []
                seen_uids = set()
                for uid in list(reversed(targeted_uids)) + list(reversed(recent_uids)):
                    if uid in seen_uids:
                        continue
                    seen_uids.add(uid)
                    ordered_uids.append(uid)
                uids = ordered_uids[:min(max_messages, remaining)]
                for uid in reversed(uids):
                    if len(messages) >= max_total_messages:
                        break
                    # RFC822 is accepted by Outlook.com more consistently than
                    # BODY.PEEK[] and still leaves the message unread.
                    status, fetched = client.uid("fetch", uid, "(RFC822)")
                    if status != "OK":
                        fetch_failures += 1
                        continue
                    raw_parts = [
                        item[1]
                        for item in fetched
                        if isinstance(item, tuple) and len(item) > 1 and isinstance(item[1], bytes)
                    ]
                    if not raw_parts:
                        continue
                    parsed = parse_message(uid, b"".join(raw_parts))
                    message_key = parsed.get("messageId") or f"{folder}:{parsed.get('id')}"
                    if message_key in seen_message_ids:
                        continue
                    seen_message_ids.add(message_key)
                    parsed["folder"] = str(folder)
                    messages.append(parsed)
            if not messages and fetch_failures and selected_folders:
                return fail("IMAP message body fetch failed", "imap_fetch_failed", 502)
            print(json.dumps({"messages": messages, "folders": selected_folders}, ensure_ascii=True))
            return 0
        finally:
            try:
                client.logout()
            except Exception:
                pass
    except (imaplib.IMAP4.error, socket.timeout, TimeoutError, OSError) as exc:
        detail = str(exc).lower()
        if "auth" in detail or "login" in detail or "credential" in detail or "oauth" in detail:
            return fail("IMAP OAuth authentication failed", "imap_auth_failed", 401)
        return fail("IMAP service is temporarily unavailable", "imap_network_failed", 503)
    except Exception:
        return fail("IMAP request failed", "imap_error", 0)


if __name__ == "__main__":
    raise SystemExit(main())
