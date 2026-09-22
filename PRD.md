# PRD — Attested RWA

A scaffold-hbar template for issuing a real-world asset token that the network itself refuses to mint until a quorum of independent attesters approves, then trading it on a KYC-gated SaucerSwap V2 pool.

```
npm create scaffold-hbar@latest --template <your-org>/attested-rwa
```

Status: v2 (template scope) · Bounty: Scaffold-HBAR Template Bounty, build window Sept 21 – Oct 4, 2026 · License: MIT

---

## 1. What a developer gets

Three patterns every RWA project on Hedera needs, working together and each usable on its own:

1. **Quorum-gated issuance.** The token's supply key is a native `ThresholdKey(k of n)` of attester keys. A scheduled `TokenMint` executes only when k attesters have signed. No Solidity enforces this; the network does.
2. **Permissioned token on a public AMM.** The token's KYC key is held by a contract. Only verified accounts, plus the SaucerSwap contracts, can hold it. Verified investors trade on a SaucerSwap V2 pool; everyone else is refused by the network.
3. **Audit trail.** Every step (submission, each attestation with its evidence hash, mint, lockup end, pause) is written to an HCS topic per asset and linked to HashScan.

Attesters are behind a small interface. The demo ships two: a manual attester (a person clicks approve) and a mock land-registry attester (queries a local JSON registry). A developer replaces them with a real registry oracle, a notary panel or an auditor.

## 2. Problem

Tokenizing an asset takes an afternoon. Making issuance trustworthy and the token tradable without breaking compliance takes weeks, and there is no forkable reference on Hedera that shows how native keys, scheduled transactions and a DEX fit together.

## 3. Flow

1. **Submit.** Issuer uploads the asset document to IPFS and registers the asset (CID, SHA-256, share count). An HCS topic is created and the submission logged.
2. **Create token.** A server route creates a fungible, finite-supply token: treasury = issuer, supply key = `ThresholdKey(THRESHOLD of ATTESTERS)`, KYC key and pause key = `AssetRegistry` contract, no admin key (key set is immutable). The app verifies the key set on the mirror node before registering the token ID.
3. **Schedule mint.** `ScheduleCreate(TokenMint)` with a long-term expiry.
4. **Attest.** Each attester runs its adapter, records `attest(assetId, evidenceHash, approve)` (logged to HCS), and if approving signs the schedule.
5. **Mint.** At the k-th signature the network mints to the issuer. Issuer calls `confirmMint`; the lockup starts.
6. **Lockup.** Until `LOCKUP_PERIOD` ends the contract refuses to grant KYC, so shares cannot leave the treasury. During this time the guardian can pause.
7. **Open.** Anyone calls `finalize`. The contract grants KYC to the SaucerSwap V2 contracts. The issuer creates a pool and adds liquidity.
8. **Trade.** A verified investor calls `enableAsset`, receives token KYC, and swaps on SaucerSwap.
9. **Emergency.** The guardian account (native `ThresholdKey` 2 of 3) can pause the token at any time; the UI explains the resulting swap failure.

## 4. Why Hedera (README section)

| Need | Hedera mechanism |
|---|---|
| No issuance without a quorum | HTS supply key = `ThresholdKey` |
| Approvals collected asynchronously | Schedule Service, long-term expiry (HIP-423) |
| Attesters sign from an EVM wallet | HIP-755 `signSchedule()` on 0x16b |
| Compliance on every transfer, on any venue | HTS KYC key held by a contract |
| Emergency stop | HTS pause key |
| Multisig guardian without a multisig contract | Account key = native `ThresholdKey` |
| Keys nobody can change later | Token created without admin key |
| Public audit trail | HCS topic per asset |

## 5. Ecosystem integrations (load-bearing)

- **SaucerSwap V2.** The only exit for holders. Without it the template issues an illiquid token, which is the problem it exists to solve. Pool creation, liquidity, quote via testnet REST API, swap.
- **IPFS.** Holds the document attesters evaluate. Pinning provider via `IPFS_PINNING_JWT`; without it, a local CID and local store, clearly labeled as demo storage.

## 6. Parameters (`packages/hardhat/config/rwa.ts`, mirrored in `template.json`)

| Parameter | Demo default |
|---|---|
| `ATTESTERS` | 3 generated accounts |
| `THRESHOLD` | 2 |
| `LOCKUP_PERIOD` | 10 min |
| `SCHEDULE_EXPIRY` | 24 h |
| `GUARDIAN_THRESHOLD` | 2 of 3 |
| `TOTAL_SHARES` | 1,000,000 (2 decimals) |

