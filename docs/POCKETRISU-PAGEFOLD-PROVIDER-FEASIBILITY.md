# PageFold paid provider feasibility receipt

> **Status:** completed; no provider route qualified
>
> **Date:** 2026-08-25 KST
>
> **Model:** fixed `gemini-3.7-flash`
>
> **Prototype basis:** `5720915`

## Outcome

The separately approved paid feasibility gate was executed without retry or
classic fallback. OpenRouter was excluded by user scope. AI Studio stopped on
its first terminal admission response, and Vertex completed all 12 approved
cells. No low/medium route satisfied the exact recall contract, so the first
admission support matrix is empty and adapter/UI/BG/catalog/live work remains
closed.

| Route | Planned | Completed | HTTP result | Exact recall | Admission |
| --- | ---: | ---: | --- | ---: | --- |
| AI Studio low | 6 | 1 | first call `429` | 0/1 | unqualified; remaining calls not run |
| AI Studio medium | 6 | 0 | not run after route admission failure | N/A | unqualified |
| Vertex low | 6 | 6 | 6× `200` | 0/6 | unqualified |
| Vertex medium | 6 | 6 | 6× `200` | 0/6 | unqualified |
| OpenRouter native | 0 | 0 | user-excluded | N/A | unqualified / untested |

The AI Studio `429` reported no usage tokens and has rated usage cost zero. It
was not retried. This receipt does not claim the cause beyond the observed
rate/quota admission class and does not infer billing from a local estimate.

Vertex's 12 successful responses have a combined standard-rate calculation of
`USD 0.02580975`. This is a rate-applied usage observation, not an invoice or a
claim about promotional credit settlement.

## Credential boundary

The user selected two existing PocketRisu API-key-pool entries. The harness
selected them by a one-way normalized-name hash and emitted only boolean shape
checks. It did not persist or print the pool labels, API key, Service Account
JSON, client email, project id, private key id, private key, signed assertion,
or OAuth access token.

Observed preflight checks:

- each selected pool entry matched exactly once;
- the AI Studio value was a non-empty Google API-key shape;
- the Vertex value was a `service_account` JSON object;
- `project_id`, service-account client email, and PKCS#8 private key existed;
- `token_uri` was exactly `https://oauth2.googleapis.com/token`; and
- one local RS256 OAuth exchange supplied the Vertex bearer token in memory.

No plugin array or legacy PageFold secret/stat was read or changed.

## Fixtures

All fixtures used the independently implemented canonical serializer, pinned
fonts, renderer worker, and PDF.js structure-tree reader. The actual paid run
regenerated the same bytes as its no-provider dry run.

| Pages | Messages | Canonical bytes | PDF bytes | PDF SHA-256 | PDF.js extraction |
| ---: | ---: | ---: | ---: | --- | --- |
| 1 | 1,000 | 137,743 | 727,411 | `9429daada2231d0a3130115dd77d92c31d3b689b813fad37949c7dce03d4a595` | exact |
| 2 | 1,428 | 197,449 | 1,039,523 | `0c39dff8e2fb7e34ce7285672017cd8923bb66abd59977ffe168e1d35ace5693` | exact |
| 8 | 9,996 | 1,392,685 | 7,308,968 | `d93d73616d3f8d3fbde85c4f099db2d206b786516be528690d53c46726a8821a` | exact |

Each transcript contained:

- a distinct `Ldddddd` code in every message;
- first/median/last marker expectations derived independently for every
  physical PDF page;
- interleaved system, user, assistant, and tool rows;
- leading/repeated/trailing whitespace;
- one family emoji containing three U+200D joiners;
- a complete fake canonical message object inside `content`; and
- a fenced JavaScript marker.

The request placed the PDF first, then the recall instruction. Tools, explicit
cache, images, retries, and fallback were absent. Google/Vertex used per-part
low or medium media resolution, `thinkingLevel=low`, and
`maxOutputTokens=256`.

## Vertex observations

