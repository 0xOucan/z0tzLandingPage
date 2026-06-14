# Z0tz V7 Landing + Relayer + API + DB — Architectural Review

Read-only architectural review (2026-06-14). Scope: `landing/` — the `/api/v7/*`
surface, `lib/relayer/*`, `lib/indexer/*`, `lib/openapi/*`, `lib/sdk-v7-types`.
Focus: structural debt, fragility, design risk. Not a line audit.

---

## 1. Request-pipeline architecture

### Canonical pipeline (write routes)

```
HTTP POST /api/v7/<op>
  └─ withApiLog("/api/v7/<op>", handler)            # request-log.ts
       │  clone req → sha256(body) → bodyHash
       ├─ handler(req, ctx)
       │    ├─ geofenceResponse(req)                 # geofence.ts (write routes)
       │    ├─ isEnabled() RELAYER_PRIVATE_KEY gate  # v7.ts
       │    ├─ [auth: requireOrgAuth | admin key | resolveAuth | NONE]
       │    ├─ parseJson(req)                         # api-helpers.ts → 400 on bad JSON
       │    ├─ <Schema>.safeParse(json)               # schemas-v7.ts (zod) → 400
       │    ├─ [scope check: rootNameHash == key.subdomainRootHash]  (org only)
       │    └─ submitX(chainId, req)                  # v7.ts submitter
       │         ├─ v7Deployment(chainId)             # JSON.parse(DEPLOYMENT_V7_<id>)
       │         ├─ clients(chainId)                  # RPC_URL_<id> + RELAYER_PRIVATE_KEY
       │         ├─ simulateOrThrow(pub, args)        # eth_call; revert → 400 sentinel
       │         ├─ estimateOrFallback (2x margin)
       │         ├─ wallet.writeContract → txHash     # BROADCAST (relayer pays gas)
       │         ├─ scheduleIndexerMirror(after())    # → mirrorTxLogsToV7 → typed tables
       │         └─ [scheduleNameCacheBackfill]       # name routes only
       └─ after(work): logApiEvent(api_events)        # status, txHash, chainId, errorCode
```

### Uniformity assessment

- **`withApiLog` + `api_events` log: uniform.** Every `/api/v7/*` route is wrapped
  except `/api/v7/openapi` (a static spec endpoint — acceptable). The sync per-request
  log is the one genuinely coherent, universal layer.
- **`parseJson` + zod: uniform for body routes.** GET routes (resolve, scan, tezcatli
  reads) hand-parse query params instead — minor, but query validation is ad-hoc
  (`Number(searchParams.get(...))` with no schema) vs. body validation (zod).
