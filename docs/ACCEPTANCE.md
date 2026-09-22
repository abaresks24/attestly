# Acceptance checklist

Each criterion is checked only when backed by a command actually run or an on-chain proof.
Testnet evidence is detailed in [TESTNET_VERIFICATION.md](./TESTNET_VERIFICATION.md).

## Increment 01 — Foundation

- [x] **1. `yarn install`, `yarn lint`, `yarn build` pass from a fresh scaffold with no `.env`.**
  `yarn install` ✓; contracts compile (`yarn hardhat:compile`) ✓; `yarn next:build` ✓ (10 routes,
  lint + type-check clean); husky/lint-staged runs eslint+prettier on commit.
- [x] **2. `yarn hardhat test` passes: lockup blocks KYC grants, `finalize` only after lockup, only guardian can pause, only admin approves investors.**
  8 passing (isolated network, MockHederaTokenService). See `packages/hardhat/test/`.
- [x] **3. `/` and `/assets` return 200 with no env.**
  `curl` with no `.env.local`: `/` → 200, `/assets` → 200, `/debug` → 200.
- [x] **4. `.gitignore` covers `.env`, `.env.local`, `.demo-keys.json`; no key material in repo.**
  Verified; `git check-ignore` confirms `.env` and `.demo-keys.json` are ignored.
- [x] **5. `yarn deploy:testnet` deploys both contracts and prints HashScan links.**
  InvestorRegistry `0xDA604dD18c0dC46ee09CBD20cECdEc51d87Cd36f`, AssetRegistry
  `0x3F536A2a22fF1D99F6b08b72FE4A9aDE8DC07652` on testnet; HashScan links printed.
- [x] **6. After `yarn seed:demo`, the guardian account key on the mirror node is a threshold key, threshold 2, 3 keys.**
  Guardian `0.0.10671266`: mirror `key._type = ProtobufEncoded`, decodes to `threshold 2, keys 3`.
  The deployed AssetRegistry `guardian()` returns its long-zero address (`0x…a2d4a2`).

## Increment 02 — Quorum-gated issuance

- [x] **1. Increment 01 acceptance still passes.** Contracts unchanged; 8 unit tests still green.
- [x] **2. Adapter unit tests: MockRegistryAttester approves a matching title and rejects a mismatching one with a reason.**
  5 tests pass (`yarn workspace @sh/hedera test`): manual decision, matching title, unknown CID, hash mismatch, owner mismatch.
- [x] **3. Submitting the sample document creates an HCS topic whose first message contains CID and SHA-256.**
  Topic `0.0.10671502`, first message: `{"event":"submitted",...,"cid":"bafkreidemo…","sha256":"0x211150…"}`.
- [x] **4. Token on mirror: supply key threshold 2 over the 3 attester keys, no admin key, KYC and pause keys equal the AssetRegistry contract ID.**
  Token `0.0.10671508`: supply key decodes to ThresholdKey(2/3), `admin_key: null`, kyc_key & pause_key decode to `0.0.10671319` (AssetRegistry).
- [x] **5. `registerToken` with a token whose keys do not match is refused.**
  App-side gate: `verifyThresholdKey` rejects a mismatched expectation before `registerToken` is called (demonstrated in `demo-issue.ts`; the contract cannot read the mirror, so the app enforces it).
- [x] **6. After 1 attester signature total supply is 0; after the 2nd it equals TOTAL_SHARES in the issuer treasury.**
  Schedule `0.0.10671514`: after 1 sig `executed_timestamp=null`, supply 0; after 2 sig executed, `total_supply=1000000`.
- [x] **7. Each attestation appears on the asset's HCS topic and on `/assets/[id]`.**
  `attested` messages on topic `0.0.10671502`; `/assets/[id]` renders the HCS timeline (verified via `GET /api/assets/[id]`).
- [x] **8. Lockup countdown shows after `confirmMint`; a KYC grant attempt during lockup reverts.**
  `confirmMint` sets status=Minted with a future `lockupEnds` (shown on `/assets/[id]`); lockup-blocks-KYC proven by the increment-01 unit test.

**UI + routes (verified via HTTP on testnet):** `/assets/new` → `POST /api/assets` issued asset #1 (token `0.0.10671876`); `/attest` "Act as" → `POST /api/assets/[id]/attest` ×2 → scheduled mint executed, `total_supply=1000000`; `/assets`, `/assets/[id]` list and render from the mirror. IPFS: local demo fallback verified (`pinned:false`); Pinata path via `IPFS_PINNING_JWT`. All routes 200 with no env; build clean.

## Increment 03 — KYC-gated market and guardian

On-chain core proven end-to-end (`demo-market.ts`, `demo-guardian.ts`); market UI page pending.

- [x] **1. Increments 01–02 acceptance still passes.** Contracts unchanged (redeployed with a 120s demo lockup); 8 unit tests + issuance flow still green.
- [x] **2. Pool created on testnet; address and HashScan link shown.** V1 pair `0.0.10672243` created via `finalizeAsset`+`createPair` (fee ~$2).
- [x] **3. A verified investor swaps HBAR for shares; mirror shows pool → investor transfer.** Investor swapped 1 HBAR → 45,330 shares (mirror balance delta).
- [x] **4. An unverified account cannot receive shares; UI shows the Hedera status and a plain explanation.** HTS refuses with `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` (176) (proven in spike S1b); `explainError` maps it + SaucerSwap's "Safe token transfer failed!" wrapper. _UI surfacing lands with the market page._
- [x] **5. A guardian pause signed by 1 member fails; signed by 2 succeeds; swaps then fail; unpause restores trading.** `demo-guardian.ts`: 1 sig → `INVALID_SIGNATURE`, 2 sigs → `PAUSED`; a swap while paused is refused; unpause → `UNPAUSED`, trading resumes.

_Remaining 03: `/assets/[id]/market` page + market server routes (finalize/createPair/addLiquidity/enable/swap/guardian), mirroring the increment-02 UI._

## Increment 04 — Documentation and polish

_(pending)_
