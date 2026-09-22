# Protocol vision — Verified Title Shares (post-bounty, not in template scope)

A scaffold-hbar template for tokenizing a real-world asset whose title deed is verified by a randomly drawn committee of identified, staked validators, with a whistleblower mechanism against validator fraud and a KYC-gated secondary market on SaucerSwap.

```
npm create scaffold-hbar@latest --template <your-org>/verified-title-shares
```

Status: draft v1 · Bounty: Scaffold-HBAR Template Bounty (build window Sept 21 – Oct 4, 2026) · License: MIT

---

## 1. Problem

Tokenizing an asset is easy. Proving that the title behind the token is genuine is not.

- A single verifier is a single point of failure and a single point of corruption.
- Anonymous staked validators are not enough: for a €400k property, fraud can pay far more than any stake a validator would post. Economic security alone cannot cover real-world asset values, especially on a network whose total DeFi TVL is in the tens of millions.
- Tokenized assets are illiquid: holders have no compliant way to exit.

There is no open, forkable reference on Hedera that ties document verification, validator accountability and compliant secondary trading together.

## 2. Solution in one paragraph

An owner submits a title deed. The protocol draws a committee of validators at random from a pool of KYC'd, staked professionals. The share token is created with a **native threshold supply key** made of the committee's keys: the Hedera network itself refuses to mint a single share until a quorum of independent validators has signed a scheduled mint. Each validator publishes a verification report. Shares cannot move until a challenge window closes, because the token's KYC key is held by the protocol and no one but the treasury is KYC'd before then. Anyone can challenge with a bond; an arbiter multisig rules; guilty validators are slashed, with a configurable share (default 10%) paid to the whistleblower and the rest to a victims fund. After the window, verified investors trade shares on a KYC-gated SaucerSwap V2 pool.

## 3. Why Hedera (the pattern developers take away)

On an EVM chain, every one of these guarantees is Solidity that must be written and audited. On Hedera, most are enforced by the network:

| Guarantee | Hedera mechanism |
|---|---|
| No shares without a validator quorum | HTS supply key = `ThresholdKey(k of n)` of committee keys |
| Validators sign asynchronously over days | Hedera Schedule Service: `ScheduleCreate(TokenMint)` with long-term expiry, `ScheduleSign` per validator (HIP-423) |
| Validators sign from an EVM wallet | HIP-755 `signSchedule()` facade on the 0x16b system contract |
| No trading before the challenge window ends | HTS KYC key held by the protocol contract; KYC granted only after finalization |
| Emergency stop on proven fraud | HTS pause key held by the protocol contract |
| Unpredictable committee | PRNG system contract (HIP-351) |
| Tamper-evident audit trail | HCS topic per asset: submission, reports, challenges, rulings |
| Arbiter multisig without a multisig contract | Arbiter account key = native `ThresholdKey` |
| Keys nobody can swap later | Share token created without an admin key (immutable key set) |

Section to be reproduced in the template README as "Why this needs Hedera".

## 4. Users and roles

| Role | Does |
|---|---|
| **Protocol admin** | Approves validators after off-chain KYC. Sets parameters. Testnet demo: one generated account. |
| **Validator** | Stakes HBAR, receives a non-transferable badge, reviews assigned documents, publishes a report, signs the scheduled mint or abstains. |
| **Owner** | Submits a title deed with a deposit, creates the share token, receives shares as treasury, seeds the SaucerSwap pool. |
| **Investor** | Gets KYC-verified, enables KYC for a finalized asset, buys and sells shares on SaucerSwap. |
| **Whistleblower** | Anyone. Posts a bond and evidence to challenge an asset. |
| **Arbiter** | Member of the arbiter threshold account. Rules on challenges. |

## 5. End-to-end flow

