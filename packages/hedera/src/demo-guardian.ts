// Proves the guardian emergency stop (increment 03 acceptance #5): a pause signed by 1 of 3 members
// fails; signed by 2 of 3 succeeds; unpause restores. Runs against the deployed registry and an
// existing asset whose pause key is the registry.
//
// Run: yarn workspace @sh/hedera exec tsx src/demo-guardian.ts <assetId> <tokenId>
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { PrivateKey } from "@hiero-ledger/sdk";
import { requireOperator, testnetClient } from "./client.js";
import { contractIdFromEvm, mirrorGet } from "./mirror.js";
import { guardianSetPause } from "./market.js";
import { registryEvmDefault } from "./deployed.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
loadEnv({ path: resolve(ROOT, ".env") });

const assetId = Number(process.argv[2] ?? "1");
const tokenId = process.argv[3] ?? "0.0.10671876";

function assert(c: boolean, m: string): asserts c {
  if (!c) throw new Error(`ASSERT FAILED: ${m}`);
}

async function main() {
  assert(existsSync(resolve(ROOT, ".demo-keys.json")), "run yarn seed:demo");
  const keys = JSON.parse(readFileSync(resolve(ROOT, ".demo-keys.json"), "utf8"));
  const members = keys.guardianMembers.map((m: any) => PrivateKey.fromStringECDSA(m.privateKey));
  const guardianId = keys.guardian.id;

  const op = requireOperator();
  const client = testnetClient(op);
  const registryId = await contractIdFromEvm(registryEvmDefault());
  console.log(`== Guardian emergency stop (asset #${assetId}, token ${tokenId}, guardian ${guardianId}) ==`);

  // 1 signature: must fail (threshold is 2).
  let oneSigResult = "SUCCEEDED_UNEXPECTEDLY";
  try {
    await guardianSetPause(client, { registryId, assetId, guardianId, memberKeys: [members[0]], pause: true });
  } catch (e: any) {
    oneSigResult = e?.status?.toString() ?? e?.message ?? "FAILED";
  }
  assert(oneSigResult !== "SUCCEEDED_UNEXPECTEDLY", "pause with 1 signature unexpectedly succeeded");
  console.log(`pause with 1 signature refused: ${oneSigResult}`);

  // 2 signatures: must succeed and pause the token.
  await guardianSetPause(client, { registryId, assetId, guardianId, memberKeys: [members[0], members[1]], pause: true });
  const paused = await mirrorGet(`/tokens/${tokenId}`, { until: (d) => d?.pause_status === "PAUSED" });
  assert(paused?.pause_status === "PAUSED", "token not paused after 2 signatures");
  console.log(`pause with 2 signatures succeeded: pause_status=PAUSED`);

  // Unpause with 2 signatures restores trading.
  await guardianSetPause(client, { registryId, assetId, guardianId, memberKeys: [members[1], members[2]], pause: false });
  const unpaused = await mirrorGet(`/tokens/${tokenId}`, { until: (d) => d?.pause_status === "UNPAUSED" });
  assert(unpaused?.pause_status === "UNPAUSED", "token not unpaused");
  console.log(`unpause with 2 signatures succeeded: pause_status=UNPAUSED`);

  console.log("\nGuardian threshold pause PASS");
  client.close();
}

main().catch((e) => {
  console.error("\nGuardian FAIL:", e?.message ?? e);
  process.exit(1);
});
