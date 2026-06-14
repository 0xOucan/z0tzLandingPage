#!/usr/bin/env bash
# indexer-tick.sh — single tick of the V7 on-chain indexer.
#
# Wired for cron / systemd timer / Vercel cron shell-out. All config flows in
# through env vars (see scripts/indexer-v7.ts header for the full list):
#   TURSO_V7_DATABASE_URL, TURSO_V7_AUTH_TOKEN,
#   RPC_URL_<chainId>, DEPLOYMENT_V7_<chainId>,
#   INDEXER_V7_CHAIN_IDS (optional), INDEXER_V7_MAX_MS (optional),
#   BACKFILL_FROM_BLOCK_<chainId> (optional, one-shot historical floor).
#
# Exits 0 on full success, 1 if any chain failed. Output goes to stdout/stderr
# so cron / journalctl picks it up.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_DIR}"

exec pnpm tsx scripts/indexer-v7.ts "$@"