1. **Onboarding.** Validator registers with a minimum stake. Admin approves (off-chain KYC assumed). Validator receives a frozen, non-transferable badge NFT.
2. **Submission.** Owner uploads the title deed to IPFS, calls `submitAsset(cid, sha256, declaredValue)` with a deposit. An HCS topic is created for the asset and the submission is logged.
3. **Draw.** The contract draws `COMMITTEE_SIZE` validators using the PRNG seed, excluding validators whose exposure cap would be exceeded.
4. **Token creation.** Owner creates the share token (fungible, finite supply) with: treasury = owner, supply key = `ThresholdKey(QUORUM of committee)`, KYC key = protocol contract, pause key = protocol contract, wipe key = protocol contract, no admin key. Owner registers the token ID; the protocol verifies via the mirror node that the key set matches the drawn committee.
5. **Scheduled mint.** Owner creates `ScheduleCreate(TokenMint(totalShares))` with `wait_for_expiry = false` and an expiry of `REVIEW_PERIOD`.
6. **Review.** Each committee member downloads the document, publishes a report hash via `attest(assetId, reportHash, approve)` (logged to HCS), and, if approving, signs the schedule. A validator who signs without a prior report is flagged.
7. **Mint.** When the quorum signs, the network executes the mint. Owner calls `confirmMint(assetId)`; the contract checks total supply and opens the challenge window.
8. **Challenge window.** Shares sit in the owner's treasury. No other account can hold them because the contract refuses to grant KYC for this token until finalization.
9. **Finalization.** After `CHALLENGE_WINDOW`, anyone calls `finalize(assetId)`. Optionally auto-triggered by a scheduled contract call (HIP-1215). Owner's deposit is returned.
10. **Market.** Verified investors call `enableAsset(assetId)` and receive token KYC. The contract grants KYC to the SaucerSwap V2 pool and position manager. Owner creates the pool and adds liquidity. Investors swap.
11. **Challenge (any time).** Challenger posts `CHALLENGE_BOND` and an evidence hash. During the window: finalization is blocked. After the window: the token is paused immediately.
12. **Ruling.** The arbiter account calls `resolve(challengeId, upheld, guilty[])`.
    - **Upheld:** guilty validators are slashed. `WHISTLEBLOWER_SHARE_BPS` (default 1000 = 10%) of slashed stake goes to the challenger, bond returned; the rest goes to the asset's victims fund. Token stays paused. If shares had traded, a holder snapshot is taken from the mirror node at the pause timestamp, its Merkle root is posted by the arbiter, and holders claim pro-rata with a proof.
    - **Rejected:** the bond goes to the challenged party (owner) and validators; the token is unpaused if it was paused.
13. **Leniency.** A committee member who signed and is the first to file an upheld challenge on that asset is exempt from slashing (and receives no bounty). Configurable, on by default.

## 6. Parameters (all configurable in `packages/hardhat/config/protocol.ts` and mirrored in `template.json`)

| Parameter | Demo default (testnet) | Recommended production |
|---|---|---|
| `POOL_SIZE` (seeded validators) | 12 | ≥ 30 |
| `COMMITTEE_SIZE` | 7 | 7 |
| `QUORUM` | 5 | 5 |
| `MIN_STAKE` | 20 HBAR | set by risk policy |
| `EXPOSURE_MULTIPLE` | 10× stake | ≤ 5× stake + insurance |
| `SUBMISSION_DEPOSIT` | 5 HBAR | significant; forfeited on rejection |
| `CHALLENGE_BOND` | 5 HBAR | significant |
| `REVIEW_PERIOD` | 30 min | 14 days |
| `CHALLENGE_WINDOW` | 10 min | 7–30 days |
| `UNBONDING_PERIOD` | 30 min | > challenge window + max exposure horizon |
| `WHISTLEBLOWER_SHARE_BPS` | 1000 | 1000 |
| `LENIENCY_ENABLED` | true | policy decision |

The README must include the collusion math: with a pool of 30, committee 7, quorum 5, an attacker controlling 10 validators has ~2.6% chance per submission to draw 5 accomplices. Forfeited submission deposits price out retry attacks.

## 7. Architecture

### Monorepo

