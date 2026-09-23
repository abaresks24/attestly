# Architecture

How the Attestly template is put together, and why each piece lives where it does. For the
product overview and quickstart, read the [README](../README.md); to change behavior, read
[ADAPTING.md](./ADAPTING.md).

## Monorepo layout

```
packages/
  hardhat/   AssetRegistry.sol, InvestorRegistry.sol, unit tests, deploy + config/rwa.ts
  nextjs/    App Router UI + server routes for native HAPI operations (Node runtime)
  hedera/    shared typed helpers: client, mirror, keys, schedules, HCS, SaucerSwap, errors, attesters
mock-registry/  titles.json — the land registry the demo MockRegistryAttester queries
docs/           ARCHITECTURE.md, ADAPTING.md, TESTNET_VERIFICATION.md, BUILD_PLAN.md, PROTOCOL_VISION.md
template.json   scaffold-hbar manifest (parameters mirrored from config/rwa.ts)
```

Three workspaces, one concern each: **contracts** (on-chain rules), **frontend + server routes**
(native operations an EVM wallet can't sign), and **`@sh/hedera`** (the reusable SDK/mirror glue that
both the routes and the demo scripts share).

## Contracts (`packages/hardhat/contracts`)

- **`AssetRegistry`** is the on-chain state machine and the holder of every issued token's **KYC and
  pause keys**. It tracks the asset record (issuer, token, document hash, CID, shares, HCS topic,
  lockup end, status), records attestations, enforces the lockup, and calls the HTS system contract at
  `0x167` to grant KYC / pause / unpause. Status flow: `Submitted → Registered → Minted → Finalized`.
  Key entry points: `submitAsset`, `registerToken`, `attest`, `confirmMint`, `finalize(assetId, pair)`,
  `enableAsset`, `pause` / `unpause` (guardian only).
- **`InvestorRegistry`** records admin-approved investors (`approve`, `isVerified`). Off-chain KYC is
  assumed; the contract records the decision, HTS enforces the consequence.

No proxies: schedules booked from a `DELEGATECALL` frame hit a known testnet issue, so the registry is
deployed directly. Tokens are created **without an admin key**, so the key set is immutable after
creation — this is a core invariant the app verifies on the mirror before it trusts a token.

## Native operations (`packages/nextjs/app/api`)

Some operations — creating a token with a `ThresholdKey` supply key, creating HCS topics, booking a
scheduled mint — are **HAPI operations an EVM wallet cannot express**. They run in Node-runtime server
routes that, in demo mode, sign with the seeded actors' keys (`packages/nextjs/utils/demo.ts`).

| Route | Does |
|---|---|
| `POST /api/assets` | submit → create token (verify key set on mirror) → register → schedule mint |
| `POST /api/assets/[id]/attest` | record `attest()` + HCS log, then sign the scheduled mint (per attester) |
| `POST /api/assets/[id]/confirm-mint` | issuer confirms the mint; the lockup starts |
| `GET  /api/assets/[id]` | on-chain state + HCS timeline + schedule signature progress |
| `POST /api/assets/[id]/market/finalize` | create/resolve the V1 pair and grant it KYC |
| `POST /api/assets/[id]/market/liquidity` | issuer seeds shares + HBAR liquidity |
| `POST /api/assets/[id]/market/enable` | admin approve + associate + KYC-enable an investor |
| `POST /api/assets/[id]/market/swap` | investor swaps HBAR ⇄ shares; failures diagnosed from the mirror |
| `POST /api/assets/[id]/market/guardian` | pause / unpause via the native `ThresholdKey(2/3)` account |

The reads never touch consensus nodes — they use the mirror node REST API (with propagation-aware
retry) to avoid `BUSY`/timeout responses under load.

> **Security note.** These POST routes are **unauthenticated by design** — in demo mode the server
> holds every seeded actor's key and the request body selects which actor to sign as. That is fine for
> a local/testnet walkthrough and cannot break the on-chain invariants (KYC, quorum, guardian
> threshold are enforced by the network), but the app must **never** be exposed publicly or pointed at
> mainnet. Production replaces demo mode with wallet mode (no server-side keys).

## Shared helpers (`packages/hedera/src`)

The typed layer both the routes and the `demo-*.ts` scripts import:

- `client.ts` — testnet SDK client + operator loading (resilient to `BUSY`).
- `mirror.ts` — mirror REST with retry; `contractIdFromEvm`, `tokenInfo`, balances.
- `keys.ts` — encode/decode `ThresholdKey`; `verifyThresholdKey` (the FR-2 key-set gate).
- `issuance.ts` / `flows.ts` — token create, HCS, schedule create/sign; end-to-end issuance.
- `market.ts` — SaucerSwap V1 pair/liquidity/swap, `finalizeAsset`, `enableInvestor`, `guardianSetPause`.
- `registry.ts` — ethers bindings to `AssetRegistry`/`InvestorRegistry`.
- `errors.ts` — maps HTS status codes **and** SaucerSwap's `"Safe token transfer failed!"` wrapper to plain sentences.
- `attesters/` — the `Attester` interface and the two demo adapters.
- `constants.ts` — testnet endpoints and the **venue seam** (`SAUCERSWAP_V1`).

## The mint quorum, without Solidity

The token's supply key is a native `ThresholdKey(k of n)` over the attester public keys. Issuance
books a long-term `ScheduleCreate(TokenMint)` (HIP-423); each approving attester adds a signature
(SDK `ScheduleSign` in demo mode, HIP-755 `signSchedule()` from a wallet). The network executes the
mint **at the k-th signature and not before** — the quorum is enforced by consensus, not a contract.

## Demo mode vs wallet mode

- **Demo mode** (`yarn seed:demo`): actor keys in gitignored `.demo-keys.json`; the server acts as
  issuer/attester/guardian/investor so the whole story runs on one machine. `.demo-state.json` holds
  the per-asset off-chain bits the contract doesn't keep (schedule id, HCS topic, resolved pair).
- **Wallet mode**: contract calls via RainbowKit/wagmi; attester signing via HIP-755. No server-side
  keys.

## Graceful degradation

With no env the app still boots: every route returns 200 and the UI shows a configuration notice.
IPFS pinning is optional (labeled local fallback). This is an invariant — see the increment-01
acceptance in [ACCEPTANCE.md](./ACCEPTANCE.md).