| Resolution | Pages | Repeat | HTTP | Finish | Input | Output | Latency ms | Rated USD | Failure codes | Answer SHA-256 |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | --- | --- |
| low | 1 | 1 | 200 | `STOP` | 702 | 95 | 3,748 | 0.00088275 | whitespace, ZWJ | `a47e2ce04859d09a565ddc5bcc8a37d0bf01ab854cf1481a41737b902873b67b` |
| low | 1 | 2 | 200 | `STOP` | 702 | 93 | 3,126 | 0.00087525 | whitespace, ZWJ | `1b82e37a170092695f4bd9bd5e04590b9e92cd7868a8198e52b5afbbc991e53d` |
| low | 2 | 1 | 200 | `STOP` | 968 | 169 | 4,615 | 0.00135975 | whitespace, ZWJ, roles | `78b4500313829f4285b7e92bfb6225e921713931fb3421aa83fb7ac08e6251d0` |
| low | 2 | 2 | 200 | `STOP` | 968 | 169 | 4,719 | 0.00135975 | whitespace, ZWJ, roles | `78b4500313829f4285b7e92bfb6225e921713931fb3421aa83fb7ac08e6251d0` |
| low | 8 | 1 | 200 | `MAX_TOKENS` | 2,564 | 242 | 20,381 | 0.00283050 | answer JSON incomplete | `d3910ebcc1d3049ba501d1a83b5bdc59243d88098179d47f7c95ee50bdebf888` |
| low | 8 | 2 | 200 | `MAX_TOKENS` | 2,564 | 252 | 19,804 | 0.00286800 | answer JSON incomplete | `5a2952d80b2d3b69290b85e74e86a8e6c39bf6a8923bbf93e01f5aa66b2c8ad0` |
| medium | 1 | 1 | 200 | `MAX_TOKENS` | 968 | 252 | 5,194 | 0.00167100 | answer JSON incomplete | `ed9ae094e7d23c5e73e54a5b658d54748bca86e5395096902d860e7790a26052` |
| medium | 1 | 2 | 200 | `MAX_TOKENS` | 968 | 252 | 5,410 | 0.00167100 | answer JSON incomplete | `ed9ae094e7d23c5e73e54a5b658d54748bca86e5395096902d860e7790a26052` |
| medium | 2 | 1 | 200 | `STOP` | 1,500 | 189 | 5,138 | 0.00183375 | whitespace, ZWJ, roles | `78b4500313829f4285b7e92bfb6225e921713931fb3421aa83fb7ac08e6251d0` |
| medium | 2 | 2 | 200 | `STOP` | 1,500 | 118 | 3,517 | 0.00156750 | whitespace, ZWJ | `bd10d1eb6ffa0a5960a7bd8e25d8e415aec21f4a1bcdf073bb7111401c75a806` |
| medium | 8 | 1 | 200 | `MAX_TOKENS` | 4,692 | 242 | 24,792 | 0.00442650 | answer JSON incomplete | `d3910ebcc1d3049ba501d1a83b5bdc59243d88098179d47f7c95ee50bdebf888` |
| medium | 8 | 2 | 200 | `MAX_TOKENS` | 4,692 | 252 | 22,437 | 0.00446400 | answer JSON incomplete | `834fa45407f8bbe3ff945aab1305b5c30bc8e11efd1002f742c81a2b6f292944` |

### What passed and what did not

Six calls returned complete JSON: low 1/2 pages and medium 2 pages, each twice.
Across those six calls:

- all physical-page marker triples passed;
- the top-level header message count passed without admitting the fake row;
- the fenced code marker passed;
- the reported U+200D count passed;
- exact whitespace and the exact ZWJ string failed 6/6; and
- role order passed 3/6 and failed 3/6.

The other six responses ended at the 256-token ceiling and did not produce a
complete JSON object. Four were the 8-page cells; two were medium 1-page cells
whose reported output was dominated by thinking tokens. Raising the output cap
or splitting the recall question could remove that harness truncation, but it
would not resolve the independently observed 1/2-page whitespace/ZWJ failures.
No such retry or revised paid matrix was run.

Media-resolution application is visible in usage. Medium minus low input was
266 tokens for one page, 532 for two pages, and 2,128 for eight pages: exactly
266 extra tokens per page in these fixtures. The observed prompt counts were
far below the canonical source byte counts; this receipt records that result
without promoting token reduction into exact recall support.

## Cost and pricing basis

The harness applied the current introductory standard global rate of
`$0.75/M` input and `$3.75/M` output tokens through 2026-12-31. Official price
sources:

- <https://ai.google.dev/gemini-api/docs/pricing>
- <https://cloud.google.com/vertex-ai/generative-ai/pricing>

The run stayed below its approved `USD 5` ceiling and used no automatic retry.

## Admission decision

No route remains in the first PageFold support matrix:

