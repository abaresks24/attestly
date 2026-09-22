# Increment 01 — Foundation

Context: ../../PRD.md. Skeleton for all later increments.

## Scope
- Monorepo `packages/hardhat`, `packages/nextjs`, `packages/hedera`, plus `mock-registry/`.
- Contracts `AssetRegistry` (asset records, attestations, lockup, finalize, KYC grants, pause/unpause restricted to guardian) and `InvestorRegistry` (admin-approved investors).
- Config `packages/hardhat/config/rwa.ts` with PRD §6 defaults.
- `yarn seed:demo`: issuer, 3 attesters, 3 guardian members, guardian account with ThresholdKey(2 of 3), 2 investors; keys to gitignored `.demo-keys.json`.
- `template.json`, `.env.example`, README and AGENTS.md skeletons, MIT LICENSE.
- App boots with no env; all routes 200 with a configuration notice.

## Acceptance
1. `yarn install`, `yarn lint`, `yarn build` pass from a fresh scaffold with no `.env`.
2. `yarn hardhat test` passes: lockup blocks KYC grants, `finalize` only after lockup, only guardian can pause, only admin approves investors.
3. `/` and `/assets` return 200 with no env.
4. `.gitignore` covers `.env`, `.env.local`, `.demo-keys.json`; no key material in repo.
5. `yarn deploy:testnet` deploys both contracts and prints HashScan links.
6. After `yarn seed:demo`, the guardian account key on the mirror node is a threshold key, threshold 2, 3 keys.
