// S2 — Threshold supply key + scheduled mint signed one attester at a time.
//
// Question: does the network refuse to mint until the attester quorum has signed, and does it
// execute the mint automatically at the k-th signature?
//
// Token: fungible, finite supply, 2 decimals; treasury = issuer; supply key = ThresholdKey(2 of 3)
// of the attester public keys; NO admin key. KYC/pause key = operator here (S4 tests the contract form).
// PASS if steps 3-5 are verified on the mirror node.
import {
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TokenMintTransaction,
  ScheduleCreateTransaction,
  ScheduleSignTransaction,
  KeyList,
  Timestamp,
  type Client,
} from "@hashgraph/sdk";
import { loadOperator, testnetClient, link } from "./lib/hedera.js";
import { loadKeystore, keyOf, idOf, type TestAccount } from "./lib/accounts.js";
import { tokenInfo, scheduleInfo, waitScheduleExecuted, mirrorGet } from "./lib/mirror.js";
import { verifyThresholdKey } from "./lib/keys.js";

const TOTAL_SHARES = 1_000_000; // raw units (2 decimals => 10,000.00 display)
const SCHEDULE_EXPIRY_HOURS = 24;

function need(store: Record<string, TestAccount>, name: string): TestAccount {
  const a = store[name];
  if (!a) throw new Error(`Missing '${name}' in .keys.json — run: yarn accounts`);
  return a;
}

async function createThresholdToken(
  client: Client,
  issuer: TestAccount,
  attesterKeys: ReturnType<typeof keyOf>[],
  threshold: number,
  operatorKey: ReturnType<typeof keyOf>,
): Promise<string> {
  const supplyKey = KeyList.of(...attesterKeys.map((k) => k.publicKey));
  supplyKey.setThreshold(threshold);

  const tx = await new TokenCreateTransaction()
    .setTokenName("Attested Share (S2)")
    .setTokenSymbol("ATTS2")
    .setTokenType(TokenType.FungibleCommon)
    .setSupplyType(TokenSupplyType.Finite)
    .setDecimals(2)
    .setInitialSupply(0)
    .setMaxSupply(TOTAL_SHARES)
    .setTreasuryAccountId(idOf(issuer))
    // Supply key is the attester quorum; no admin key => immutable key set.
    .setSupplyKey(supplyKey)
    .setKycKey(operatorKey.publicKey)
    .setPauseKey(operatorKey.publicKey)
    .freezeWith(client);

  // Treasury (issuer) must sign token creation; operator (payer) signs on execute.
  const receipt = await (await (await tx.sign(keyOf(issuer))).execute(client)).getReceipt(client);
  return receipt.tokenId!.toString();
}

async function main() {
  const op = loadOperator();
  const client = testnetClient(op);
  const store = loadKeystore();

  const issuer = need(store, "issuer");
  const attesters = [need(store, "attester1"), need(store, "attester2"), need(store, "attester3")];
  const attesterKeys = attesters.map(keyOf);

  console.log("== S2: threshold supply key + scheduled mint ==");

  // 1. Create the token.
  const tokenId = await createThresholdToken(client, issuer, attesterKeys, 2, op.key);
  console.log(`token ${tokenId}  ${link.token(tokenId)}`);

  // 2. Schedule the mint with a long-term (24h) expiry, wait_for_expiry = false.
  const expiry = new Timestamp(Math.floor(Date.now() / 1000) + SCHEDULE_EXPIRY_HOURS * 3600, 0);
  const mintTx = new TokenMintTransaction().setTokenId(tokenId).setAmount(TOTAL_SHARES);
  const scheduleReceipt = await (
    await new ScheduleCreateTransaction()
      .setScheduledTransaction(mintTx)
      .setExpirationTime(expiry)
      .setWaitForExpiry(false)
      .setScheduleMemo("S2 attested mint")
      .execute(client)
  ).getReceipt(client);
  const scheduleId = scheduleReceipt.scheduleId!.toString();
  console.log(`schedule ${scheduleId}  ${link.schedule(scheduleId)} (24h expiry accepted)`);

  // 3. First attester signs — must NOT execute yet.
  await signWith(client, scheduleId, attesters[0]);
  let sInfo = await scheduleInfo(scheduleId);
  let tInfo = await tokenInfo(tokenId);
  console.log(
    `after 1 sig: executed=${sInfo?.executed_timestamp ?? "null"} totalSupply=${tInfo?.total_supply}`,
  );
  assert(sInfo?.executed_timestamp == null, "schedule executed after only 1 signature");
  assert(String(tInfo?.total_supply) === "0", "supply minted after only 1 signature");

  // 4. Second attester signs — quorum reached, network mints automatically.
  await signWith(client, scheduleId, attesters[1]);
  sInfo = await waitScheduleExecuted(scheduleId);
  tInfo = await mirrorGet(`/tokens/${tokenId}`, {
    until: (d) => String(d?.total_supply) === String(TOTAL_SHARES),
  });
  console.log(
    `after 2 sig: executed=${sInfo?.executed_timestamp ?? "null"} totalSupply=${tInfo?.total_supply}`,
  );
  assert(sInfo?.executed_timestamp != null, "schedule did not execute at quorum");
  assert(String(tInfo?.total_supply) === String(TOTAL_SHARES), "total supply != TOTAL_SHARES");
  assert(tInfo?.treasury_account_id === issuer.id, "supply not held by issuer treasury");

  // 5. Verify the on-chain key set: threshold 2 of the 3 attester keys, no admin key.
  const thresholdCheck = verifyThresholdKey(
    tInfo.supply_key,
    2,
    attesterKeys.map((k) => k.publicKey),
  );
  assert(thresholdCheck.ok, `supply key mismatch: ${thresholdCheck.reasons.join("; ")}`);
  assert(tInfo.admin_key == null, "admin key is present (must be absent)");
  console.log("supply key verified: ThresholdKey(2 of 3 attesters); no admin key");

  console.log("\nS2 PASS");
  client.close();
}

async function signWith(client: Client, scheduleId: string, attester: TestAccount) {
  await (
    await (await new ScheduleSignTransaction().setScheduleId(scheduleId).freezeWith(client)).sign(
      keyOf(attester),
    )
  ).execute(client);
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

main().catch((e) => {
  console.error("\nS2 FAIL:", e.message ?? e);
  process.exit(1);
});
