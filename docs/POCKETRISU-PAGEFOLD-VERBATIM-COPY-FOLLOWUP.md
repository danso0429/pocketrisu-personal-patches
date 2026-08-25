# PageFold verbatim-copy follow-up

> **Status:** deferred; not part of current route admission
>
> **Date:** 2026-08-25 KST
>
> **Authority:** `docs/POCKETRISU-PAGEFOLD-INTEGRATION-PLAN.md`

## Decision

Current provider admission proves that the model can **recognize** the exact
logical content carried by the PDF. It does not require the model to reproduce
that content byte-for-byte in a generated answer.

Byte-sensitive recognition uses structural answers:

- whitespace is reported as run lengths, positions, and code points;
- ZWJ/variation/tag content is reported as an ordered Unicode code-point list;
- role/order, fake-record isolation, and page markers use compact identifiers;
- PDF.js continues to prove exact canonical bytes independently of the model.

Verbatim copying remains a separate deferred capability. It is not removed or
treated as unimportant; it is isolated so response normalization cannot be
mistaken for PDF-reading failure.

## Why it is separate

An exact echo combines two different claims:

1. the model perceived the source characters correctly; and
2. the model's response generator reproduced the same characters without
   trimming, Unicode normalization, formatting, or serializer changes.

The first claim is required for PageFold context understanding. The second may
be required for code, templates, signatures, structured payloads, or other
copy-exact workflows, but it is not equivalent to ordinary conversational
recall.

The 2026-08-25 paid run demonstrated this distinction: complete responses
reported the correct U+200D count while their returned ZWJ string differed, and
they recovered page markers, fake-row boundaries, and code markers while exact
whitespace echo differed. That result cannot identify whether perception or
output normalization changed the returned string without a structural control.

## Activation triggers

This follow-up becomes active when at least one of these is true:

- a real workflow requires byte-identical copying from PageFold context;
- code, JSON, HTML, prompt templates, or preformatted text are observed to
  change when the model is asked to reproduce them;
- the product is going to claim exact source reproduction rather than exact
  transport plus context understanding;
- a provider/model/output API change offers a stronger constrained-copy mode;
- a physical L3 scenario exposes a user-visible copy-fidelity regression.

It does not activate merely because a normal answer paraphrases source text.

## Deferred test contract

When activated, qualification must keep text-only and PDF inputs paired so
source perception and output serialization remain distinguishable.

### Content matrix

- leading, repeated, and trailing spaces;
- tabs, LF, CRLF, CR, literal `\n`, and literal `\\n`;
- NBSP and other non-breaking separators;
- NFC/NFD combining sequences;
- ZWJ emoji, variation selectors, tag characters, and bidi controls;
- JSON, HTML, code fences, escaping, long URLs, and no-whitespace strings;
- fake canonical header/message records inside content;
- short records and records crossing line, column, and page boundaries.

### Evidence per cell

- text-only control bytes;
- PDF control bytes;
- complete response and finish reason;
- UTF-8 byte equality after response parsing;
- source and response code-point sequences;
- Unicode normalization form before and after;
- whitespace-run comparison;
- first differing byte/code-point offset and bounded surrounding context;
- provider usage, resolution, page count, and repeated-run identity.

Synthetic copied text may be retained in a private test artifact because it is
the evidence under test. Credentials, user content, PDF Base64, and provider
tokens remain prohibited from that artifact.

### Admission rule

- A provider/resolution/mode may claim **verbatim copy support** only when every
  required cell passes all repeats byte-for-byte.
- Majority success is not sufficient.
- A truncation is an output-budget/harness result, not a copy-fidelity result.
- A structural-recognition pass cannot be promoted to verbatim-copy support.
- A verbatim-copy failure does not retroactively invalidate contextual PageFold
  support unless the advertised workflow requires exact reproduction.

## Product disclosure while deferred

If structural PageFold support is admitted before this follow-up, documentation
and UI must say that exact code/whitespace/Unicode reproduction is not yet
qualified. PageFold may be used for context understanding, but users should not
rely on it as a byte-exact document copier until this file's gate is activated
and passed.