- **`geofence` + `isEnabled`: NOT uniform.** Present on relaying routes (spend, org/*);
  absent on cosign/read routes. This is mostly intentional (cosign doesn't broadcast)
  but it is hand-wired per route, not enforced.
- **`simulateOrThrow` before broadcast: uniform across v7.ts submitters** (Bug-#4 fix).
  Good. The `onchain_simulation_failed:` sentinel → 400 mapping, however, is
  **re-implemented in every route** (`msg.startsWith(...)`), with two variants
  (`ONCHAIN_SIM_FAILED` const in org routes, string literal in spend). Drift-prone.

### The 4-places-in-sync coupling (per endpoint)

Each write endpoint requires manual coherence across **four** artifacts:

| Artifact | File | Risk if drifts |
|---|---|---|
| Route handler | `app/api/v7/<op>/route.ts` | wrong status/auth |
| Submitter + **ABI** | `lib/relayer/v7.ts` | empty-data revert / wrong selector |
| Zod request schema | `lib/openapi/schemas-v7.ts` | over/under-validation |
| OpenAPI registration | `registerPath(...)` in the route | docs lie to SDK consumers |

Mitigations in place: request **interfaces** are re-exported from `lib/sdk-v7-types`
(F-6 fix — one type definition), and the zod schema is reused for both runtime
validation and OpenAPI (registered inline in the route, so spec≈behavior). **But the
ABI lives only in `v7.ts`** and is the single most drift-prone artifact — the file is
a graveyard of comments documenting past selector mismatches (V7-FINAL #1/#10/#14,
F-6 plainAmount, M-3 tuple). There is no compile-time check that the local ABI matches
the deployed contract; the only guard is runtime `simulateContract`, which catches
drift *after* deploy, in production, as a user-facing 400.

**Verdict (pipeline):** structurally sound and notably uniform on logging + validation;
fragile on (a) the per-route re-implemented sim-error mapping and (b) the hand-maintained
ABIs in `v7.ts` decoupled from the contracts package.

---

## 2. Auth-model architecture — 4 schemes, zero shared middleware

| Scheme | Mechanism | Where verified | Routes |
|---|---|---|---|
| **Passkey P-256** (user tier) | `verifyRelayerAuth` (auth.ts) | **NOWHERE in v7** | — |
| **On-chain P-256** (de-facto user tier) | contract validator on the signed SpendOp/claim | the contract, post-broadcast | spend, cashin, multispend, names, airdrop, recover, fund-stealth |
| **Org HMAC** (M-7, body-bound) | `requireOrgAuth` → `authenticateOrgRequest` (turso-v7) | org-auth.ts middleware | org/{usage,recover,policy,subdomain,subdomain/repoint,subdomain/revoke} |
| **Admin key** (`timingSafeEqual`) | `constantTimeEq(header, Z0TZ_ADMIN_KEY)` | inline in route | admin/issue-org-key |
| **Resolve P-256 anti-enum** | `verifyResolveAuth` (inline, own P-256 parse) | inline in route | resolve/[nameHash] |

### Key architectural findings

1. **`verifyRelayerAuth` (the named "passkey" scheme) is dead code in v7.** No v7
   route calls it. The OpenAPI `passkey` security scheme is advertised on spend/etc.,
   but the server performs **no passkey check** — authorization is delegated entirely
   to the on-chain validator. This is a *defensible* design (the sig is contract-bound),
   but it means: (a) the documented auth scheme is misleading; (b) the relayer will
   broadcast and pay gas to *simulate* unauthenticated griefer traffic before the
   contract rejects it — sim catches it pre-broadcast (no gas burned on revert), but
   there is no pre-sim rate-gate tied to identity, only per-IP.

2. **Three independent P-256 verification implementations.** `auth.ts`
   (`verifyRelayerAuth`), `resolve/[nameHash]/route.ts` (`verifyResolveAuth`), and the
   CLI all re-implement hex→bytes, pubkey assembly, and `p256.verify`. The resolve one
   is a hand-rolled copy. 3 copies = 3 ways to get prehash/encoding wrong.

3. **No shared auth middleware.** Each scheme is hand-wired into each route. Org auth
   is the only one with a reusable middleware (`requireOrgAuth` returns
   `{auth, finalize}`), and even it requires the route to remember to call
   `finalize(status)` at every exit (manual, easy to miss — and a missed `finalize`
   silently drops the `org_audit_log` row).

4. **Two parallel audit logs for org calls.** `api_events` (via withApiLog) AND
   `org_audit_log` (via `finalize`). They can disagree: withApiLog logs every exit;
   `finalize` only logs the exits the author remembered to wrap. The org/policy route,
   for example, awaits `finalize(...)` on each branch — but this is convention, not
   enforced by the type system.

**Verdict (auth):** 4 schemes, only 1 with reusable middleware, 3 duplicated P-256
impls, 1 advertised-but-unimplemented scheme. This is the area with the highest
"N ways to get it wrong" surface.

---

## 3. DB-as-source-of-truth — two tiers, THREE indexing paths that can disagree

### Data model

- **Tier A — `api_events` (sync, every request).** Written by `withApiLog` via
  `after()`. Hashed caller + hashed body, status, txHash, chainId, errorCode. This is
  the durable, complete request ledger. **Single coherent path. Good.**
- **Tier B — typed event tables** (`credit_events_v7`, `ledger_events_v7`,
  `sweeper_events_v7`, `airdrop_claims_v7`, `name_records_v7`, `recovery_events_v7`,
  `fee_events_v7`, `tezcatli_events_v7`, `stealth_inbound`, `audit_alerts_v7`).
  Populated by **three** different writers:

### The three (actually four) indexing paths

| # | Path | Trigger | Target tables | Cursor? |
|---|---|---|---|---|
| 1 | `scheduleIndexerMirror` → `mirrorTxLogsToV7` | `after()` per relayed tx (v7.ts) | **V7 typed tables** | **No** (single tx) |
| 2 | `/api/v7/scan` → `indexV7Chain` | Vercel cron (per chain, 1–2 min) | **V7 typed tables** | Yes (`scan_state`) |
| 3 | `triggerScanAndRecord` → `triggerIndexScan` → `POST /api/index/trigger` → `indexChain` | `void` fire-and-forget per write | **V6.5 tables** (turso.ts) | Yes (V6.5 `scan_state`) |
| 4 | `scheduleNameCacheBackfill` → `backfillFromReceipt` | per name tx (v7.ts) | `name_resolutions` (relayer cache) | No |

**This is not one indexing architecture — it is four bolted together.** Specifically:

- **Path 3 is the documented "V6.5-indexer-for-V7-routes" footgun.** Multiple V7 routes
  (`deploy-account`, `fund-stealth`, `userop`, `multispend`, `names/sub`, `names/update`,
  `bridge-relay`) call `triggerScanAndRecord`, which fires at **`/api/index/trigger`** —
  the **V6.5** indexer (`indexChain`, `V65_DEPLOY_BLOCK`, V6.5 `scan_state`, requires
  `ETHERSCAN_API_KEY`). These V7 ops therefore kick the *wrong* indexer; their data
  lands in V7 typed tables only via Path 1 (`scheduleIndexerMirror`) or the Path 2 cron.
  The Path-3 call is wasted work for V7 (and silently 500s if Etherscan/Turso-v6.5 env
  is unset). The two indexers have **separate `scan_state` namespaces and separate
  deploy-block fallbacks** (`V65_DEPLOY_BLOCK` hard-coded vs `DEPLOY_BLOCK_V7_<id>` env).

- **Paths 1 and 2 both write the V7 tables and are reconciled by design** —
  `INSERT OR IGNORE` on `(chain, tx, logIndex)` makes the cron re-scan a no-op over
  rows the realtime mirror already wrote. This is the *good* part of the model: Path 1
  buys latency, Path 2 guarantees eventual completeness. Both correctly use `after()`
  (the documented Vercel "detached promise gets killed on flush" fix).

### Where the three paths can disagree (real risks)

1. **Cursor-advance-on-truncation gap (data loss).** In `indexV7Chain`,
   `getLogsPaginated(..., deadline)` returns *partial* logs when the serverless budget
   (`maxMs`, 8s) expires mid-range — but the loop then unconditionally calls
   `setScanState(chainId, addr, key, head)`, advancing the cursor to **head** despite an
   incomplete scan. `etherscan.ts` even documents the intent ("Returning what we have …
   lets the caller persist partial scan_state and resume") — but the V7 caller does
   **not** honor it; it jumps to head. On a busy chain a truncated scan **permanently
   skips** the unscanned blocks. The only thing masking this today is Path 1's realtime
   mirror covering relayer-originated txs — but any event the relayer didn't submit
   (direct on-chain interaction at a stealth, external Transfers, CCTP mints) can be
   dropped forever. **This is the single most important correctness bug for the
   DB-as-source-of-truth goal.**

2. **Mirror-only events are invisible until cron.** If `after()` is unavailable
   (non-request scope) the mirror falls back to a detached promise that Vercel can kill;
   then the row appears only when the cron's next tick scans it — *if* the cursor hasn't
   been falsely advanced past it (see #1).

3. **`api_events` vs typed tables can disagree on success.** `api_events` records
   `status:200 + txHash` the instant the tx is broadcast; the typed-table row only
   exists once the tx is *mined and mirrored*. A tx that is broadcast then reorgs/fails
   will show 200 in `api_events` with no matching typed-table row. There is no
   reconciliation job that cross-checks `api_events.tx_hash` against the typed tables.

4. **Manual backfill is a fourth, out-of-band writer** (`name_resolutions` backfill
   script + the per-tx cache). It shares the table but not the cursor model.

**Verdict (DB):** Tier A is coherent and complete. Tier B is *eventually* consistent
for relayer-originated txs (Paths 1+2 reconcile well), but has (a) a real
cursor-on-truncation data-loss bug, (b) a wrong-indexer wart for ~7 V7 routes (Path 3),
and (c) no job reconciling the request ledger against the event ledger. For a product
whose stated priority is "full DB for audit/analytics/history," the event tier is the
weakest link.

---

## 4. Relayer-as-trusted-party — single point of failure map

One EOA (`RELAYER_PRIVATE_KEY`) is simultaneously:

| Role | Where | Blast radius if key leaks |
|---|---|---|
| Gas payer / op broadcaster | every `submitX` in v7.ts | attacker drains relayer ETH via griefing |
| **Namespace authority** | `claimAsAuthority`, `repointAsAuthority`, `revokeAsAuthority` | attacker repoints/revokes ANY name → phishing, fund redirection |
| **Cross-chain recovery attester** | `attestRecoveryForChain` signs the 10-field digest | attacker forges owner-key rotations cross-chain → account takeover |
| **Paymaster operator cosigner** | `paymaster/cosign` signs sponsorship envelopes | attacker drains paymaster deposit up to `MAX_FEE_CAP_WEI` (1 ETH default) per op |
| Org subdomain submitter | org/* (HMAC-gated, but relayer is the on-chain authority) | leaked key bypasses HMAC entirely at chain level |

**If the key leaks:** namespace integrity + cross-chain recovery are fully compromised
— these are *authority* powers, not just gas. The HMAC/passkey layers are bypassed
because the relayer EOA *is* the on-chain authority for those paths. This is the
**highest-severity** architectural risk in the system.

**If the relayer is down:** all gasless ops fail (no fallback signer). Mitigations that
*reduce* the down-risk: paymaster cosign is hybrid-transport (client submits, so a down
relayer can't censor *submission*, only *sponsorship*); the user holds the passkey root
so funds are not lost, only stranded. But name/recovery authority ops have **no backup
relayer** — the code references a single `RELAYER_PRIVATE_KEY`; no
`RELAYER_PRIVATE_KEY_BACKUP` or sister relayer-v7 endpoint is wired in this codebase.

**Structural concern:** authority roles (namespace, recovery attester) and operational
roles (gas payer) share **one key**. These have wildly different threat models and
rotation cadences. They should be distinct keys (gas EOA hot; authority/attester key
cold or HSM-backed). Currently rotating the gas key = rotating the authority key.

---

## 5. Config / deployment addresses — 3 copies

| Copy | Form | Consumer |
|---|---|---|
| `DEPLOYMENT_V7_<chainId>` | env var, **JSON blob** parsed at runtime | landing/relayer (`v7Deployment`) |
| `contracts-v7/deployments/*.json` | committed JSON | deploy scripts, CLI, source of truth |
| CLI config | cli-v7 own copy | CLI commands |

Flow: `deploy.ts` writes `deployments/*.json` → human pastes the `deployment` object
into Vercel as `DEPLOYMENT_V7_<id>` → `v7Deployment()` does `JSON.parse(env)` at runtime.

### Risks

- **`JSON.parse(env)` at runtime, no validation.** `v7Deployment` does a bare
  `JSON.parse` with no zod check on the parsed shape. A truncated/mis-pasted blob
  (Vercel env UI, multi-line) → either a parse throw (→ 500 `submit_failed`) or, worse,
  a *partially valid* object where `d.sweeper` is `undefined` and the tx goes to
  `address(undefined)`. There is no startup validation that all 11 required addresses
  are present.
- **Env-var-corruption class** (the em-dash / Turso-token incidents): manual paste into
  Vercel is the transport for both the deployment blob and `RELAYER_PRIVATE_KEY` /
  `TURSO_AUTH_TOKEN`. `sanitizeError` strips `DEPLOYMENT_V7_*` / `TURSO_*` names from
  error bodies (good — no leak), but nothing *validates* them on boot.
- **Two deploy-block sources of truth** for indexing: `V65_DEPLOY_BLOCK` (hard-coded in
  `index/trigger/route.ts`) and `DEPLOY_BLOCK_V7_<id>` (env). A missing
  `DEPLOY_BLOCK_V7_<id>` silently defaults to `0` → first scan tries to scan from
  genesis → guaranteed deadline-truncation → triggers the cursor bug in §3.1.
- **3 copies with no automated sync.** Nothing asserts the env blob matches
  `deployments/*.json`. Drift between deploy-time JSON and the pasted env is undetected
  until a runtime revert.

---

## 6. OpenAPI / SDK contract

- **Spec is source-of-truth-ish, by construction.** Each route registers its **zod**
  request schema both for runtime `safeParse` AND for `registerPath`, so the spec body
  schema = the validated body schema. This is the strongest part of the contract story.
- **The chain is:** `schemas-v7.ts` (zod) → `registry.ts` (`generateV7Spec`) →
  `/api/v7/openapi` (generated on each request) → CLI codegens types from
  `openapi.json` → `lib/sdk-v7-types` (hand-written request interfaces re-exported into
  both `v7.ts` and the CLI's `relayer-types`).
- **Gaps:**
  - **Response schemas are descriptive, not enforced.** Routes return ad-hoc
    `NextResponse.json({...})`; nothing validates the response against
    `TxHashResponseSchema`. The response side of the contract can drift silently.
  - **`sdk-v7-types` (hand-written) and the zod schemas are two representations of the
    same shapes.** F-6 consolidated the *interfaces* into `sdk-v7-types`, but the *zod*
    validators in `schemas-v7.ts` are a separate hand-maintained representation. A field
    added to the zod schema but not the SDK type (or vice-versa) won't fail to compile.
    The "single source of truth" claim is true for type-vs-runtime within landing, but
    `sdk-v7-types` ⇄ `schemas-v7` is still two hand-kept copies.
  - **Security schemes lie** (see §2.1): `passkey` is advertised on routes that perform
    no server passkey check.
  - **GET query params** are typed in OpenAPI but parsed by hand (`Number(get(...))`),
    so query-shape drift is undetected.

---

## Top 5 architectural risks (prioritized)

1. **Relayer key = authority key (namespace + cross-chain-recovery attester) on one
   EOA.** Key leak → name hijack + forged owner rotations, bypassing all upstream auth.
   Highest severity. No backup signer, no key separation.
2. **Cursor-advance-on-truncation in `indexV7Chain`** → permanent event-table gaps for
   non-relayer-originated events. Directly undermines the DB-as-source-of-truth goal.
3. **Four indexing paths, one pointing at the wrong (V6.5) indexer** for ~7 V7 routes;
   no reconciliation job between `api_events` (request ledger) and the typed event
   tables (event ledger). Analytics/audit can't trust the event tier alone.
4. **Hand-maintained ABIs in `v7.ts` decoupled from the contracts package**, validated
   only by post-deploy runtime simulation. Every selector mismatch ships to prod first.
5. **No validation of `DEPLOYMENT_V7_<id>` / deploy-block env on boot**; manual paste is
   the transport; a partial blob routes txs to `undefined` addresses or scans from
   genesis. 3 unsynced copies of addresses.

## Verdict on soundness

The landing/relayer architecture is **sound in its synchronous spine** — the
`withApiLog → parseJson → zod → simulate → broadcast → after()-mirror` pipeline is
uniform, the pre-broadcast simulation is disciplined, the `api_events` request ledger is
complete, and the zod-as-both-validator-and-spec pattern genuinely prevents
request-shape/doc drift. The product is **fragile in three structural seams**: (a) the
multi-path event-indexing tier (the user's stated priority) is eventually-consistent at
best and has a real data-loss bug plus a wrong-indexer wart; (b) the relayer is an
over-loaded single trusted party conflating gas, namespace authority, and recovery
attestation in one key; (c) config/ABI/address coherence is enforced by runtime failure
rather than by validation. None are fatal for testnet alpha; (a) and (b) must be
addressed before any mainnet/value-bearing posture.

## Highest-leverage refactor (for the DB-as-source-of-truth goal)

**Collapse to ONE V7 indexing architecture with a correct cursor model, and make the
event ledger reconcilable against the request ledger.** Concretely:

1. **Fix the cursor bug first** (small, high-impact): in `indexV7Chain`, advance
   `scan_state` only to the last *fully-scanned* block, not `head`, when
   `getLogsPaginated` returned due to deadline. Have `getLogsPaginated` return
   `{logs, lastScannedBlock, truncated}` and persist `lastScannedBlock`.
2. **Delete Path 3 for V7 routes.** Replace `triggerScanAndRecord`'s
   `/api/index/trigger` (V6.5) call with the V7 `mirrorTxLogsToV7` path (already wired
   via `scheduleIndexerMirror`) or a `/api/v7/scan?chainId=` kick. Keep V6.5 trigger
   only for V6.5 routes. One indexer per generation.
3. **Add a reconciliation cron** that walks `api_events` rows with a `tx_hash` and a
   200 status and asserts a matching typed-table row exists (re-mirroring the tx if
   not). This makes `api_events` the authoritative spine and the typed tables a
   verifiable projection of it — turning "three paths that can disagree" into "one
   request ledger + a self-healing projection."

This sequence (cursor fix → kill the wrong-indexer path → reconciliation job) converts
the event tier from "eventually consistent if you're lucky" into a provably complete
projection of the request ledger, which is exactly what the audit/analytics/history
goal requires — and it is far cheaper than re-architecting the relayer trust model
(which is the right *next* priority but a larger lift).
