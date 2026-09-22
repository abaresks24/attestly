// End-to-end proof of the quorum-gated issuance flow (increment 02) against the deployed
// AssetRegistry on testnet. Contract calls that need a specific msg.sender (issuer, attesters) go
// through ethers/Hashio wallets; native ops (token create, HCS, scheduled mint) go through the SDK.
//
// Run: yarn workspace @sh/hedera exec tsx src/demo-issue.ts
// Requires .demo-keys.json (yarn seed:demo) and a deployed AssetRegistry (yarn deploy:testnet).
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { ethers } from "ethers";
import { AccountId, PrivateKey } from "@hiero-ledger/sdk";
import { requireOperator, testnetClient } from "./client.js";
import { createAssetToken, createTopic, logToTopic, scheduleMint, signSchedule } from "./issuance.js";
import { verifyThresholdKey } from "./keys.js";
import { idToEvmAddress, hashscan } from "./evm.js";
import { mirrorGet, tokenInfo, scheduleInfo } from "./mirror.js";
import { TESTNET } from "./constants.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
loadEnv({ path: resolve(ROOT, ".env") });

// Deployed on testnet (see docs/TESTNET_VERIFICATION.md). Override via env for a fresh deploy.
const REGISTRY_EVM = process.env.ASSET_REGISTRY_EVM ?? "0x3F536A2a22fF1D99F6b08b72FE4A9aDE8DC07652";
const REGISTRY_ID = process.env.ASSET_REGISTRY_ID ?? "0.0.10671319";

const REGISTRY_ABI = [
  "function submitAsset(string cid, bytes32 documentHash, uint64 shares, uint64 topicId) returns (uint256)",
  "function registerToken(uint256 assetId, address token)",
  "function attest(uint256 assetId, bool approve, bytes32 evidenceHash)",
  "function confirmMint(uint256 assetId)",
  "function getAsset(uint256 assetId) view returns (tuple(address issuer,address token,bytes32 documentHash,string cid,uint64 shares,uint64 topicId,uint64 lockupEnds,uint8 status))",
  "event AssetSubmitted(uint256 indexed assetId, address indexed issuer, string cid, bytes32 documentHash, uint64 shares, uint64 topicId)",
];

const TOTAL_SHARES = 1_000_000;
const DECIMALS = 2;
const SCHEDULE_EXPIRY = 24 * 3600;

