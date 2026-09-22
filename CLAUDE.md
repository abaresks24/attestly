# CLAUDE.md

@AGENTS.md

Claude Code reads this file. The project briefing lives in `AGENTS.md` so Cursor, Codex, and Claude Code share one source of truth.

---

## 🚧 Build status — read this first to resume

This repo is a **work in progress**: the "Attested RWA" scaffold-hbar template (see `CLAUDE_CODE_PROMPT.md` for the full mission, `PRD.md` for scope). To pick up where the last session stopped, read, in order:

1. `docs/BUILD_PLAN.md` — plan per increment + how PRD gaps are resolved (GO-with-fallback: SaucerSwap **V1**, not V2).
2. `docs/ACCEPTANCE.md` — every acceptance criterion, checked with its proof.
3. `docs/TESTNET_VERIFICATION.md` — deployed addresses, token/schedule/pair IDs, txs.
4. `spikes/REPORT.md` + `spikes/findings.json` — feasibility decisions and sourced facts/gotchas.

**Done & verified on testnet:** increment 01 (foundation), 02 (quorum-gated issuance: contracts + on-chain + UI), 03 core (KYC-gated market on SaucerSwap V1 + guardian threshold pause — proven via `packages/hedera/src/demo-market.ts` and `demo-guardian.ts`).

**Remaining:** increment 03 UI (`/assets/[id]/market` page + market server routes, mirroring the increment-02 UI in `packages/nextjs/app/api/assets/`), then increment 04 (README/AGENTS/ARCHITECTURE/ADAPTING docs, guided "Run the full story", `scripts/gate-check.sh`, `validate-submission`). Increment specs are in `.harness/prds/`.

**Deployed testnet contracts:** `AssetRegistry 0xB461DD05E0E5C803ac11110E51A9DdCAd0c0Ab62`, `InvestorRegistry 0xbcB2237B6FB03390bDEC0b0A58998472563fE48b`. Local `.env` + `.demo-keys.json` (gitignored) hold the operator and demo actors. Redeploy: `__RUNTIME_DEPLOYER_PRIVATE_KEY=<operator key> yarn workspace @sh/hardhat exec hardhat deploy --network hederaTestnet --reset`.

_(This section is scaffolding for the build; increment 04 finalizes `CLAUDE.md`/`AGENTS.md` for the shipped template.)_