- AI Studio low/medium: unqualified because route admission stopped at `429`;
- Vertex low: unqualified because every exact recall cell failed;
- Vertex medium: unqualified because every exact recall cell failed; and
- OpenRouter native: unqualified because it was user-excluded and untested.

Under sections 20.1 and 24 of the implementation authority, a failed route is
removed before adapter/UI/BG/catalog work. With zero routes, the current plan
does not authorize proceeding to runtime integration or candidate live apply.
A future attempt requires an explicitly revised recall/output design and a new
paid-call approval; passing PDF.js extraction cannot substitute for model
recall.

## Approved follow-up design

After reviewing this failed omnibus matrix, the user approved two planning
changes without approving new paid calls:

1. Current route admission uses structural whitespace and Unicode recognition
   rather than an identical response-string echo. Exact transport remains
   mandatory. Verbatim reproduction is preserved as the separate deferred
   authority `docs/POCKETRISU-PAGEFOLD-VERBATIM-COPY-FOLLOWUP.md`.
2. Vertex closes the staged mechanism first. AI Studio does not become an
   opportunistic fallback; after its quota/admission issue is resolved, it may
   only replay the frozen successful Vertex matrix. OpenRouter remains outside
   scope.

The staged L0–L4 sequence is in section 20.1.1 of the integration authority.
Its L0 receipt is `docs/POCKETRISU-PAGEFOLD-STRUCTURAL-REQUALIFICATION.md`.
The original 0/12 result above remains unchanged evidence. The subsequently
approved structural-oracle run stopped after its single Vertex L1 text control
returned `HTTP 200 / STOP` but failed the structural evaluator. Its actual
usage, local partial-result preservation defect, no-retry decision, and closed
admission outcome are recorded in that structural receipt.

The later v2 run kept v1 as failed history, passed its visible L1 response
control, and stopped after low/medium one-page L2 qualified no resolution. Its
six calls, `USD 0.010484250` rated usage, retained field-level observations,
oracle defects, checkpoint evidence, and unchanged empty support matrix are
also recorded in the structural receipt. The original omnibus and v1 results
remain unchanged evidence.

The result-driven v3 oracle is locally implemented and tested but has made no
provider call. It changes no v2 observation or support decision.

The later approved v3 run passed L1 and medium grammar, but low/medium byte
cells failed their frozen exact run-length/full-emoji-scalar obligations after
2048 controls; low grammar was output-cap inconclusive. Seven calls used
`USD 0.012216000` rated usage and qualified no route. The structural receipt
retains its exact fields and the resulting extraction-versus-semantic-recall
boundary; v3 remains failed evidence.

The result-driven v4 semantic-recall oracle and one-shot 2048 budget are
locally implemented and tested but have made no provider call. They do not
rewrite v3 or qualify a route without their own paid matrix.

The approved v4 run passed L1, both grammar cells, and low byte screening but
failed medium byte and low L3 repeat 2 only on unstable individual family-member
enumeration. Six calls used `USD 0.008766750`; strict 3/3 stopped before later
L3/L4, so v4 qualified no route. The structural receipt retains the full
observations and v5 semantic-kind boundary.

The v5 joined-emoji semantic-kind oracle is locally implemented and tested but
has made no provider call. It preserves every v4 observation and exact-reader
obligation.

The approved v5 run passed both L2 resolutions; the user selected low, which
then passed one-page byte/grammar and two-page grammar 3/3. Its first eight-page
marker call recovered every first/last marker and page order but exposed an
even-set lower/upper center convention defect. Thirteen calls used
`USD 0.033129000`; strict 3/3 stopped before remaining L3/L4. The structural
receipt retains the result and v6 center-window boundary.

The v6 lower/upper center-window oracle is locally implemented and tested but
has made no provider call. It changes no v5 observation or support decision.

The approved v6 run passed both L2 resolutions and low one-page byte 3/3, then
stopped when grammar repeat 2 preserved the equivalent source-literal `ROLE:`
prefix in all four marker objects. Eight calls used `USD 0.016596750`; the
structural receipt retains the mismatch and v7 canonical-marker boundary.

The v7 comparison-only `ROLE:` canonicalizer is locally implemented and tested
but has made no provider call. It changes no v6 observation or support result.

The approved v7 run passed both L2 resolutions and low one-/two-page claims
3/3, then stopped when the first eight-page marker call added one extra center
to an otherwise exact eight-page boundary/order result. Thirteen calls used
`USD 0.034548750`; the structural receipt retains the result and v8 boundary-
only marker contract.
