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

_(pending)_

## Increment 03 — KYC-gated market and guardian

_(pending)_

## Increment 04 — Documentation and polish

_(pending)_
