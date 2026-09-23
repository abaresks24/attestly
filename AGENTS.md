# Agent instructions

Briefing for coding agents (Cursor, Claude Code, Codex) working in the **Attestly** template (attested
real-world assets on Hedera).
Claude Code loads this through `CLAUDE.md`. For the product overview read [README.md](README.md); for
how the pieces fit, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); to change behavior,
[docs/ADAPTING.md](docs/ADAPTING.md).

This is a Scaffold-HBAR dApp pruned to **Hardhat + Next.js + a shared `@sh/hedera` package** (no
Foundry). Package manager is **Yarn 3** (`packageManager` in the root `package.json`). Examples use
`yarn`.

## Repo map

```
packages/hardhat/   AssetRegistry.sol, InvestorRegistry.sol, interfaces/, test/, deploy/, config/rwa.ts
packages/nextjs/    App Router UI + /app/api server routes (Node runtime) for native HAPI ops
packages/hedera/    @sh/hedera — client, mirror, keys, schedules, market, errors, attesters/, demo-*.ts
mock-registry/      titles.json for the demo MockRegistryAttester
docs/               ARCHITECTURE, ADAPTING, ACCEPTANCE, TESTNET_VERIFICATION, BUILD_PLAN, PROTOCOL_VISION
scripts/gate-check.sh   offline eligibility gate (install, lint, types, tests, build)
```

## Invariants — do not break these

These are the reason the template exists. Changing them changes the security model.

1. **Token key set (FR-2).** Tokens are created with: supply key = `ThresholdKey(k of n)` over the
   attester keys; KYC key = pause key = the `AssetRegistry` contract; **no admin key** (immutable).
   The app verifies this on the mirror (`verifyThresholdKey`, `packages/hedera/src/keys.ts`) **before**
   `registerToken`. Never register a token whose keys don't match.
2. **Quorum is enforced by the network, not Solidity.** The scheduled `TokenMint` executes at the
   k-th signature. Don't add a contract that mints directly.
3. **Lockup.** `AssetRegistry` refuses to grant KYC until `finalize`, after `lockupPeriodSeconds`.
4. **Guardian is a native `ThresholdKey(2/3)` account**, not a multisig contract. Pause/unpause is a
   `ContractExecuteTransaction` signed by the member keys (`guardianSetPause`).
5. **No proxies.** Schedules booked from a `DELEGATECALL` frame hit a testnet issue; deploy the
   registry directly.
6. **Graceful degradation.** The app boots with no env; every route returns 200. Keep it that way.

## Commands

```bash
yarn install
yarn deploy:testnet          # deploy AssetRegistry + InvestorRegistry to hederaTestnet
yarn seed:demo               # issuer, 3 attesters, guardian 2/3, 2 investors -> gitignored .demo-keys.json
yarn next:dev                # http://localhost:3000

# Quality (also what scripts/gate-check.sh runs)
yarn lint
yarn format
yarn hardhat:compile
yarn hardhat:test            # contract unit tests
yarn workspace @sh/hedera test   # attester adapter tests
yarn next:build

# On-chain end-to-end proofs (need operator env + seeded demo)
yarn workspace @sh/hedera exec tsx src/demo-issue.ts
yarn workspace @sh/hedera exec tsx src/demo-market.ts
yarn workspace @sh/hedera exec tsx src/demo-guardian.ts <assetId> <tokenId>

# Deployer account
yarn hardhat:account:generate | :import | :account
```

After deploy, ABIs + addresses are written to `packages/nextjs/contracts/deployedContracts.ts`.
Redeploy fresh: `__RUNTIME_DEPLOYER_PRIVATE_KEY=<key> yarn workspace @sh/hardhat exec hardhat deploy --network hederaTestnet --reset`.

## How to change things (see ADAPTING.md for full detail)

- **Add an attester:** implement `Attester` in a new file under `packages/hedera/src/attesters/`,
  export it from `index.ts`, add a test. The demo adapters are `manual.ts` and `mockRegistry.ts`.
- **Change a parameter** (committee size, quorum, lockup, shares): `packages/hardhat/config/rwa.ts`
  (mirrored in `template.json`).
- **Change the asset type:** name/symbol/document are set per submission (`/assets/new` or
  `issueAsset(...)` in `packages/hedera/src/flows.ts`); extend `AssetForReview` if the attester needs
  more fields.
- **Change the trading venue:** addresses in `packages/hedera/src/constants.ts` (`SAUCERSWAP_V1`);
  pair/liquidity/swap logic in `packages/hedera/src/market.ts`; error strings in `errors.ts`.

## Frontend contract interaction

Hooks in `packages/nextjs/hooks/scaffold-hbar` — use the names that exist:
`useScaffoldReadContract`, `useScaffoldWriteContract`, `useScaffoldWatchContractEvent`,
`useScaffoldEventHistory`, `useDeployedContractInfo`, `useScaffoldContract`, `useTransactor`.

Native HAPI operations (token create with a threshold key, HCS, schedules) **can't be signed by an
EVM wallet** — they live in Node-runtime server routes under `packages/nextjs/app/api/`, which in demo
mode sign with the seeded actors via `packages/nextjs/utils/demo.ts`. Reads use the mirror node, not
consensus queries.

Web3 UI components come from `@scaffold-hbar-ui/components` (`Address`, `Balance`, …). Prefer DaisyUI
classes over raw Tailwind when a component exists.

## Networks

- Hardhat: `packages/hardhat/hardhat.config.ts` (`hederaTestnet` 296, `hederaMainnet` 295)
- Next.js: `packages/nextjs/scaffold.config.ts` (target networks, RPC overrides, WalletConnect)

## Style

| Style | Use |
| --- | --- |
| `UpperCamelCase` | types, components |
| `lowerCamelCase` | variables, functions |
| `CONSTANT_CASE` | constants |
| `snake_case` | Hardhat deploy files |

Next.js imports use the `~~` alias. App Router pages live under `packages/nextjs/app/`; add
`"use client"` when a page uses hooks. Prefer `type` over `interface`, no `T` prefix, let TypeScript
infer. Comments should add information. Commit with Conventional Commits.
