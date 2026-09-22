# Increment 02 — Quorum-gated issuance

Context: ../../PRD.md §3 steps 1–6, FR-1 to FR-5. Increment 01 done.

## Scope
- IPFS upload with pinning provider or labeled local fallback.
- Asset submission; HCS topic per asset; submission logged.
- Server route creating the token with the PRD key set; mirror-node key verification before `registerToken`.
- ScheduleCreate(TokenMint), long-term expiry; per-attester signing (demo keystore; HIP-755 wallet path if spike S3 passed).
- Attester interface in `packages/hedera/attesters/` with `ManualAttester` and `MockRegistryAttester` (reads `mock-registry/titles.json`, matches CID hash and owner reference).
- `attest()` on-chain + HCS; `confirmMint` starts lockup.
- Pages `/assets/new`, `/assets/[id]` (timeline, signature progress, HashScan links), `/attest` (queue with "Act as").

## Acceptance
1. Increment 01 acceptance still passes.
2. Adapter unit tests: MockRegistryAttester approves a matching title and rejects a mismatching one with a reason.
3. Submitting the sample document creates an HCS topic whose first message contains CID and SHA-256.
4. Token on mirror node: supply key threshold 2 over the 3 attester keys, no admin key, KYC and pause keys equal the AssetRegistry contract ID.
5. `registerToken` with a token whose keys do not match is refused.
6. After 1 attester signature total supply is 0; after the 2nd it equals TOTAL_SHARES in the issuer treasury.
7. Each attestation appears on the asset's HCS topic and on `/assets/[id]`.
8. Lockup countdown shows after `confirmMint`; a KYC grant attempt during lockup reverts.
