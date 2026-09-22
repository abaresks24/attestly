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

## Increment 03 — Market

_(pending: pool creation, swap, pause, unpause)_
