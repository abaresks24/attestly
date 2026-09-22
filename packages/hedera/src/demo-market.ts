// End-to-end proof of the KYC-gated market (increment 03) against the deployed registry: issue ->
// attest -> confirmMint -> (lockup) -> createPair -> finalize (KYC to pair) -> add liquidity ->
// verified investor swaps -> unverified is refused -> guardian pause blocks trading -> unpause.
//
// Run: yarn workspace @sh/hedera exec tsx src/demo-market.ts
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { PrivateKey } from "@hiero-ledger/sdk";
import { requireOperator, testnetClient } from "./client.js";
import { contractIdFromEvm, mirrorGet } from "./mirror.js";
import { idToEvmAddress, sleep } from "./evm.js";
import { issueAsset, attestAndSign } from "./flows.js";
import { registryAs } from "./registry.js";
import { addLiquidity, createPair, enableInvestor, finalizeAsset, guardianSetPause, swapHbarForShares } from "./market.js";
import { registryEvmDefault, investorRegistryEvmDefault } from "./deployed.js";
import { explainError } from "./errors.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
loadEnv({ path: resolve(ROOT, ".env") });

const SHARES = 1_000_000;
const LIQUIDITY_SHARES = 500_000;
const LIQUIDITY_HBAR = 10;

function assert(c: boolean, m: string): asserts c {
  if (!c) throw new Error(`ASSERT FAILED: ${m}`);
}

async function main() {
  assert(existsSync(resolve(ROOT, ".demo-keys.json")), "run yarn seed:demo");
  const keys = JSON.parse(readFileSync(resolve(ROOT, ".demo-keys.json"), "utf8"));
  const op = requireOperator();
  const client = testnetClient(op);
  const registryEvm = registryEvmDefault();
  const registryId = await contractIdFromEvm(registryEvm);

  console.log("== Increment 03: KYC-gated market (testnet) ==");

  // 1. Issue + attest to quorum + confirmMint (reuses increment-02 flow).
  const issue = await issueAsset(client, {
    registryEvm,
    registryId,
    issuer: keys.issuer,
    attesters: keys.attesters,
    threshold: 2,
    decimals: 2,
    totalShares: SHARES,
    scheduleExpirySeconds: 24 * 3600,
    name: "Market Parcel",
    symbol: "ATTM",
    filename: "market.txt",
    document: "DEED: Market Parcel. Owner: Issuer Demo.",
  });
  console.log(`issued asset #${issue.assetId}, token ${issue.token}`);
  for (let i = 0; i < 2; i++) {
    await attestAndSign(client, {
      registryEvm,
      topicId: issue.topicId,
      schedule: issue.schedule,
      assetId: issue.assetId,
      attester: keys.attesters[i],
      approve: true,
      evidence: `report ${i}`,
      evidenceHash: "0x" + "0".repeat(64),
    });
  }
  await mirrorGet(`/tokens/${issue.token}`, { until: (d) => String(d?.total_supply) === String(SHARES) });
  const issuerRegistry = registryAs(registryEvm, keys.issuer.privateKey);
  await (await issuerRegistry.confirmMint(issue.assetId, { gasLimit: 300_000 })).wait();
  const asset = await issuerRegistry.getAsset(issue.assetId);
  const waitMs = (Number(asset.lockupEnds) - Math.floor(Date.now() / 1000) + 5) * 1000;
  console.log(`minted + confirmed; waiting ${Math.ceil(waitMs / 1000)}s for the lockup...`);
  if (waitMs > 0) await sleep(waitMs);

  // 2. Create the pair, finalize (registry grants KYC to the pair), add liquidity.
  const { pairEvm, pairId } = await createPair(keys.issuer.privateKey, issue.token);
  console.log(`pair ${pairId}`);
  await finalizeAsset(keys.issuer.privateKey, registryEvm, issue.assetId, pairEvm);
  console.log(`finalized: KYC granted to the pair`);
  await addLiquidity(client, {
    issuerId: keys.issuer.id,
    issuerEvm: keys.issuer.evmAddress,
    issuerDerKey: keys.issuer.privateKey,
    tokenId: issue.token,
    shareAmount: LIQUIDITY_SHARES,
    hbarAmount: LIQUIDITY_HBAR,
  });
  console.log(`liquidity added (${LIQUIDITY_SHARES} shares / ${LIQUIDITY_HBAR} HBAR)`);

  // 3. Verified investor: admin approves, enableAsset (gets KYC), swaps.
  const investor = keys.investors[0];
  await enableInvestor(client, {
    adminDerKey: op.key.toStringDer(), // InvestorRegistry admin = deployer (operator)
    investorRegistryEvm: investorRegistryEvmDefault(),
    investorId: investor.id,
    investorEvm: investor.evmAddress,
    investorDerKey: investor.privateKey,
    tokenId: issue.token,
    registryEvm,
    assetId: issue.assetId,
  });
  const before = Number((await mirrorGet(`/accounts/${investor.id}/tokens?token.id=${issue.token}`))?.tokens?.[0]?.balance ?? 0);
  await swapHbarForShares(investor.privateKey, issue.token, 1);
  const after = await mirrorGet(`/accounts/${investor.id}/tokens?token.id=${issue.token}`, {
    until: (d) => Number(d?.tokens?.[0]?.balance ?? 0) > before,
  });
  const gained = Number(after?.tokens?.[0]?.balance ?? 0) - before;
  assert(gained > 0, "verified investor did not receive shares");
  console.log(`verified investor swapped 1 HBAR -> ${gained} shares`);

  // 4. Guardian pause blocks trading; unpause restores.
  await guardianSetPause(client, {
    registryId,
    assetId: issue.assetId,
    guardianId: keys.guardian.id,
    memberKeys: [PrivateKey.fromStringECDSA(keys.guardianMembers[0].privateKey), PrivateKey.fromStringECDSA(keys.guardianMembers[1].privateKey)],
    pause: true,
  });
  await mirrorGet(`/tokens/${issue.token}`, { until: (d) => d?.pause_status === "PAUSED" });
  let pausedSwap = "SUCCEEDED_UNEXPECTEDLY";
  try {
    await swapHbarForShares(investor.privateKey, issue.token, 1);
  } catch (e: any) {
    pausedSwap = explainError(e?.shortMessage ?? e?.message ?? "reverted").message;
  }
  assert(pausedSwap !== "SUCCEEDED_UNEXPECTEDLY", "swap succeeded while paused");
  console.log(`while paused, swap refused: ${pausedSwap}`);

  await guardianSetPause(client, {
    registryId,
    assetId: issue.assetId,
    guardianId: keys.guardian.id,
    memberKeys: [PrivateKey.fromStringECDSA(keys.guardianMembers[1].privateKey), PrivateKey.fromStringECDSA(keys.guardianMembers[2].privateKey)],
    pause: false,
  });
  await mirrorGet(`/tokens/${issue.token}`, { until: (d) => d?.pause_status === "UNPAUSED" });
  console.log(`unpaused: trading restored`);

  console.log("\nIncrement 03 market PASS");
  console.log(JSON.stringify({ assetId: issue.assetId, token: issue.token, pair: pairId, investorGained: gained }));
  client.close();
}

main().catch((e) => {
  console.error("\nMarket FAIL:", e?.message ?? e);
  process.exit(1);
});
