# Adapting the template

Three things you will most likely change to make this template your own. Each is a small, localized
edit — file paths below are exact.

## 1. Swap the attester

The demo ships two attesters behind one interface; a real one is a single new file.

- **Interface:** `packages/hedera/src/attesters/types.ts` — implement `Attester`:
  ```ts
  export interface Attester {
    readonly name: string;
    evaluate(asset: AssetForReview): Promise<Attestation> | Attestation;
  }
  ```
  `AssetForReview` gives you `{ assetId, cid, documentHash, owner? }`; return `attestation(approve, reason)`
  (the helper hashes `reason` into the `evidenceHash` recorded on-chain and on HCS).
- **Examples to copy:** `packages/hedera/src/attesters/manual.ts` (a person approves) and
  `packages/hedera/src/attesters/mockRegistry.ts` (queries `mock-registry/titles.json`). Replace the
  JSON lookup in `mockRegistry.ts` with a real registry/oracle API call, or fetch-and-hash the
  document and compare against your source of truth.
- **Wire it up:** export it from `packages/hedera/src/attesters/index.ts`. Tests live beside the
  adapters (`attesters.test.ts`) — add cases for approve/reject with reasons.

Note the distinction: the adapter decides **whether** to approve; the attester's Hedera **key** is
what actually signs the scheduled mint. Real attesters each hold one share of the `ThresholdKey` — see
`config/rwa.ts` (`attesters`, `threshold`) to change committee size and quorum.

## 2. Change the asset metadata

- **Parameters:** `packages/hardhat/config/rwa.ts` — `attesters`, `threshold`, `lockupPeriodSeconds`,
  `scheduleExpirySeconds`, `guardian.{members,threshold}`, `totalShares`, `decimals`. These are the
  demo defaults, mirrored in `template.json` so they're visible before instantiating. Raise
  `lockupPeriodSeconds` for production (the demo uses 120s so "Run the full story" finishes in one
  sitting).
- **Token name/symbol/document:** set per asset at submission — via the `/assets/new` form, or the
  `issueAsset(...)` params in `packages/hedera/src/flows.ts` (`name`, `symbol`, `document`, `filename`,
  `decimals`, `totalShares`). The document is uploaded to IPFS by `packages/hedera/src/ipfs.ts`
  (pinning provider via `IPFS_PINNING_JWT`, else a labeled local CID).
- **Attester review fields:** extend `AssetForReview` in `attesters/types.ts` if your attester needs
  more than `{ cid, documentHash, owner }` (e.g. jurisdiction, valuation), and populate it where the
  attestation is triggered.

## 3. Change the trading pair / venue

The venue is a config seam. The demo uses **SaucerSwap V1** (V2 pool creation is blocked on testnet —
see [BUILD_PLAN.md](./BUILD_PLAN.md) G1).

- **Addresses:** `packages/hedera/src/constants.ts` — `SAUCERSWAP_V1 = { factory, router, whbarToken }`.
  Point these at another UniswapV2-style venue, or a V2 deployment once testnet is fixed.
- **Pair / liquidity / swap logic:** `packages/hedera/src/market.ts` — `createPair`, `addLiquidity`,
  `swapHbarForShares` (ABIs and gas defaults are here). A V2 venue means concentrated-liquidity
  position calls instead of `addLiquidityETH`; the `finalize(assetId, pair)` KYC grant stays the same
  (grant KYC to whatever contract must hold the token).
- **What KYC is granted to:** `finalizeAsset(...)` grants KYC to the **pair only** — the minimal set
  (the router never holds the token). If your venue holds the token in a different contract, grant KYC
  there instead. See [BUILD_PLAN.md](./BUILD_PLAN.md) G2.
- **Readable errors:** `packages/hedera/src/errors.ts` maps HTS codes and the SaucerSwap
  `"Safe token transfer failed!"` wrapper. Add your venue's revert strings there so the UI keeps
  explaining refusals in plain language.
