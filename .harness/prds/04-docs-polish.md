# Increment 04 — Documentation and polish

Context: ../../PRD.md §4, §9, §12. Docs carry 30 points; treat as product work.

## Scope
- `/` guided demo: "Run the full story" in demo mode, each step linked to HashScan.
- README: problem, 60-second quickstart, prerequisites, env vars table, Mermaid architecture, "Why Hedera" table, "Who are the attesters?" table (stablecoin reserves, bonds, fund shares, carbon credits, warehouse receipts, startup equity, invoices, art: who signs and what is minted in each), rubric table, trust assumptions, disclaimer, Going further.
- AGENTS.md: repo map, commands, invariants (key set, lockup, no admin key), how to add an attester, a parameter, an asset type.
- docs/ARCHITECTURE.md, docs/ADAPTING.md, docs/TESTNET_VERIFICATION.md; docs/PROTOCOL_VISION.md linked, not implemented.
- Remove dead code and debug output.

## Acceptance
1. All previous acceptance passes from a fresh `npm create scaffold-hbar@latest --template <org>/<repo>`.
2. A developer with no context reaches a running app using only the README (semantic validator).
3. README contains every scope section; Mermaid renders.
4. TESTNET_VERIFICATION.md links: deploy, seed, submission, token creation, each schedule signature, mint, finalize, pool creation, swap, pause, unpause.
5. ADAPTING.md shows, with file paths, how to swap the attester adapter, the asset metadata, and the trading pair.
6. No TODO, debug logging or unused exports in shipped code.
