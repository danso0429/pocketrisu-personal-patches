# 2026-10-21 — Text box copy button pastes URL-encoded text on iOS (recorded, not investigated)

Status: user report recorded for later investigation. No code was read or changed; the cause below is an inference from the symptom only.

## Symptom (reported by the owner, iPhone)

- PocketRisu text boxes have three buttons below them: copy content, clear content, and expand box.
- Copying with the **copy button** and pasting **inside PocketRisu** produces a lower-cased prefix and percent-encoded text. Example: text starting `Rule: 현지 일본인의 …` with Korean, Japanese, spaces, quotes and line breaks pastes as `rule:%20%ED%98%84…%0A-%20Example%201%20(Fluent%20Japanese…`.
- A two-paragraph text `Rule: 정상` / blank line / `규칙: 정상` pastes as `rule:%20…%0A%0A%EA%B7%9C…`.
- Text that starts with `규칙: 정상` (Korean first) pastes unchanged.
- The same copy-button content pastes **correctly in other apps**.
- Selecting the text and copying with the **iOS system copy** pastes correctly, also inside PocketRisu.

## What the output shows

The pasted value is the text serialized as a URL: the leading `Rule:` became a lower-cased URL scheme (`rule:`), and the remainder was percent-encoded as a URL path (space → `%20`, UTF-8 bytes of Korean and Japanese, line break → `%0A`). A URL scheme must start with an ASCII letter, which explains why text starting with Korean is unaffected. The trigger is therefore text that begins with an ASCII word immediately followed by `:`.

## Probable cause (inference, unverified)

When a web page writes text to the clipboard through the web clipboard API on iOS WebKit, a string that parses as a URL appears to be stored with a URL representation as well. Native apps paste the plain-text representation (correct), while web content in Safari or the home-screen web app takes the URL representation and receives its serialized, percent-encoded form. The system copy does not go through the web API, so it is unaffected. Which API the copy button uses, and the exact WebKit condition, were not checked; iOS version differences are possible.

Why it was not noticed before (inference): it needs all of — text beginning with an ASCII word and a colon, the copy button (not system copy), and pasting back into web content.

## Workarounds

- Start the text with a non-ASCII character, or write `Rule :` (space before the colon).
- Use the system copy (select text → Copy).

## Next steps when picked up

1. Find the copy button's implementation (upstream PocketRisu or a patcher pack) and the clipboard API it uses.
2. Compare on a real iPhone: `navigator.clipboard.writeText`, `navigator.clipboard.write([new ClipboardItem({'text/plain': blob})])`, and a hidden textarea with `document.execCommand('copy')`, pasting into PocketRisu and into another app, with texts that start with `Word:` and with Korean.
3. Fix only the copy path; keep the clear and expand buttons unchanged.