interface DemoAccount {
  id: string;
  evmAddress: string;
  privateKey: string;
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function main() {
  const keystore = resolve(ROOT, ".demo-keys.json");
  assert(existsSync(keystore), "no .demo-keys.json — run yarn seed:demo");
  const keys = JSON.parse(readFileSync(keystore, "utf8"));
  const issuer: DemoAccount = keys.issuer;
  const attesters: DemoAccount[] = keys.attesters;

  const op = requireOperator();
  const client = testnetClient(op);
  const provider = new ethers.JsonRpcProvider(TESTNET.jsonRpc, TESTNET.chainId);
  const wallet = (a: DemoAccount) => new ethers.Wallet("0x" + PrivateKey.fromStringECDSA(a.privateKey).toStringRaw(), provider);
  const registryAs = (a: DemoAccount) => new ethers.Contract(REGISTRY_EVM, REGISTRY_ABI, wallet(a));

  console.log("== Increment 02: quorum-gated issuance (testnet) ==");

  // 1. HCS topic for the asset's audit trail.
  const topicId = await createTopic(client, "Attested RWA demo asset");
  console.log(`HCS topic ${topicId}  ${hashscan.account(topicId)}`);

  // 2. Sample document -> SHA-256 + a demo CID (IPFS pinning is wired separately).
  const document = "DEED: Parcel 12, Demo Registry. Owner: Issuer Demo. 1,000,000 shares.";
  const sha256 = "0x" + createHash("sha256").update(document).digest("hex");
  const cid = "bafkreidemoattestedrwaparcel12";

  // 3. submitAsset (issuer) + log the submission to HCS (must contain CID and SHA-256).
  const submitTx = await (await registryAs(issuer).submitAsset(cid, sha256, TOTAL_SHARES, BigInt(topicId.split(".").pop()!), { gasLimit: 600_000 })).wait();
  const submitted = submitTx!.logs
    .map((l: any) => {
      try {
        return registryAs(issuer).interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((p: any) => p?.name === "AssetSubmitted");
  const assetId = submitted!.args.assetId as bigint;
  await logToTopic(client, topicId, JSON.stringify({ event: "submitted", assetId: assetId.toString(), cid, sha256 }));
  console.log(`asset #${assetId} submitted; HCS logged (cid + sha256)`);

  // 4. Create the token with the exact key set (supply ThresholdKey 2/3, KYC+pause = registry, no admin).
  const attesterPubKeys = attesters.map((a) => PrivateKey.fromStringECDSA(a.privateKey).publicKey);
  const token = await createAssetToken(client, {
    name: "Attested Share",
    symbol: "ATTD",
    decimals: DECIMALS,
    maxSupply: TOTAL_SHARES,
    treasury: AccountId.fromString(issuer.id),
    treasuryKey: PrivateKey.fromStringECDSA(issuer.privateKey),
    attesterKeys: attesterPubKeys,
    threshold: 2,
    registryContractId: REGISTRY_ID,
  });
  console.log(`token ${token}  ${hashscan.token(token)}`);

  // 5. Verify the on-chain key set BEFORE registering (FR-2 invariant).
  const info = await tokenInfo(token);
  const supplyCheck = verifyThresholdKey(info.supply_key, 2, attesterPubKeys);
  assert(supplyCheck.ok, `supply key mismatch: ${supplyCheck.reasons.join("; ")}`);
  assert(info.admin_key == null, "admin key present (must be absent)");
  const kycIsContract = info.kyc_key?._type === "ProtobufEncoded" || info.kyc_key?.key === REGISTRY_ID;
  assert(info.kyc_key != null && info.pause_key != null, "KYC/pause key missing");
  console.log(`key set verified: ThresholdKey(2/3), no admin key, KYC+pause present (contract) [${kycIsContract ? "contract" : "?"}]`);

  // Negative: the same verifier REFUSES a mismatched expectation, so the app would refuse registerToken.
  const wrongCheck = verifyThresholdKey(info.supply_key, 3, attesterPubKeys);
  assert(!wrongCheck.ok, "verifier should reject a mismatched key set");
  console.log(`mismatch guard works: a wrong expected key set is refused (${wrongCheck.reasons[0]})`);

  // 6. registerToken (issuer) — only reached because verification passed.
  await (await registryAs(issuer).registerToken(assetId, idToEvmAddress(token), { gasLimit: 300_000 })).wait();
  console.log(`token registered on-chain for asset #${assetId}`);

  // 7. Attestations (2 of 3) on-chain + HCS.
  for (let i = 0; i < 2; i++) {
    const evidence = "0x" + createHash("sha256").update(`report-${i}`).digest("hex");
    await (await registryAs(attesters[i]).attest(assetId, true, evidence, { gasLimit: 300_000 })).wait();
    await logToTopic(client, topicId, JSON.stringify({ event: "attested", attester: attesters[i].id, approve: true, evidence }));
    console.log(`attester ${i + 1} (${attesters[i].id}) attested + HCS logged`);
  }

  // 8. Scheduled mint: not executed at 1 signature, executes at the 2nd.
  const schedule = await scheduleMint(client, token, TOTAL_SHARES, SCHEDULE_EXPIRY);
  console.log(`schedule ${schedule}  ${hashscan.schedule(schedule)}`);
  await signSchedule(client, schedule, PrivateKey.fromStringECDSA(attesters[0].privateKey));
  let s = await scheduleInfo(schedule);
  let t = await tokenInfo(token);
  assert(s?.executed_timestamp == null && String(t?.total_supply) === "0", "minted after only 1 signature");
  console.log(`after 1 signature: not executed, supply 0`);

  await signSchedule(client, schedule, PrivateKey.fromStringECDSA(attesters[1].privateKey));
  s = await mirrorGet(`/schedules/${schedule}`, { until: (d) => d?.executed_timestamp != null });
  t = await mirrorGet(`/tokens/${token}`, { until: (d) => String(d?.total_supply) === String(TOTAL_SHARES) });
  assert(s?.executed_timestamp != null && String(t?.total_supply) === String(TOTAL_SHARES), "mint did not execute at quorum");
  console.log(`after 2 signatures: executed, total_supply=${t.total_supply} to issuer treasury`);

  // 9. confirmMint (issuer) starts the lockup.
  await (await registryAs(issuer).confirmMint(assetId, { gasLimit: 300_000 })).wait();
  const asset = await registryAs(issuer).getAsset(assetId);
  assert(Number(asset.status) === 3, "status should be Minted");
  assert(Number(asset.lockupEnds) > Math.floor(Date.now() / 1000), "lockup should be in the future");
  console.log(`confirmMint: status=Minted, lockup ends at ${new Date(Number(asset.lockupEnds) * 1000).toISOString()}`);

  console.log("\nIncrement 02 issuance PASS");
  console.log(JSON.stringify({ topicId, assetId: assetId.toString(), token, schedule }));
  client.close();
}

main().catch((e) => {
  console.error("\nIssuance FAIL:", e?.message ?? e);
  process.exit(1);
});
