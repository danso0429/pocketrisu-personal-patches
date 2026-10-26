# Session record: E1, the move of PocketRisu from Node 25 to Node 24 (2026-10-26)

**Covers:** 2026-10-26 00:43:10 – 04:52 UTC (09:43 – 13:52 KST). This is one Claude Code orchestrator session. Its context was compacted once, at 02:26:54 UTC, and the work continued in the same session afterwards.
**Earlier record touched in this session:** `docs/records/2026-10-26-g22-d3-session.md` (the previous session's D3 record). This session only appended a note to it about a commit hash change (see §3.1). That record's contents are not repeated here.
**Sources:** this session's transcript, the files this session created or changed, and the output of commands this session ran. The event list was extracted mechanically from the transcript: 227 events, 20 user messages and one compaction marker. It was then checked in time order.

## 1. Terms

- **PocketRisu:** a self-hosted chat front end (Node.js server and Svelte client). The live instance runs on the project's ARM64 Linux server under PM2.
- **Patcher:** this repository. It applies feature packs to an exact PocketRisu release and can revert them. The installer is `dist/pocketrisu-patcher.cjs`.
- **BG (background preservation):** the patcher feature that runs a whole generation on the server so that it completes while the client is away. Code lives in the pack `lazy-chat-bg-adapter` and others.
- **BG plugin host:** an internal, server-only candidate feature that runs RisuAI plugins in background requests. It is enabled only by the environment variable `POCKETRISU_BG_PLUGIN_HOST_CANDIDATE=1` and is OFF by default.
- **Plugin sandbox:** `patches/lazy-chat-bg-adapter/files-1.10/server/node/bgPluginSandbox.cjs`. It starts each plugin worker as `systemd-run` (a user scope with resource limits) → `prlimit` → `bwrap` (bubblewrap, with new namespaces including network) → `node --permission`.
- **Canon / ordered goals:** `docs/BG-PRESERVE-ORDERED-GOALS.md` in the planning repository (`danso0429/nai-studio`, public). It defines the execution order of the BG work. Items E1 and E2 are steps inserted before G2.3: E1 is the Node 24 move, and E2 is the PocketRisu 1.16.1 rebase.
- **E1 plan:** `docs/BG-E1-NODE24-PLAN.md` in the planning repository, written in this session. Its unit IDs are:
  - E1-1: allow the sandbox on Node 24;
  - E1-2: Node 24 global tools;
  - E1-3: isolated qualification;
  - E1-4: live cutover;
  - E1-5: new-shell default;
  - E1-6: records.
- **Candidate gate:** a local script that checks a patcher candidate in 19 steps:
  - builds the installer twice and checks that the two builds are identical;
  - runs the repository tests;
  - applies the candidate to a pristine PocketRisu 1.10.0 copy and runs that tree's tests, compat tests, `svelte-check`, the production build and the BG bundle build;
  - checks apply→revert round-trip cleanliness.
  It prints `RESULT: PASS|FAIL`.
- **Probe:** an explicit integration test under `scripts/probe-*.cjs`. Probes need real systemd, bubblewrap or servers, so they are not part of the portable tests. They run through a local wrapper that kills the whole process group at the end.
- **Roles in this session:**
  - Orchestrator: the main Claude Code session (Opus 5.5).
  - Astra: Codex `gpt-6-astra`, read-only plan reviewer.
  - Codex test author: `gpt-5.6-sol`, writes blind tests before the implementation exists.
  - Codex code reviewer: `gpt-6.1-sol`, read-only.
  - Argon: Gemini 4 Argon through the Antigravity CLI, proposes test scenarios from the plan alone.
  - Claude subagents: `opus-implementer`, `validation-runner`, `general-purpose`.
- **Test tags:** `[unchanged]` means the test must pass before the implementation exists. `[new]` means it must fail before the implementation, on a behavior assertion.

## 2. State at the end of the session

| Item | State | Commit / push |
|---|---|---|
| E2 pre-integration (D2/D3 on `origin/main`) | Done | patcher `28e4ef1`, `6737534` pushed; planning `370a371` pushed |
| E1 plan, two Astra rounds | Done | planning `4139303`, `61b9c40`, `6200aba` pushed |
| E1-1 sandbox allowed on Node 24 (release 0.2.4-experimental.88, adapter 0.7.83) | Done | patcher `7c84a00` pushed, CI success |
| E1-2 Node 24 global tools | Done | no repository change |
| E1-3 isolated qualification of the live app on Node 24 | Done | no repository change |
| E1-4 rehearsal and live cutover | Done. Live app, PM2 daemon, logrotate and the systemd unit run Node 24.22.1 | no repository change |
| E1-5 new-shell default (`.profile`, nvm default alias) | Done | local files, not in a repository |
| E1-6 records | Done | planning `68f2884` committed, **not pushed** |
| Canon line "checks before enabling the plugin host" | Written | planning `docs/BG-PRESERVE-ORDERED-GOALS.md` modified, **not committed** |
| Session-record guideline saved for reuse | Done | local Claude Code skill and memory files, not in a repository |
| This record | Written | **not committed** |
| Live patcher | Unchanged (lazy-chat-bg-adapter 0.7.62, plugin host OFF) | — |

## 3. Work items

### 3.1 State check and E2 pre-integration (00:43 – 00:48)

- **Trigger:** At 00:43:10 the user asked to read the canon, check the current state and identify the next work. At 00:47:04 the user pre-approved E2 ("E2 사전승인 ok") and asked for the E1 plan first.
- **Facts:**
  - The canon placed E2 pre-integration first: push D3 commit `68b7426` so the 1.10.0-based work is on one line.
  - `68b7426` had diverged from `origin/main`. `origin/main` had `84014e0`, a records-only commit. This was read from git in the worktree `d3-output-sync`.
- **Action (orchestrator):**
  1. Rebased `68b7426` onto `origin/main`. The result is `28e4ef1`. The trees differed only by the `84014e0` record file.
  2. Appended an integration note to the D3 session record and committed it (`6737534`).
  3. Ran the sensitive-information sweep and pushed the patcher `main` (`6737534`).
  4. Recorded the push in the canon header and pushed the planning repository (`370a371`).
- **Result:** patcher CI on the pushed head completed with success.
- **Remaining:** none. Documents that cite `68b7426` mean `28e4ef1`; the canon header says so.

### 3.2 E1 planning and the Node 24 vs 26 decision (00:48 – 02:21)

- **Trigger:** the user's 00:47:04 request to write the E1 plan.
- **Facts gathered by the orchestrator, from commands:**
  - Installed Node versions and global packages.
  - PM2 apps and the PM2 dump. A `require()` of `dump.pm2` returned `{}`; the file was then parsed as JSON (00:53:24–00:53:29).
  - The PM2 systemd unit.
  - Cron jobs.
  - How the MCP servers are launched.
  - A 2026-10-21 Node 24 assessment and handoff.
  - The sandbox's version gate `bgPluginSandbox.cjs:32`. It refuses Node major < 25 with `plugin_sandbox_environment_unsupported`.
  - The official Node release index.
- **User decisions:**
  - At 00:52:32:
    - cutover method = a short planned restart, replacing the 10-21 handoff's "zero downtime first" parallel-instance idea;
    - scope = the live process plus the PM2 daemon, the systemd unit, `.profile` and the nvm default;
    - `pnpm audit` Critical/High clean-up and MCP credential rotation = a separate task outside E1.
  - At 00:56:19, the user asked for a concrete, evidence-based comparison of 24 and 26 before choosing the target.
- **Measurement and research:** two subagents started at 00:57:27 and 00:57:43.
  - A `validation-runner` (130,687 tokens) measured Node 24.22.1, 25.9.0 and 26.12.1 on the same patcher commit `6737534`.
  - A `general-purpose` agent (119,501 tokens) read the official Node documentation.
  - The observed values recorded in the plan (F9–F12):

    | Measurement | Node 24 | Node 25 | Node 26 |
    |---|---|---|---|
    | Candidate gate | 19/19 | 19/19 | 19/19 |
    | Sandbox probe | 0/15 (version gate) | 15/15 | 1/15 |
    | Worker probe | 2/12 | 12/12 | 2/12 |
    | Host probe | hit the 600 s limit | 197/197 | hit the 600 s limit |

    - The gate test counts were identical on the three versions.
    - On 26 the sandbox fails because `new Socket({ fd: 3 })` (`bgPluginWorker.cjs:876`) is refused with `ERR_ACCESS_DENIED`.
    - On 24, with only the version check removed in a copy, the bubblewrap network namespace blocked plugin network access: host loopback `ECONNREFUSED`, external IP `ENETUNREACH`, DNS `EAI_AGAIN`.
    - Node 24's permission model has no network control (`--allow-net` was added in 25.0.0).
  - Official sources:
    - the Node permissions document calls the model a "seat belt" (`doc/api/permissions.md:14-20` at v26.12.1);
    - better-sqlite3 12.9.0 does not support Node 26;
    - upstream PocketRisu v1.10.0 and v1.16.1 use `node:24-slim` and CI Node 24.
- **Comparison and decision:**
  - The user had asked for the result in the form "recommend 26 over 24 because …". The orchestrator reported that the evidence instead favored 24, and said so explicitly.
  - At 01:58:47 the user asked whether the unmeasured items could change the decision. At 01:59:47 the user asked how to set the criterion.
  - The orchestrator proposed the rule: follow the runtime upstream ships, and deviate only for a measured security or functional need.
  - At 02:01:48 the user decided on Node 24 and asked what the plan must change.
- **Plan written:** at 02:04:08 the plan was written and linked from the canon.
  - Astra round 1 ran 02:04:35 – about 02:10:50 and returned 7 findings. All were checked against code and adopted:
    1. The sandbox probe fixture accepts only `ERR_ACCESS_DENIED` as network blocking.
    2. A Node 25 control copy cannot share an ABI-specific tree with the Node 24 copy.
    3. PM2 `restart` merges env (`lib/God/ActionMethods.js:405`), so inherited session variables survive a restart.
    4. A temporary-`PM2_HOME` rehearsal alone does not test systemd ownership.
    5. Rollback lacked stop confirmation and shell restoration.
    6. The qualified code must equal the deployed code.
    7. Shell execution modes must be distinguished.
  - Round 2 ran 02:12:53 – about 02:19:35. It closed 1, 2, 3, 4 and 6, marked 5 and 7 as partly closed, and added 3 findings. All 3 were confirmed in PM2 and nvm source and adopted:
    1. The revised order started the app before stopping the daemon again. The app now becomes reachable only at the last step.
    2. Rollback assumed a healthy daemon. A `pm2` command with no daemon spawns one outside systemd (`lib/Client.js:104`), and the dump stores an absolute interpreter path (`lib/God/ForkMode.js:43-47`). Rollback became one offline path: `systemctl stop`, restore the dump, unit and binary, then `start`.
    3. An interactive child shell of a running session keeps its Node 25, because nvm keeps an already selected version (`nvm.sh:4570-4583`).
  - The plan was committed as `4139303`. Before the commit the orchestrator verified the cited PM2 source lines and ran the sweep (0 hits).
- **Result:** plan with facts F1–F19, the 24 vs 26 rule and its reconsideration triggers, units E1-1…E1-6, rollback, and the unverified items. Session scratchpad trees of 6,096 MB were deleted.
- **Remaining:** implementation, which started in §3.3.

### 3.3 E1-1: allow the plugin sandbox on Node 24 (02:58 – 04:08)

- **Trigger:** at 02:58:25 the user said "계획에 따라 이제 구현해보자" (implement per the plan).
- **Facts:**
  - **Version gate.** `bgPluginSandbox.cjs:32` refuses Node major < 25.
  - **Network judgment.** The fixture `scripts/fixtures/bg-plugin-sandbox-worker.cjs:20-21` counts network as blocked only on `ERR_ACCESS_DENIED`, and `scripts/probe-bg-plugin-sandbox.cjs:31` asserts `network: true`. These are code lines at `6737534`; `git diff --name-only 6737534..HEAD` on those paths was empty when the tests were requested.
  - **Old fixture target.** The old fixture sent its network attempt to `127.0.0.1:6001`, which is the live PocketRisu port.
  - **Version mutability.** `process.versions` is a configurable property with non-writable members, so a test can redefine it in-process. This was measured with `Object.getOwnPropertyDescriptor`.
- **Plan addition:** a test contract table for E1-1 was committed (`61b9c40`). Each row has input, existing state, expected result and out-of-scope items.
- **Argon:** the request was written from the plan only, with no code and no private paths, and run at 03:00:28. Status `SUCCESS`, 11,164 tokens.
  - Accepted with adjustments:
    - "resolves fully" became "is not rejected by the version check", because later steps need a user manager;
    - malformed version strings were dropped as outside the contract;
    - the cross-worker slice OOM case was dropped as new behavior beyond the contract.
- **Blind tests (Codex test author):** started at 03:02:16 with the tester permission profile and finished by 03:27.
  - Codex wrote:
    - `test/bg-plugin-sandbox-node24.test.cjs`: 11 portable tests;
    - `scripts/fixtures/bg-plugin-sandbox-network-judgment.cjs`: a pure judgment function;
    - changes to the sandbox fixture and probe. The probe now opens its own loopback listener and checks outside-sandbox controls, and it reports raw error codes.
  - Codex's self-check gate inside its sandbox stopped at the compat step, because `oauth2.googleapis.com` was blocked there. This is a known limit of that sandbox.
  - **Receipt check (orchestrator, 03:27 – 03:29):** portable tests on 24 and 25 gave 8 pass / 3 fail each. The 3 failures were the `[new]` version-acceptance assertions.
    - Two `[new]` judgment tests passed before the implementation, which violates the tag contract. A third, the `[new]` listener cleanup test in the probe, passed on the real Node 25 sandbox before the implementation.
    - The Node 25 probe gave 16/17. The one failure was the `[new]` command comparison, failing with `plugin_sandbox_environment_unsupported`.
    - The Node 24 probe gave 1/17, with every failure at the version gate.
    - The violation went back to the same Codex session (`codex exec resume`; the context was 103,741 input tokens, under the 150k rule). Only the three titles changed to `[unchanged]`, confirmed by `diff`.
    - `[unchanged]` tests then passed 3 out of 3 runs on 24 and 25, and the Node 25 probe gave 16/17 three times. SHA-256 values of the four fixed test files were recorded.
- **Implementation (`opus-implementer`, 03:30 – 03:42, 93,929 tokens):**
  - `bgPluginSandbox.cjs:32`: `< 25` → `< 24`. Nothing else in the file changed.
  - `docs/POCKETRISU-G1-6-PLUGIN-HOST-WIP.md:19` changed from "Node 25 or later" to "Node 24 or later", plus one paragraph on the Node 24 one-layer network limit and the CI scope. The patcher CI runs Node 22 and covers installer compatibility only.
  - `CHANGELOG.md`: entry 0.2.4-experimental.88.
  - `package.json`: 0.2.4-experimental.88.
  - `patches/lazy-chat-bg-adapter/manifest.cjs:28`: 0.7.83.
  - The version lines `test/g22a-capability.test.cjs:39` and `test/bg-independent-g1.test.cjs:17`.
  - Rebuilt `dist/pocketrisu-patcher.cjs`: 10,035,570 bytes, mode 755.
- **Review:**
  - The orchestrator read the full diff and confirmed that the four fixed test hashes were unchanged.
  - The Codex code reviewer (03:42:49 – 03:44:22) returned "No actionable findings".
- **Orchestrator gate and probe runs:**

  | Check | Node 24.22.1 | Node 25.9.0 |
  |---|---|---|
  | Candidate gate | 19/19 PASS | 19/19 PASS |
  | Client tests | 2664 passed / 4 skipped | same |
  | Server tests | 836 / 12 | same |
  | Compat | 123 / 5 | same |
  | Repository tests | 362 tests, 359 pass, 3 skipped (348 before + 11 new) | same |
  | Vite build | 8033 modules | same |
  | Sandbox probe | 17/17 | 17/17 |
  | Worker probe | 12/12 | 12/12 |
  | Host probe | 197/197 | 197/197 |

- **Commit:** after a sweep with 0 hits, committed as `7c84a00` at 04:07:52. It was pushed at 04:12 (§3.5) and CI completed with success.
- **Remaining:** the live patcher does not contain this change (§3.5).

### 3.4 E1-2: Node 24 global tools (04:08)

- **Facts:**
  - Node 25 globals: pm2 6.0.14, pnpm 10.33.0, typescript 7.0.2, typescript-language-server 6.0.2, an npm codex package and the opencode CLI.
  - Node 24 had only npm and corepack.
  - No configuration, cron entry or running process referenced opencode. It had its own config directory.
- **Action:** the orchestrator ran `npm install -g` with Node 24 for the four tools at the same versions, and verified the four versions.
  - Node 24's `pm2` was not run. It would attach to the live daemon through the shared PM2 home.
  - The live daemon PID (1352) was unchanged afterwards.
- **User decision (04:11:27):** do not install opencode on Node 24.

### 3.5 Live scope decision and pushes (04:08 – 04:17)

- **Facts (read-only):**
  - The live patcher state (`save/pocketrisu-patches/state.json`) lists 43 packs, lazy-chat-bg-adapter at 0.7.62.
  - The live PM2 env does not contain `POCKETRISU_BG_PLUGIN_HOST_CANDIDATE`, so the plugin host is OFF.
  - Version 0.7.62 was introduced by patcher `4ba4c68` (2026-10-17) and replaced in `eec13a9` (2026-10-18). This is from `git log -S`. The exact patcher commit that produced the live tree was not determined.
- **User decisions (04:11:27):**
  - keep the live patcher as it is, so E1-3 qualifies a copy of the live tree;
  - push both repositories;
  - no opencode on Node 24.
- **Action:** the decision was recorded in the plan (`6200aba`) and the sweep gave 0 hits. Then the pushes: patcher `6737534..7c84a00`, planning `370a371..6200aba`.
- **Result:** patcher CI on `7c84a00` completed with success (04:17:33).

### 3.6 E1-3: isolated qualification (04:13 – 04:21)

- **Who:** a `validation-runner` (161,589 tokens). It wrote only inside the session scratchpad.
- **Copies:** two copies of the live application tree from one snapshot, without `save/` or `backups/`, 2340 files each. File hashes outside `node_modules` were identical.
  - The Node 25 copy kept the live `node_modules` (better-sqlite3 binary SHA-256 `4c7ab383…`, ABI 141).
  - The Node 24 copy ran `pnpm install --frozen-lockfile --offline` in 17.3 s, giving binary SHA-256 `e059bc5d…` (ABI 137).
- **Native modules:** 18 `.node` files per copy. 11 loaded on both versions. 7 failed on both, because they are darwin, win32, linux x64 or musl builds. This corrects the plan's F14 wording "all 18 load".
- **Server checks:** server started with a fresh synthetic save each run, no `NODE_OPTIONS`, on loopback ports 46231 and 46232.
  - 27/27 checks passed on every run, 3 runs per version, with identical results:
    - listen and `/` 200;
    - login and the auth test;
    - chat-content read, write and read-back;
    - KV read and write;
    - the WebSocket proxy-stream relay;
    - bad WebSocket auth rejected;
    - one BG generation through `/api/bg-orchestrate` with a fake provider: terminal success, provider called once;
    - plugin host OFF: one enabled synthetic plugin produced exactly one `plugin_api_unsupported` notice with `server_plugin_host_disabled`, and the generation still succeeded.
  - The runner added `RISU_TUNNEL_DISABLED=true` and `RISU_UPDATE_CHECK=false` to its runs. Live may not set them.
- **sessionStorage:**
  - Node 25: native `sessionStorage` (it gained the key `risu-writer-session-id`).
  - Node 24: the BG KV shim, where a non-allowed key reads back as null.
  - BG results were identical on both.
- **Live DB integrity:** the live SQLite files were opened read-only (`readonly: true, fileMustExist: true`) and copied with better-sqlite3 `backup()`, without importing the app's `db.cjs`. Copy times:

  | DB | Size (bytes) | Copy time |
  |---|---|---|
  | risuai.db | 600,293,376 | 10.0 s |
  | request-logs.db | 281,894,912 | 6.6 s |
  | logs.db | 3,690,496 | 0.1 s |
  | model-jobs.db | 94,208 | 14 ms |
  | import-jobs.db | 16,384 | 7 ms |

  Node 24 opened the copies only. `quick_check` and `integrity_check` were ok for all 5. The copies were deleted.
- **Timing (synthetic save):** start to listen took 308–331 ms, and SIGTERM to exit 28–33 ms.
- **Orchestrator spot checks:**
  - both binary hashes;
  - 27/27 in the first summary of each version;
  - the copy directory no longer exists.

### 3.7 E1-4 rehearsal (04:21 – 04:28)

- **Facts (PM2 6.0.14 source, read by the orchestrator):**
  - `pm2 startup` accepts `--service-name` and `--hp`.
  - The unit is written to `/etc/systemd/system/<service_name>.service`, and the name defaults to `pm2-<user>`.
  - Unit `PATH` is the caller's `PATH`, with the node directory appended when it is missing (`lib/API/Startup.js`).
- **Who:** a `validation-runner` (80,768 tokens in the first run, 113,429 cumulative after resuming).
  - It was allowed exactly one throwaway unit, `pm2-e1rehearsal.service`, and a throwaway PM2 home.
  - Every `pm2` call went through a wrapper that refuses any other `PM2_HOME`.
- **First attempt (blocked):**
  - The PM2 home under the session scratchpad produced socket paths of 115–122 characters, over the unix socket limit of about 107. The first `pm2` call failed with `connect EINVAL …/interactor.sock`.
  - The runner stopped and asked instead of working around it.
  - The orchestrator allowed a short real directory under `/tmp` (not a symlink, because systemd may reject a PIDFile reached through symlinks), to be removed at the end.
- **Second attempt:**
  - **Baseline.** The rehearsal emulated the live layout under Node 25: one online dummy app, two stopped apps and logrotate.
  - **Window and Rollback A.** The full window ran, then Rollback A from the healthy Node 24 state. Every readback matched the plan:
    - MainPID was the new daemon;
    - daemon, logrotate and app ran Node 24;
    - the stopped apps stayed stopped;
    - the recreated app env had the needed key and no inherited variable.
  - **Rollback B (daemon never started).** It worked with no `pm2` command while no daemon ran.
  - **Window length.** 7.96 s.
- **Findings:**
  - With a PM2 home missing `logs/`, `pids/` and `touch`, `sudo pm2 startup` creates those three as root. The live PM2 home already had all three owned by the user, with 0 root-owned files.
  - The generated unit copies the caller's `PATH`, so `PATH` must be set explicitly.
  - The stopped apps keep their dump interpreter.
- **Live safety:** before and after the rehearsal the orchestrator saw the same values: live daemon PID 1352, unit SHA-256 `26833a51…`, 0 root-owned files. The throwaway unit and the `/tmp` directory were removed.

### 3.8 E1-4 live cutover (04:29 – 04:38)

- **Trigger:**
  - At 04:29:06 the orchestrator asked for approval with the exact sequence.
  - At 04:30:09 the user answered "지금 진행하는데, 근데 그 전에 궁금한 거. home/risuai-nodeonly 파일 경로와 연관있어?" (proceed, but first: is this related to the application directory?).
  - The orchestrator answered:
    - inside that directory only one native binary is swapped (the old file kept beside it) and a stopped save copy is added under `backups/`;
    - code, data and paths are unchanged;
    - the PM2 dump and the systemd unit live outside it.
  - It then proceeded.
- **Prechecks (read-only):**
  - PM2 metrics: Active requests 0, HTTP 0 req/min, 0 established TCP connections to the app.
  - `model_jobs`: done 44, aborted 6. `pending_sends`: 0.
  - BG operation states: delivered 185, cancelled 4, and `chat-committed` 1. The `chat-committed` operation had finished at 03:35:15 and was stored in the chat, waiting only for client delivery, which survives a restart by design.
- **Restore point:**
  - A fresh `pm2 save`.
  - Backups with SHA-256: `dump.pm2` `348d0a83…`, `module_conf.json` `c61568a7…`, the unit `26833a51…`, the Node 25 binary `4c7ab383…`, `.profile` `6767ea6b…`, and the nvm default alias (value `node`).
  - Baseline:
    - `/` returned 200;
    - the served `assets/index-BZHCt3xU.js` SHA-256 equaled the local file (`e5e874eb…`);
    - the error log was 440 bytes;
    - `LANG=C.UTF-8`.
- **Window (orchestrator, Node 25 `pm2` until the daemon move):**
  1. 04:31:55: `pm2 stop risuai-nodeonly`. PID 90961 gone and port 6001 closed.
  2. The stopped save directory was copied to `backups/e1-node24-save-20261026T043210Z` (883 MB, `diff -rq` clean).
  3. better-sqlite3 binary swapped: the Node 25 file was renamed `better_sqlite3.node.node25-e1` and the Node 24 file copied in. SHA-256 values confirmed.
  4. `pm2 delete risuai-nodeonly`, then `pm2 save`. The dump held the two stopped apps only.
  5. `sudo systemctl stop pm2-ubuntu`. Daemon 1352 and logrotate 1441 were gone.
     - The unit was regenerated with Node 24 `pm2 startup systemd -u ubuntu --hp <home> --service-name pm2-ubuntu`, with `PATH` starting at Node 24.
     - The unit content was verified: `PATH`, `ExecStart`, `ExecReload` and `ExecStop` on Node 24, `PIDFile` unchanged. There were 0 root-owned files.
     - `daemon-reload`, then `start`. New daemon 1653634 (Node 24) and logrotate 1653646 (Node 24) came up, and the stopped apps were stopped.
  6. App recreated at 04:38 under `env -i` with HOME, USER, LOGNAME, LANG, `PATH` (Node 24 first) and PM2_HOME, `--interpreter` Node 24, `--merge-logs` and the same out/error log paths. It was listening and `/` returned 200 at 04:38:21. Then `pm2 save`.
- **Readback:**
  - unit MainPID 1653634;
  - the app was in the unit cgroup and online with 0 restarts;
  - interpreter Node 24.22.1;
  - no difference in the recorded registration fields;
  - app env keys: HOME, USER, LOGNAME, LANG, PATH, PM2_HOME, PM2_USAGE, PWD, unique_id and the app name key. The live env before had 40 keys, including Claude Code session variables;
  - same served JS hash;
  - `quick_check` ok on 5 DBs;
  - error log still 440 bytes;
  - 0 root-owned files.
  A recheck at 04:43 showed the same: online, 0 restarts, 0 unstable restarts, `/` 200, 440 bytes.
- **Window length:** 04:31:55 – 04:38:21, about 6 min 26 s. The rehearsal took 7.96 s. The difference came from the orchestrator checking each step's output before the next command; the longest gap was 04:32:18 – 04:37:36.
- **Durable rollback copy:** at 04:43 the restore files were copied from the session scratchpad to `backups/e1-node24-rollback-20261026T043155Z/` in the application directory, and SHA-256 was verified (see §4).

### 3.9 E1-5: new-shell default (04:38 – 04:39)

- **Change:** `nvm alias default 24.22.1`. The `.profile` block that picked the highest installed version now reads the nvm default alias, and falls back to the highest version when the alias does not name an installed directory.
- **Results (`node -v`):**
  - new login shell: v24.22.1;
  - a child of a login shell: v24.22.1;
  - login interactive shell: v24.22.1;
  - a child shell of this already running session: v25.9.0;
  - an interactive shell of this already running session: v25.9.0.

  The last two match the plan: they inherit `PATH`, and nvm keeps a selected version. Crontab entries using Node: 0.
- **Not tested:** the fallback branch, where the alias names a missing version.

### 3.10 E1-6: records (04:39 – 04:44)

- **Codex tester sandbox re-probe** (`codex sandbox`, codex-cli 0.164.0, Node 24 first in `PATH`):
  - its own loopback connects;
  - host `127.0.0.1:6001` gives `ECONNREFUSED`;
  - external HTTPS is blocked (`TypeError`);
  - `pnpm install --frozen-lockfile --offline` of pristine PocketRisu 1.10.0 succeeded in 2 m 4.9 s with pnpm 10.34.1, and better-sqlite3 loaded with ABI 137.
- **Local environment-facts file** updated: runtime, sandbox judgment, sandbox re-probe.
- **Plan updates:** status, the F14 correction, and §10 results.
- **Canon header:** completion note. Committed as `68f2884`, sweep 0 hits.
- **Cleanup:** scratchpad trees of 4,892 MB and 4,025 MB were deleted. Disk use ended at 47 %.

### 3.11 Follow-up questions and the reuse of this guideline (04:48 – 04:52)

- **04:48:39 — do the remaining conditions need fixing?** The orchestrator answered: no separate action.
  - The adapter ≥ 0.7.83 requirement is met when the E2 output is applied live. If the host flag were set first, the sandbox refuses at `bgPluginSandbox.cjs:32-34`, with no unrestricted fallback. The client-visible effect of that refusal was not measured.
  - The one-layer network limit on Node 24 is the accepted cost of the choice. Exposure is zero while the host is OFF.
- **04:51:03 — add the check line, write this record, save the guideline.**
  - The user asked to add the "checks before enabling the plugin host" line, to write this record with the attached guideline, and to save the guideline so that a future "let's record" request uses it.
  - Action:
    - added item 4's sub-bullet to the canon;
    - saved the guideline verbatim as a local Claude Code skill (`session-record`);
    - added a memory entry with its index line and the project's always-on memory list.

## 4. Time-ordered events (UTC)

| Time | Event |
|---|---|
| 00:43:10 | User: read canon, check state, next work |
| 00:47:04 | User: E2 pre-approved, write the E1 plan first |
| 00:47:37 | `68b7426` rebased to `28e4ef1` |
| 00:47:54 | patcher `6737534` committed, then pushed |
| 00:48:16 | planning `370a371` committed, then pushed |
| 00:50:47 | A redaction regex failed and an MCP API key value appeared in tool output (§5) |
| 00:52:32 | User decisions: short restart, scope, audit and credential rotation separate |
| 00:56:19 | User: compare 24 and 26 with evidence |
| 00:57:27 / 00:57:43 | Measurement and research subagents started |
| 01:02:09 | Research subagent report |
| 01:46:44 | User: measurement item 4 still missing |
| 01:47:55 | User: finish everything, report plainly |
| 01:54:21 | Measurement subagent report |
| 01:58:47 / 01:59:47 | User: would the unmeasured items change the decision; how to set the criterion |
| 02:01:48 | User: decide on 24; what must the plan change |
| 02:04:08 | E1 plan written |
| 02:04:35 | Astra round 1 sent |
| 02:05:59 | User: anything after the review? no implementation yet |
| 02:12:53 | Astra round 2 sent |
| 02:20:51 | planning `4139303` committed |
| 02:21 | Cleanup 6,096 MB; ledger row |
| 02:26:54 | Context compaction |
| 02:58:25 | User: implement per the plan |
| 03:00:10 | planning `61b9c40` (test contract table) |
| 03:00:28 | Argon request |
| 03:02:16 | Codex test authoring started |
| 03:28:52 | Tag correction sent to the same Codex session |
| 03:30:13 | `opus-implementer` started |
| 03:42:13 | Implementer report |
| 03:42:49 | Codex code review started (result 03:44:22: no findings) |
| 03:42:51 – 04:07:37 | Gates and probes on Node 24, then Node 25 |
| 04:07:52 | patcher `7c84a00` committed |
| 04:08:16 | Node 24 global tools installed |
| 04:11:27 | User decisions: keep live patcher, push both, no opencode |
| 04:12:07 | planning `6200aba` committed; both repositories pushed |
| 04:13:11 | E1-3 `validation-runner` started |
| 04:17:33 | CI success on `7c84a00` |
| 04:20:47 | E1-3 report |
| 04:22:00 | Rehearsal `validation-runner` started |
| 04:23:07 | Rehearsal blocked (socket path length) |
| 04:23:29 | Short directory allowed; rehearsal resumed |
| 04:27:58 | Rehearsal report |
| 04:29:06 | Approval request for the live window |
| 04:30:09 | User: proceed, with a question about the application directory |
| 04:31:15 | Restore point and baseline |
| 04:31:55 | Live app stopped |
| 04:32:10 | Save copy started |
| 04:32:18 | App registration deleted; PM2 unit stopped |
| 04:37:36 | Unit regenerated with Node 24 |
| 04:37:50 | Unit started; Node 24 daemon and logrotate up |
| 04:38:21 | App listening; `/` 200 |
| 04:39:17 | nvm default 24.22.1, shell checks |
| 04:39:36 / 04:39:50 | Codex tester sandbox re-probe; offline install in sandbox |
| 04:43:09 | Rollback files copied to the durable backups directory |
| 04:43:28 | planning `68f2884` committed (not pushed) |
| 04:48:39 | User: do the remaining conditions need fixing? |
| 04:51:03 | User: add the check line, record E1, save the guideline |

## 5. Errors, wrong judgments and corrections

1. **A credential appeared in tool output.**
   - What happened: at 00:50:47, while listing how MCP servers are launched, a redaction regex did not match the configuration format, and an API key value of a local MCP server was printed into the session's tool output.
   - Impact: the value is in the local session transcript. It was not copied into any file, commit, request or report.
   - Follow-up: credential rotation was already a separate task by the user's 00:52:32 decision. Its value is not repeated here.
2. **`require()` of the PM2 dump.**
   - What happened: it returned `{}`, because the file has no `.json` extension.
   - Fix: it was parsed with `JSON.parse` instead.
   - Impact: none.
3. **The first plan's cutover and rollback design.**
   - What happened: Astra found the faults listed in §3.2 (rounds 1 and 2). Most serious were the app becoming reachable mid-window and a rollback that ran `pm2` commands while no daemon existed.
   - Fix: both were corrected in the plan before any live action, and confirmed against PM2 source.
4. **The first plan's E1-1 scope.**
   - What happened: it missed that the probe fixture accepts only `ERR_ACCESS_DENIED`. A version-only change would have failed the sandbox probe on Node 24 even with working isolation.
   - Fix: added to the scope after Astra round 1.
5. **Contradicting the user's example wording.**
   - What happened: the user's example asked for "recommend 26 over 24 because …". The evidence pointed the other way.
   - How it was handled: the orchestrator reported 24, stated the contradiction explicitly, and the user chose 24.
6. **Tag contract violation in the blind tests.**
   - What happened: three tests tagged `[new]` exercised only test-side helpers and passed before the implementation.
   - Fix: they were retagged `[unchanged]` in the same Codex session, titles only.
   - Cause: the test-authoring brief did not say that tests of test-side helpers take `[unchanged]`.
7. **Rehearsal output path too long.**
   - What happened: the orchestrator's brief fixed the PM2 home under the session scratchpad, whose socket paths exceed the unix limit.
   - Impact: one blocked rehearsal attempt, with no system change.
   - Fix: a short directory was allowed and removed afterwards.
8. **Rollback files only in a temporary location.**
   - What happened: from 04:31 to 04:43 the restore files for the live cutover (dump, unit, module config, Node 25 binary, `.profile`, alias) existed only in the session scratchpad, which is not durable.
   - Fix: found while writing the results, then copied to the application's `backups/` directory with SHA-256 verified.
   - Impact: no rollback was needed in that interval.
9. **Live window longer than rehearsed.**
   - What happened: the live window took about 6 min 26 s instead of the rehearsed 8 s, because the orchestrator ran the steps as separate commands and checked each output.
   - Impact: PocketRisu did not answer for that time. No generation was active (§3.8 prechecks).
10. **Minor tool errors.**
    - A `sleep` before a CI query was blocked by the harness (04:12:25). It was replaced with a background wait loop.
    - Two summary `grep` commands at 03:27:55 and 03:28:01 matched nothing and returned exit 1. They were re-run with the correct patterns.
    - Results were not affected.

## 6. Cost

Claude and Codex values are account-wide windows, measured with the local quota script.

| Interval (UTC) | Tool | 5 h window | Weekly | Notes |
|---|---|---|---|---|
| 00:43 – 00:44 | Claude Code | +1 % | +0 % | Max 5x plan values |
| 00:44 – 02:21 | Claude Code | +7 % | +1 % | Two other Claude sessions reported briefly in this interval |
| 00:44 – 02:21 | Codex | +42 % | +7 % | 5 h window reset once. This session's share: Astra round 1 +22 / +3, round 2 +11 / +2. The remaining +9 / +2 was other work |
| 02:58 – 04:09 | Claude Code | +3 % | +1 % | |
| 02:58 – 04:09 | Codex | +27 % | +4 % | This session's share: test authoring (with the resume) +22 / +4, code review +2 / +0. The remaining +3 was not split by session |
| 02:58 – 04:09 | Antigravity Argon (weekly only) | — | +0.33 % | One call, 11,164 tokens |
| 04:09 – 04:43 | Claude Code | +4 % | +0 % | 5 h window reset once. Two other sessions reported once each at 04:10 |
| 04:09 – 04:43 | Codex | +0 % | +0 % | The two `codex sandbox` probes did not change the windows |

The interval 04:43 – 04:52 (this record and the guideline) was not measured. Marked unverified.

Subagent tokens, from completion notices:

| Subagent | Task | Tokens |
|---|---|---|
| validation-runner | Node 24/25/26 measurement | 130,687 |
| general-purpose | official Node documentation | 119,501 |
| opus-implementer | E1-1 implementation | 93,929 |
| validation-runner | E1-3 qualification | 161,589 |
| validation-runner | E1-4 rehearsal | 80,768 first run, 113,429 cumulative after resume |

## 7. Unresolved items and next steps

1. **Push the planning commits.** `68f2884` is committed but not pushed. The canon edit and this record are not committed. Both need the user's instruction. Run the sweep before pushing.
2. **Plugin host activation.**
   - Condition: before setting `POCKETRISU_BG_PLUGIN_HOST_CANDIDATE=1` on live, apply a patcher with lazy-chat-bg-adapter ≥ 0.7.83. The canon item 4 now lists this check.
   - Expected path: E2, the PocketRisu 1.16.1 rebase, is built on `origin/main` (which contains `7c84a00`), so applying the E2 result satisfies it.
3. **Accepted limit.** On Node 24, plugin network denial is the kernel network namespace only. The reconsideration triggers are the ones in the E1 plan §4.
4. **Unmeasured items:**
   - the client-visible effect of a sandbox refusal while the host is ON on adapter 0.7.62;
   - the `.profile` fallback branch;
   - live start-up time on the full-size DB, because E1-3 timed only a synthetic save;
   - which exact patcher commit produced the live tree (0.7.62 spans `4ba4c68`..`eec13a9`).
5. **Cleanup of rollback material.** These follow the existing backup policy once Node 24 has run without problems:
   - `backups/e1-node24-save-20261026T043210Z/` (883 MB);
   - `backups/e1-node24-rollback-20261026T043155Z/`;
   - the renamed Node 25 binary beside the active one.
6. **Next canon step:** E2.

## 8. Appendix

### 8.1 Commits made in this session

| Repository | Commit | Time (UTC) | Subject | Pushed |
|---|---|---|---|---|
| patcher | `28e4ef1` | 00:47:37 (rebase of `68b7426`) | feat(bg-plugin-host): continue afterRequest timers after the chat commit | yes |
| patcher | `6737534` | 00:47:54 | docs(records): record the G2.2 D3 session | yes |
| planning | `370a371` | 00:48:16 | docs(bg): record the 1.10.0 integration push before the 1.16.1 rebase | yes |
| planning | `4139303` | 02:20:51 | docs(bg): plan the Node 24 move (E1) and record why 24 rather than 26 | yes |
| planning | `61b9c40` | 03:00:10 | docs(bg): add the E1-1 test contract table | yes |
| patcher | `7c84a00` | 04:07:52 | feat(bg-plugin-host): allow the plugin sandbox on Node 24 | yes |
| planning | `6200aba` | 04:12:07 | docs(bg): record E1-1 and E1-2 results and the live patcher decision | yes |
| planning | `68f2884` | 04:43:28 | docs(bg): record the E1 Node 24 move results | no |

### 8.2 Uncommitted files and non-repository changes

- Planning repository: `docs/BG-PRESERVE-ORDERED-GOALS.md` (the host-activation check line).
- Patcher repository: this file.
- Local configuration outside the repositories:
  - `.profile`;
  - the nvm default alias;
  - the PM2 systemd unit and dump;
  - the swapped better-sqlite3 binary in the live application;
  - the Node 24 global packages;
  - the local environment-facts and usage-ledger files;
  - the `session-record` skill;
  - the memory entry and project instruction lines.