```
packages/
  hardhat/            # contracts, tests, deploy + seed scripts
  nextjs/             # App Router frontend + server routes for native HAPI ops
  hedera/             # shared SDK helpers: keys, schedules, HCS, mirror node, SaucerSwap
template.json
README.md
AGENTS.md
docs/ARCHITECTURE.md
docs/THREAT_MODEL.md
docs/TESTNET_VERIFICATION.md
docs/ADAPTING.md       # "the 3 files to change to tokenize your own asset type"
.harness/              # spec, PRD increments, validators
```

### Contracts (Solidity, Hardhat)

- **`ValidatorRegistry`** — register with stake, admin approval, badge mint (HTS NFT, contract supply key, frozen by default), unbonding withdrawals, exposure accounting, `slash()` callable only by `TitleRegistry`.
- **`TitleRegistry`** — assets, submission deposits, PRNG draw, attestations, `confirmMint`, `finalize`, KYC grants via the HTS system contract, pause/unpause, challenges, rulings, payouts, leniency, victims fund, Merkle claims.
- **`ProtocolConfig`** — parameters, arbiter address, admin.
- No proxies or diamonds: a known testnet issue affects HIP-1215 schedules booked from DELEGATECALL frames.

### Native operations (Next.js server routes using `packages/hedera`)

Some operations cannot be done from an EVM wallet: `TokenCreate` with a `ThresholdKey`, HCS topic creation and messages, account creation for the demo. These run in server routes.

### Signing modes

- **Demo mode (default, required).** A seed script creates all testnet actors (admin, 12 validators, owner, 2 investors, 3 arbiters) funded from the operator account. Keys are written to `.demo-keys.json`, gitignored, never committed. The UI has an "Act as" role switcher. This mode powers the scripted end-to-end run and on-chain validation.
- **Wallet mode (should).** Contract calls through RainbowKit/wagmi. Validators sign the scheduled mint from MetaMask via HIP-755 `signSchedule()`.
- **HashPack (may).** Native ops from a Hedera wallet, documented as the production path for owners.

### Graceful degradation

With no `.env` the app must boot, all routes return 200, and pages explain how to configure the operator key. Required for the eligibility gate.

## 8. Ecosystem integrations (35 points — load-bearing)

- **SaucerSwap V2** — the only way share holders can exit. Removing it leaves an illiquid token, which is the core problem the template solves. Pool creation, liquidity, swaps, quotes via SaucerSwap's testnet contracts and REST API.
- **IPFS** — the title deed itself. Without it there is nothing for validators to verify. Pinning via a configurable provider (env `IPFS_PINNING_JWT`); without a key, the demo computes the CID locally and serves from a local store, clearly labeled.

If KYC-gated tokens cannot be pooled on SaucerSwap V2 testnet (spike S1), fall back as documented in section 12.

## 9. Functional requirements

- **FR-1** Validator registration with stake ≥ `MIN_STAKE`; admin approval; badge mint; badge is non-transferable.
- **FR-2** Validator withdrawal only after `UNBONDING_PERIOD` and with no open exposure.
- **FR-3** Asset submission with deposit, IPFS CID and SHA-256 of the file; HCS topic created; submission logged.
- **FR-4** Committee draw via PRNG; deterministic given the seed; excludes validators over exposure cap; stored and emitted.
- **FR-5** Token creation with the exact key set in §5 step 4; the app verifies the on-chain key set via the mirror node and refuses to register a mismatching token.
- **FR-6** Scheduled mint collecting validator signatures; executes only at quorum.
- **FR-7** `attest()` records report hash and vote; relayed to HCS; UI shows each validator's report status.
- **FR-8** Challenge window opens on `confirmMint`; KYC grants refused until `finalize`.
- **FR-9** `finalize()` permissionless after window; deposit returned; optional HIP-1215 auto-finalize.
- **FR-10** Investor verification and per-asset KYC enablement.
- **FR-11** SaucerSwap V2 pool creation, liquidity provision and swap by a KYC'd investor.
- **FR-12** Challenge with bond and evidence hash; pause if after window.
- **FR-13** Ruling by arbiter account only; slashing split; bond handling; leniency; everything logged to HCS.
- **FR-14** Victims fund with Merkle-root holder snapshot built from the mirror node; holder claims.
- **FR-15** Asset page shows full history from HCS + mirror node with HashScan links.

