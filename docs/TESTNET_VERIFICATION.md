# Testnet verification

On-chain evidence for the acceptance criteria. Network: Hedera **testnet** (chain 296).
Operator `0.0.10667593` (ECDSA). Deeper feasibility evidence is in `spikes/REPORT.md`.

## Increment 01 — Foundation

| Step | Entity / tx | Link / proof |
|---|---|---|
| Seed guardian account (ThresholdKey 2 of 3) | account `0.0.10671266` | [HashScan](https://hashscan.io/testnet/account/0.0.10671266) — mirror `key._type=ProtobufEncoded` decodes to `threshold 2, keys 3` |
| Seed issuer | `0.0.10671257` | [HashScan](https://hashscan.io/testnet/account/0.0.10671257) |
| Seed attesters | `0.0.10671258`, `0.0.10671259`, `0.0.10671260` | supply-key members |
| Seed guardian members | `0.0.10671262`, `0.0.10671264`, `0.0.10671265` | guardian threshold members |
| Seed investors | `0.0.10671267`, `0.0.10671269` | |
| Deploy InvestorRegistry | tx `0x2b6a88de5839813930a8331ca2a4bc01a6b89df1c0f7fa05a3fae8977744617a` | [contract 0xDA604dD1…Cd36f](https://hashscan.io/testnet/contract/0xDA604dD18c0dC46ee09CBD20cECdEc51d87Cd36f) |
| Deploy AssetRegistry | tx `0xad6d8f9a22e80e57a47ae9e582806bf68223e3143b67f7eb65c157fcf9597e08` | [contract 0x3F536A2a…07652](https://hashscan.io/testnet/contract/0x3F536A2a22fF1D99F6b08b72FE4A9aDE8DC07652) |
| Verify guardian wired | `AssetRegistry.guardian()` | eth_call returns `0x…00a2d4a2` = long-zero of `0.0.10671266` |

## Increment 02 — Issuance

End-to-end run: `yarn workspace @sh/hedera exec tsx src/demo-issue.ts` (asset #0).

| Step | Entity / tx | Proof |
|---|---|---|
| HCS topic (audit trail) | topic `0.0.10671502` | first message contains `cid` + `sha256` |
| submitAsset (issuer) | asset #0 | `AssetSubmitted` event |
| Create asset token | token `0.0.10671508` | [HashScan](https://hashscan.io/testnet/token/0.0.10671508) |
| Key set verified on mirror | — | supply = ThresholdKey(2/3), `admin_key: null`, kyc_key & pause_key = `0.0.10671319` |
| registerToken (issuer, keys matched) | — | app refuses if `verifyThresholdKey` fails |
| Attestations (2 of 3) | attesters `0.0.10671258`, `0.0.10671259` | on-chain + HCS `attested` messages |
| Scheduled mint | schedule `0.0.10671514` | [HashScan](https://hashscan.io/testnet/schedule/0.0.10671514) |
| Mint at quorum | — | 1 sig → supply 0; 2 sig → executed, `total_supply=1000000` |
| confirmMint (lockup) | — | status=Minted, `lockupEnds` in the future |

**UI-route run** (`POST /api/assets` → `POST /api/assets/1/attest` ×2): asset #1, token `0.0.10671876`, schedule `0.0.10671880`, topic `0.0.10671874`. Two attester approvals via the route → schedule executed, `total_supply=1000000` to issuer treasury, kyc/pause key = registry, `admin_key: null`. Proves the issuance + attestation server routes end-to-end.

## Increment 03 — Market (SaucerSwap V1)

Fresh registry with a 120s demo lockup: AssetRegistry `0xB461DD05E0E5C803ac11110E51A9DdCAd0c0Ab62`,
InvestorRegistry `0xbcB2237B6FB03390bDEC0b0A58998472563fE48b`.

End-to-end run: `yarn workspace @sh/hedera exec tsx src/demo-market.ts` (asset #2).

| Step | Entity | Proof |
|---|---|---|
| Asset token | `0.0.10672214` | issued + minted (quorum) + confirmMint → lockup |
| Create V1 pair | `0.0.10672243` | SaucerSwap V1 factory `0.0.9959` (pairCreateFee ~$2) |
| finalize → KYC to pair | — | registry (KYC key) grants the pair KYC |
| Add liquidity | — | 500,000 shares / 10 HBAR via router `0.0.19264` |
| Verified investor swap | investor `0.0.10671267` | 1 HBAR → **45,330 shares** (mirror balance delta) |
| Guardian pause (1 sig) | guardian `0.0.10671266` | refused `INVALID_SIGNATURE` (`demo-guardian.ts`) |
| Guardian pause (2 sig) | — | token `PAUSED`; a swap while paused is refused |
| Guardian unpause (2 sig) | — | token `UNPAUSED`; trading resumes |
| Unverified refused | — | `ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN` (176) — spike S1b |

**UI-route run** (market server routes behind `/assets/[id]/market`, asset #1, token `0.0.10672156`, pair `0.0.10672186`), each verified over HTTP against the running app:

| Route | Call | Result |
|---|---|---|
| `GET /api/assets/1/market` | — | resolves pair from the V1 factory, reads `pause_status`, per-investor `kyc_status` + balance |
| `POST …/market/guardian` `{pause:true,[0]}` | pause, 1 signer | refused → `INVALID_SIGNATURE` mapped to a plain sentence |
| `POST …/market/guardian` `{pause:true,[0,1]}` | pause, 2 signers | ok → token `PAUSED` (mirror) |
| `POST …/market/swap` `{investorIndex:0}` while paused | verified investor | refused → diagnosed as `TOKEN_IS_PAUSED` from the mirror |
| `POST …/market/guardian` `{pause:false,[1,2]}` | unpause, 2 signers | ok → token `UNPAUSED` |
| `POST …/market/enable` `{investorIndex:0}` | admin approve + associate + KYC | investor `0.0.10671267` → `kyc_status: GRANTED` |
| `POST …/market/swap` `{investorIndex:0}` | verified investor | ok → tx `0x6addabe8006301a56aaf16cb4078cd904758f515f7fe660fe6cbe47294c87be2`, balance `45,330` shares |
| `POST …/market/swap` `{investorIndex:1}` | unverified investor | refused → `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`, plain explanation |
