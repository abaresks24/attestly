# Build plan — Attested RWA template

Decision from the feasibility phase: **GO with fallback** (see `spikes/REPORT.md`). Hedera-native
core (S2/S3/S4) confirmed; ecosystem venue is **SaucerSwap V1** (V2 blocked on testnet by a
misconfigured `poolCreateFee`, unrelated to KYC). Every increment reuses the accounts, addresses and
formats validated in `spikes/findings.json` — nothing is re-discovered.

---

## 1. Where the spikes change the PRD (and how we resolve it)

| # | PRD says | Spike result | Resolution in the template |
|---|---|---|---|
| G1 | Trade on **SaucerSwap V2** (§3.7, §5, FR-7) | V2 pool creation reverts `PCF` — testnet `poolCreateFee` = $1M (~12.8M HBAR). V1 works ($2 fee). | Ship **V1** (factory `0.0.9959`, router `0.0.19264`) as the venue. Keep a `venue` config seam and document the V2 limitation. Re-evaluate if SaucerSwap fixes testnet (AMA 29/09). |
| G2 | `finalize()` grants KYC to "the SaucerSwap contracts" | Minimal set = **the pair only**; the router never holds the token. Pair is **CREATE2** (id known only after creation). | `finalize(assetId, pairId)` grants KYC to the pair via the `AssetRegistry` (which holds the KYC key, proven in S4). The app resolves the pair id from the mirror (`/contracts/{evm}`) and passes it in. |
| G3 | Grant KYC to an account (§3.2) | HTS `grantTokenKyc` needs the account **alias EVM address**, not long-zero (else `INVALID_ACCOUNT_ID`). | Investor-initiated `enableAsset()` uses `msg.sender` (the alias) — no address plumbing. Any admin-provided-address path resolves the alias from the mirror. |
| G4 | "Readable errors for `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` / `TOKEN_IS_PAUSED`" (FR-7) | SaucerSwap's `TransferHelper` **masks** the HTS code as `"Safe token transfer failed!"`. Raw code only in the mirror action trace. | Error map covers both: raw HTS codes (native transfers) **and** the SaucerSwap wrapper string → "transfer refused (KYC not granted or token paused)". Optional: fetch the mirror action trace to surface the exact code. |
| G5 | (implicit) contract calls | HTS ops inside contracts are gas-heavy. | Helper defaults: create pair ~9M, add liquidity ~8M, swap ~6M, contract deploy ~1M, HTS grant/pause ~1M. |
| G6 | Verify the token key set on the mirror (FR-2, invariant) | Mirror returns a ThresholdKey as opaque `ProtobufEncoded` hex. | Port `spikes/lib/keys.ts` (protobuf decode via `@hiero-ledger/proto` + `Key._fromProtobufKey`) into `packages/hedera`. |
| G7 | (implicit) network | Testnet consensus nodes return `BUSY`/timeout under load. | SDK client with `maxAttempts` high + backoff; read balances via mirror, not consensus queries. |
| G8 | HIP-755 wallet mode (should) | Form B confirmed: `IHRC755ScheduleFacade.signSchedule()` on the schedule's long-zero address (selector `0x06d15889`). | Wallet-mode attester signing uses form B; demo mode uses SDK `ScheduleSign`. |

**Invariants unchanged.** The fallback only swaps the trading venue; native keys, the attestation
lifecycle, the guardian threshold account, "no admin key", and HCS logging are all untouched.

## 2. Deferred ideas (out of scope, parked)

- SaucerSwap V2 integration as the nominal venue (revisit if testnet `poolCreateFee` is fixed).
- Surfacing the exact masked HTS code by parsing the mirror action trace in the UI (nice-to-have; the error map covers the common cases).
- S2b larger committees (7/15-key threshold supply keys) — not run; note as an open question.
- Everything in `docs/PROTOCOL_VISION.md` (staking, slashing, PRNG committee draw, challenges).

## 3. Scaffold baseline

Per the brief, we do **not** start from an empty dir. Increment 01 begins by generating the closest
official scaffold-hbar template and evolving it:

- CLI: `npm create scaffold-hbar@latest` — start from the **`blank`** built-in (or `payments-scheduler`
  if it maps closer to a monorepo with hardhat), then prune to our case.
- Tooling to match official (findings.json > scaffold_tooling): Node ≥ 20.18.3, **yarn@3.2.3**
  workspaces, packages `hardhat` / `nextjs` / **`hedera`** (shared helpers), Next 15, Hardhat 2.22,
  RainbowKit/wagmi/viem. `template.json` `create-scaffold-hbar` manifest at repo root.
- `.gitignore` (already in place), MIT `LICENSE`, `AGENTS.md` + `CLAUDE.md` (pointer), `.env.example`.

If the CLI needs a network/interactive step I can't complete headless, I'll fall back to replicating
the official structure by hand from the `hedera-dev/scaffold-hbar` layout and note it.

## 4. Increment plan (maps to `.harness/prds/`)

### 01 — Foundation
Monorepo + tooling; `AssetRegistry.sol` (asset records, attestations, lockup, finalize, KYC grant via
HTS `0x167`, guardian-only pause/unpause) and `InvestorRegistry.sol` (admin-approved investors);
`packages/hardhat/config/rwa.ts` (PRD §6 defaults); `yarn seed:demo` (issuer, 3 attesters, 3 guardian
members + `ThresholdKey(2/3)` account, 2 investors → gitignored `.demo-keys.json`); `template.json`,
`.env.example`, README/AGENTS skeletons, MIT LICENSE; app boots with no env (all routes 200 + config
notice). Port `packages/hedera` helpers from the spikes (client, mirror, keys, evm, errors).
**Exit:** `.harness/prds/01-foundation.md` acceptance, incl. `deploy:testnet` + guardian threshold
account verified on the mirror.

### 02 — Quorum-gated issuance
IPFS upload (pinning or labeled local fallback); asset submission + HCS topic per asset; server route
creating the token with the exact key set (threshold supply key, KYC+pause = `AssetRegistry`, no admin);
**mirror key verification before `registerToken`**; `ScheduleCreate(TokenMint)` long-term expiry;
per-attester signing (demo keystore + HIP-755 wallet path); attester interface in
`packages/hedera/attesters/` (`ManualAttester`, `MockRegistryAttester`); `attest()` on-chain + HCS;
`confirmMint` starts lockup; pages `/assets/new`, `/assets/[id]`, `/attest`.
**Exit:** `.harness/prds/02-issuance.md` acceptance (mint executes only at the 2nd signature, etc.).

### 03 — KYC-gated market + guardian (V1)
`finalize(assetId, pairId)` grants KYC to the pair; issuer creates the V1 pair + adds liquidity;
investor `enableAsset()` (KYC via `msg.sender`) + swap; guardian pause/unpause signed 2-of-3; readable
errors for the HTS codes **and** the SaucerSwap `"Safe token transfer failed!"` wrapper; page
`/assets/[id]/market`. V2 limitation documented in the README.
**Exit:** `.harness/prds/03-market.md` acceptance (verified investor swaps; unverified refused; pause
blocks trading).

### 04 — Docs & polish
`/` guided demo ("Run the full story"); full README (problem, 60s quickstart, env table, Mermaid,
"Why Hedera", "Who are the attesters?", rubric, trust assumptions, disclaimer, Going further →
PROTOCOL_VISION); AGENTS.md; `docs/ARCHITECTURE.md`, `docs/ADAPTING.md`, `docs/TESTNET_VERIFICATION.md`;
remove dead code; `scripts/gate-check.sh` from a fresh scaffold.
**Exit:** `.harness/prds/04-docs-polish.md` acceptance + eligibility gate green.

## 5. Working loop (per increment)

Implement scope only → local tests (hardhat unit, adapter tests, lint, typecheck, build) → run each
on-chain acceptance criterion on testnet (HashScan link + mirror verification) → log evidence in
`docs/TESTNET_VERIFICATION.md` → tick `docs/ACCEPTANCE.md` criterion-by-criterion with proof →
re-check previous increments → commit (Conventional Commits) → short French report to the user.