## 10. Non-functional requirements

- Eligibility gate passes from a fresh scaffold: install, lint, build clean; boot; core routes 200.
- No secrets committed; `.env.example` complete; `.demo-keys.json` gitignored.
- Contract tests cover: draw, quorum logic (mocked HTS), challenge lifecycle, slashing math, leniency, claims.
- Errors surfaced with Hedera status codes and human explanations.
- No dead code, no placeholder TODOs in shipped paths.
- Explicit disclaimer: not legal advice; no claim that tokens carry legal title.

## 11. Rubric mapping (to be kept in the README)

| Criterion | Points | How the template earns it |
|---|---|---|
| Ecosystem integration | 35 | SaucerSwap V2 is the exit; IPFS holds the verified document. Remove either and the template loses its purpose. |
| Docs quality | 30 | README, AGENTS.md, ARCHITECTURE, THREAT_MODEL, TESTNET_VERIFICATION, ADAPTING; collusion math; trust assumptions stated. |
| Code quality | 20 | Typed monorepo, contract tests, shared `hedera` package, graceful degradation, clear errors. |
| Hedera service depth | 15 | HTS (threshold supply key, KYC, pause, wipe, frozen badge), HSS (long-term schedules, HIP-755, HIP-1215), HCS, PRNG, mirror node, threshold account keys. |

## 12. Risks and day-1 spikes

| # | Spike | Pass condition | Fallback |
|---|---|---|---|
| S1 | KYC-enabled HTS token in a SaucerSwap V2 pool | Pool created, liquidity added, KYC'd investor swaps | Grant KYC to every SaucerSwap contract touched; if still failing, forked-mainnet read-only integration documented per the brief |
| S2 | `ThresholdKey(5 of 7 ECDSA)` as supply key + scheduled `TokenMint` signed one by one | Mint executes on the 5th signature, not before | Contract-held supply key with on-chain quorum count |
| S3 | HIP-755 `signSchedule()` from an EVM wallet on testnet | Schedule signature added from MetaMask | Demo mode only; document limitation |
| S4 | Contract as KYC and pause key, calling the HTS system contract | Grant KYC and pause/unpause succeed | Operator key in server route, documented |
| S5 | HIP-1215 auto-finalize from a non-proxy contract | Scheduled call executes at expiry | Permissionless `finalize()` only |
| S6 | Long-term schedule expiry on testnet | Schedule survives beyond 30 min | Shorter review period in demo |

Structural risks: SaucerSwap LP positions during a fraud event (pool-held shares) are documented as a known limitation. Arbiter multisig is a trust assumption, stated in THREAT_MODEL.md.

## 13. Delivery plan (harness increments)

Five increments, each with its own acceptance checklist in `.harness/prds/`:

1. `01-foundation` — monorepo, contracts, config, seed script, template.json, docs skeleton.
2. `02-attestation` — submission, IPFS, HCS, draw, token creation, scheduled mint, reports.
3. `03-challenge` — window, finalize, challenges, rulings, slashing, leniency, victims fund.
4. `04-market` — investor KYC, SaucerSwap V2 pool, swap.
5. `05-polish` — UI flows, full docs, verification evidence, rubric table.

| Days | Work |
|---|---|
| Sept 21–22 | Spikes S1–S6. Go/no-go per fallback. |
| Sept 23–24 | Increment 01 |
| Sept 25–27 | Increment 02 |
| Sept 28–29 | Increment 03 · Sept 29 AMA: validate design choices |
| Sept 30–Oct 1 | Increment 04 |
| Oct 2–3 | Increment 05, fresh-scaffold gate run, `validate-submission` skill |
| Oct 4 | Buffer. Submit before 23:59 ET. |

## 14. Out of scope (listed in README "Going further")

Decentralized arbitration (second random committee), HBARX (Stader) as stake asset, insurance integration, per-jurisdiction compliance modules (ERC-3643 bridge to Asset Tokenization Studio), mainnet deployment, legal wrapper.
