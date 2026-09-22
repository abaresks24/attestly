# Increment 03 — KYC-gated SaucerSwap market and guardian

Context: ../../PRD.md §3 steps 7–9, §5, FR-6 to FR-8. Increments 01–02 done. Spike S1 decides the path.

## Scope
- `finalize` grants KYC to the SaucerSwap V2 contracts identified in spike S1.
- Issuer: create V2 pool (shares / HBAR), add liquidity.
- Investor: admin approval, `enableAsset`, quote via SaucerSwap testnet API, swap.
- Guardian pause/unpause signed 2 of 3.
- Readable errors for `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` and `TOKEN_IS_PAUSED`.
- Page `/assets/[id]/market`.
- If S1 failed: forked-mainnet or read-only integration, documented in README.

## Acceptance
1. Increments 01–02 acceptance still passes.
2. Pool created on testnet; address and HashScan link shown.
3. A verified investor swaps HBAR for shares; mirror node shows pool → investor transfer.
4. An unverified account cannot receive shares; UI shows the Hedera status and a plain explanation.
5. A guardian pause signed by 1 member fails; signed by 2 succeeds; swaps then fail with an explained error; unpause restores trading.
