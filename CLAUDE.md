# CLAUDE.md

@AGENTS.md

Claude Code reads this file. The project briefing lives in `AGENTS.md` so Cursor, Codex, and Claude Code share one source of truth.

---

## Build status

All four increments are **complete and verified on testnet**: 01 foundation, 02 quorum-gated issuance
(contracts + on-chain + UI), 03 KYC-gated market on SaucerSwap V1 + guardian 2/3 pause (on-chain **and**
market UI, proven over HTTP), 04 docs + polish. `scripts/gate-check.sh` runs the offline gate green.

Orientation for a new session:

1. `README.md` — product, quickstart, architecture. `AGENTS.md` — repo map, invariants, how to adapt.
2. `docs/ACCEPTANCE.md` — every criterion checked with its proof.
3. `docs/TESTNET_VERIFICATION.md` — deployed addresses, token/schedule/pair IDs, txs.
4. `docs/ARCHITECTURE.md` / `docs/ADAPTING.md` — internals and how to change the attester/parameter/venue.
5. `docs/BUILD_PLAN.md`, `spikes/REPORT.md` + `spikes/findings.json` — decisions and the GO-with-fallback (SaucerSwap **V1**, not V2).

**Deployed testnet contracts:** `AssetRegistry 0xB461DD05E0E5C803ac11110E51A9DdCAd0c0Ab62`,
`InvestorRegistry 0xbcB2237B6FB03390bDEC0b0A58998472563fE48b`. Local `.env` + `.demo-keys.json`
(gitignored) hold the operator and demo actors. Redeploy:
`__RUNTIME_DEPLOYER_PRIVATE_KEY=<operator key> yarn workspace @sh/hardhat exec hardhat deploy --network hederaTestnet --reset`.
