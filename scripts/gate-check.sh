#!/usr/bin/env bash
# Eligibility gate for the Attested RWA template. Runs the checks that must pass from a fresh
# scaffold with NO .env: install, lint, type-check, contract + adapter tests, and a clean build.
# On-chain acceptance (deploy/seed/issue/trade/pause) is proven separately on testnet and recorded
# in docs/TESTNET_VERIFICATION.md — this script is the offline, no-secrets gate.
#
# Usage: bash scripts/gate-check.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
echo "== Attested RWA gate-check =="
echo "repo: $ROOT"
echo

fail=0
step() {
  local name="$1"; shift
  echo "-- $name"
  if "$@"; then
    echo "   ✓ $name"
  else
    echo "   ✗ $name"
    fail=1
  fi
  echo
}

# 1. No secrets committed: .env / .demo-keys.json must be gitignored (check each path).
check_gitignored() {
  local p
  for p in .env .env.local .demo-keys.json .demo-state.json; do
    git check-ignore -q "$p" || { echo "   not ignored: $p"; return 1; }
  done
}
step "secrets are gitignored" check_gitignored

# 2. Install (idempotent; --immutable fails if the lockfile is out of date).
step "install (immutable)" yarn install --immutable

# 3. Lint (next + hardhat).
step "lint" yarn lint

# 4. Compile contracts FIRST — hardhat's type-check depends on the typechain types this generates,
#    so on a fresh clone (no artifacts yet) the hardhat type-check must run after compile.
step "contracts compile" yarn hardhat:compile

# 5. Type-check every workspace.
step "types: hedera" yarn hedera:check-types
step "types: nextjs" yarn next:check-types
step "types: hardhat" yarn hardhat:check-types

# 6. Contract unit tests (lockup, finalize, guardian-only pause, admin-only approve).
step "contract tests" yarn hardhat:test

# 7. Attester adapter tests (approve/reject with reasons).
step "adapter tests" yarn workspace @sh/hedera test

# 8. Frontend build (all routes, no env needed).
step "frontend build" yarn next:build

echo "============================="
if [ "$fail" -eq 0 ]; then
  echo "GATE PASS — offline checks green. Run the testnet story next (see docs/TESTNET_VERIFICATION.md)."
  exit 0
else
  echo "GATE FAIL — see the ✗ steps above."
  exit 1
fi
