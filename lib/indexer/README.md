# Z0tz Protocol History Indexer

Server-side indexer that pre-computes on-chain Z0tz event history into a
Turso (libSQL) database. The GUI queries this index instead of running
multi-million-block RPC scans every time the user opens the History tab.

## Architecture

```
Z0tz contracts (Sweeper, Ledger, Vault, AccountFactory, EntryPoint)
        ↓ Etherscan getLogs (server-side chunking)
   /api/index/trigger          ← called by fund-stealth + manual
        ↓
   Turso DB                    ← scan_state, smart_accounts,
        ↓                         entrypoint_userops, sweep_events,
                                   ledger_events, vault_transferred_out
   /api/history (POST)         ← GUI calls with passkey-derived addresses
        ↓
   GUI stitches raw events into history records
```

## Files

| File | Purpose |
|---|---|
| `lib/indexer/turso.ts` | libSQL client + schema bootstrap + scan_state helpers |
| `lib/indexer/contracts.ts` | Per-chain contract address resolution + event ABIs |
| `lib/indexer/etherscan.ts` | Etherscan V2 unified API client with rate limiting |
| `lib/indexer/indexer.ts` | Decoder + insert logic + time-budgeted scan loop |
| `app/api/index/trigger/route.ts` | Indexer entrypoint — POST/GET to scan |
| `app/api/history/route.ts` | Query endpoint — POST to fetch history rows |

## Required env vars (set in Vercel + local `.env`)

```bash
# Turso libSQL database — provided when you create a Turso DB at
# https://app.turso.tech/. Same one for all 3 chains.
TURSO_DATABASE_URL=libsql://z0tz-protocol-history-0xoucan.aws-ap-south-1.turso.io
TURSO_AUTH_TOKEN=<your-turso-jwt>

# Etherscan V2 unified API key. One key authenticates against all
# Etherscan-family chains (mainnet + testnet). Free tier = 5 req/sec.
# Get one: https://etherscan.io/myapikey
ETHERSCAN_API_KEY=<your-key>

# Optional — soft time budget per /api/index/trigger call. Default 50_000
# (50s) to fit under Vercel Pro's 60s function timeout. Set lower if on
# Hobby (10s) or higher if Pro+max_duration (300s).
INDEXER_MAX_MS=50000

# Optional — base URL for fire-and-forget triggers from fund-stealth.
# Vercel auto-sets VERCEL_URL, but for local dev set this manually.
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

## Contract address env vars

The indexer reads contract addresses from env vars per chain — same
pattern as the existing relayer config:

```bash
# Already used by relayer
SWEEPER_V65_ADDRESS_84532=0xF1368C62986F1681aEb370E796cdcf8f18635E8c
SWEEPER_V65_ADDRESS_11155111=0x9BA45877b983a0c704dA37b50cd5e746e66E5F66
SWEEPER_V65_ADDRESS_421614=0x0fb0CC4eedfA2f93729cD16Cd2F553A617e56D5A

LEDGER_ADDRESS_84532=0xD912e777811238F14106F4Fb161230Bb182dAF4e
LEDGER_ADDRESS_11155111=0x60570F2DeA11A09B5c6411A8f48017F50eFc4D6C
LEDGER_ADDRESS_421614=0x1b45Da2D95ad8180D60616b668F44AC8dc457504

VAULT_ADDRESS_84532=0x308fbdc8aaD5e5Ee470Adb1A89072a31CbDa3829
VAULT_ADDRESS_11155111=0x763BC9f2F6520E92B4D56622F55F370D3bF1bF3F
VAULT_ADDRESS_421614=0x2B147275C63aFDF8583A4bce53c49100fE171CAC

# NEW for indexer (have static testnet fallbacks if not set)
ENTRY_POINT_ADDRESS_84532=0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108
ENTRY_POINT_ADDRESS_11155111=0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108
ENTRY_POINT_ADDRESS_421614=0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108

ACCOUNT_FACTORY_ADDRESS_84532=0xe67471E72647E6088791a0f752628D910Dc4D94b
ACCOUNT_FACTORY_ADDRESS_11155111=<your factory>
ACCOUNT_FACTORY_ADDRESS_421614=<your factory>
```

The indexer falls back to hard-coded testnet addresses in
`STATIC_TESTNET_ADDRESSES` if any var is missing — useful for local dev.

## First-time backfill

After deploying with env vars set, kick off the initial scan:

```bash
# Triggers a 50s scan window. Repeat until results show
# truncated=false and scannedTo near the chain head.
curl -X POST https://your-vercel.app/api/index/trigger
```

Each call walks scan_state forward up to its time budget. Subsequent
calls resume from `scan_state.last_block_scanned`. The DB never
re-processes blocks it already covered — idempotent on `(chain, tx, log)`.

Once caught up, fund-stealth fires its own trigger automatically.

## Query example

```bash
curl -X POST https://your-vercel.app/api/history \
  -H "Content-Type: application/json" \
  -d '{
    "ownerX": "9863450959188632908610209061940487092279600582055658166650200046519327314083",
    "ownerY": "55580886058221745698609016052691873365565991933860579210355670198781825746345",
    "ledgerIds": ["0xf597f6d8...", "0x2b854a85..."],
    "stealths": ["0x7ffcb3...", "0x8d1dad..."],
    "chainIds": [84532, 11155111, 421614]
  }'
```

Returns raw event rows. The GUI's existing stitching logic in
`history-scanner.ts` consumes these to build the final
`HistoryRecord[]` for display.

## Cron (optional)

The fund-stealth trigger keeps the DB warm for active users. For idle
chains add a Vercel Cron entry to `vercel.json`:

```json
{
  "crons": [{ "path": "/api/index/trigger", "schedule": "*/5 * * * *" }]
}
```

Requires Vercel Pro for sub-daily schedules.