## 7. Architecture

```
packages/
  hardhat/     AssetRegistry.sol, InvestorRegistry.sol, tests, deploy + seed
  nextjs/      App Router UI + server routes for native HAPI operations
  hedera/      shared helpers: keys, schedules, HCS, mirror node, SaucerSwap, attester adapters
mock-registry/ JSON land registry used by the demo adapter
docs/          ARCHITECTURE.md, ADAPTING.md, TESTNET_VERIFICATION.md, PROTOCOL_VISION.md
template.json  README.md  AGENTS.md  .env.example  LICENSE
```

- **Contracts.** `AssetRegistry` holds the KYC and pause keys of issued tokens, tracks assets, attestations, lockup and finalization, and grants KYC through the HTS system contract. `InvestorRegistry` records verified investors (admin-approved; off-chain KYC assumed). No proxies (a known testnet issue affects schedules booked from DELEGATECALL frames).
- **Server routes.** Token creation with a threshold key, HCS topics and messages, demo account creation. These cannot be signed by an EVM wallet.
- **Attester interface.** `evaluate(asset) → { approve, evidenceHash, evidence }`. Adding an attester type is one file.
- **Demo mode (required).** `yarn seed:demo` creates issuer, 3 attesters, guardian members, 2 investors; keys in gitignored `.demo-keys.json`; UI role switcher "Act as".
- **Wallet mode (should).** Contract calls via RainbowKit/wagmi; attester schedule signing via HIP-755.
- **No env.** The app boots, every route returns 200, pages explain configuration.

## 8. Requirements

- **FR-1** Asset submission with IPFS CID, SHA-256, HCS topic and log entry.
- **FR-2** Token creation with the exact key set in §3 step 2; mismatching tokens are refused.
- **FR-3** Scheduled mint executes at THRESHOLD signatures and not before.
- **FR-4** Attestations recorded on-chain and on HCS with evidence hash; two adapters shipped.
- **FR-5** Lockup enforced by refusing KYC grants until `finalize`.
- **FR-6** Investor verification and per-asset KYC enablement.
- **FR-7** SaucerSwap V2 pool creation, liquidity and swap by a verified investor; unverified transfer refused with a readable error.
- **FR-8** Guardian pause and unpause with a 2-of-3 native threshold account.
- **FR-9** Asset page: timeline from HCS and mirror node, HashScan links, signature progress.
- **NFR** Fresh-scaffold install, lint, build clean; no secrets; tests for contracts and adapters; Hedera status codes surfaced with explanations; no dead code; disclaimer that tokens carry no legal title.

## 9. Rubric mapping (README table)

| Criterion | Points | Evidence |
|---|---|---|
| Ecosystem | 35 | SaucerSwap V2 is the holder exit; IPFS holds the attested document. |
| Docs | 30 | README, AGENTS.md, ARCHITECTURE, ADAPTING ("swap the attester, the asset type, the venue"), TESTNET_VERIFICATION. |
| Code | 20 | Small typed monorepo, one contract per concern, tested adapters, graceful degradation. |
| Hedera depth | 15 | HTS threshold supply key, KYC, pause, no admin key; HSS long-term schedules and HIP-755; HCS; threshold account key; mirror node. |

## 10. Day-1 spikes

| # | Spike | Fallback |
|---|---|---|
| S1 | KYC-enabled token pooled and swapped on SaucerSwap V2 testnet | Grant KYC to every contract touched; else forked-mainnet integration documented per brief |
| S2 | Threshold supply key + scheduled mint signed one attester at a time | Contract-held supply key counting approvals |
| S3 | HIP-755 `signSchedule()` from MetaMask | Demo mode only, documented |
| S4 | Contract as KYC and pause key via HTS system contract | Server-held key, documented |

## 11. Plan

| Days | Work |
|---|---|
| Sept 22 | Spikes S1–S4 |
| Sept 23–24 | Increment 01 foundation |
| Sept 25–27 | Increment 02 quorum issuance |
| Sept 28–30 | Increment 03 market · Sept 29 AMA |
| Oct 1–3 | Increment 04 docs and polish, fresh-scaffold gate run |
| Oct 4 | Buffer, submit before 23:59 ET |

## 12. Going further (README section)

Link to `docs/PROTOCOL_VISION.md`: staked attesters with slashing, whistleblower rewards, random committee draw, jurisdiction pools, registry oracles with periodic re-checks, victims fund. Explicitly out of scope for this template.
