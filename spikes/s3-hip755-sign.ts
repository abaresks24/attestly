// S3 — Signing a schedule from a plain EVM wallet (HIP-755).
//
// Question: can an attester add its signature to a scheduled mint using only an EVM wallet
// (MetaMask-style), with no native Hedera tooling?
//
// We simulate MetaMask with ethers: a Wallet built from the attester's ECDSA key sends a normal
// Ethereum transaction through the Hashio testnet relay, calling signSchedule() on the schedule's
// long-zero address (IHRC755ScheduleFacade, selector 0x06d15889). The EOA's own tx signature IS
// the schedule signature (HIP-755). PASS if the schedule executes from that ethers-only signature.
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
import { ethers } from "ethers";
import { loadOperator, testnetClient, link, TESTNET, entityLongZero } from "./lib/hedera.js";
import { loadKeystore, keyOf, idOf, type TestAccount } from "./lib/accounts.js";
import { mirrorGet, scheduleInfo, waitScheduleExecuted } from "./lib/mirror.js";

const TOTAL_SHARES = 1_000_000;
const SCHEDULE_FACADE_ABI = ["function signSchedule() external returns (int64 responseCode)"];

function need(store: Record<string, TestAccount>, name: string): TestAccount {
  const a = store[name];
  if (!a) throw new Error(`Missing '${name}' in .keys.json — run: yarn accounts`);
  return a;
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function main() {
  const op = loadOperator();
  const client = testnetClient(op);
  const store = loadKeystore();
  const issuer = need(store, "issuer");
  const attesters = [need(store, "attester1"), need(store, "attester2"), need(store, "attester3")];
  const attesterKeys = attesters.map(keyOf);

  console.log("== S3: HIP-755 signSchedule from an EVM wallet ==");

  // 1. Token with threshold supply key (2 of 3), no admin key.
  const supplyKey = KeyList.of(...attesterKeys.map((k) => k.publicKey));
  supplyKey.setThreshold(2);
  const tokenReceipt = await (
    await (
      await new TokenCreateTransaction()
        .setTokenName("Attested Share (S3)")
        .setTokenSymbol("ATTS3")
        .setTokenType(TokenType.FungibleCommon)
        .setSupplyType(TokenSupplyType.Finite)
        .setDecimals(2)
        .setInitialSupply(0)
        .setMaxSupply(TOTAL_SHARES)
        .setTreasuryAccountId(idOf(issuer))
        .setSupplyKey(supplyKey)
        .freezeWith(client)
        .sign(keyOf(issuer))
    ).execute(client)
  ).getReceipt(client);
  const token = tokenReceipt.tokenId!.toString();
  console.log(`token ${token}  ${link.token(token)}`);

  // 2. Schedule the mint (24h expiry).
  const expiry = new Timestamp(Math.floor(Date.now() / 1000) + 24 * 3600, 0);
  const scheduleReceipt = await (
    await new ScheduleCreateTransaction()
      .setScheduledTransaction(new TokenMintTransaction().setTokenId(token).setAmount(TOTAL_SHARES))
      .setExpirationTime(expiry)
      .setWaitForExpiry(false)
      .execute(client)
  ).getReceipt(client);
  const scheduleId = scheduleReceipt.scheduleId!.toString();
  console.log(`schedule ${scheduleId}  ${link.schedule(scheduleId)}`);

  // 3. First signature via the native SDK (attester1).
  await (
    await (
      await new ScheduleSignTransaction().setScheduleId(scheduleId).freezeWith(client)
    ).sign(attesterKeys[0])
  ).execute(client);
  let info = await scheduleInfo(scheduleId);
  assert(info?.executed_timestamp == null, "schedule executed after only the SDK signature");
  console.log("attester1 signed via SDK; schedule not yet executed");

  // 4. Second signature via ethers + Hashio ONLY (attester2), calling signSchedule() on the
  //    schedule's long-zero facade address. This is the MetaMask path.
  const provider = new ethers.JsonRpcProvider(TESTNET.hashio, TESTNET.chainId);
  const wallet = new ethers.Wallet("0x" + attesterKeys[1].toStringRaw(), provider);
  const facadeAddress = entityLongZero(scheduleId);
  console.log(`attester2 EVM wallet ${wallet.address} -> signSchedule() at ${facadeAddress}`);
  const facade = new ethers.Contract(facadeAddress, SCHEDULE_FACADE_ABI, wallet);
  const tx = await facade.signSchedule({ gasLimit: 800_000 });
  const rcpt = await tx.wait();
  console.log(`ethers tx ${rcpt?.hash} status=${rcpt?.status}`);

  // 5. Verify the schedule executed and shares were minted — from the ethers-only signature.
  info = await waitScheduleExecuted(scheduleId);
  assert(info?.executed_timestamp != null, "schedule did not execute after the ethers signature");
  const tInfo = await mirrorGet(`/tokens/${token}`, {
    until: (d) => String(d?.total_supply) === String(TOTAL_SHARES),
  });
  assert(String(tInfo?.total_supply) === String(TOTAL_SHARES), "supply not minted");
  console.log(`schedule executed at ${info.executed_timestamp}; totalSupply=${tInfo.total_supply}`);

  console.log("\nS3 PASS");
  console.log(JSON.stringify({ token, scheduleId, facadeAddress, ethersTx: rcpt?.hash }));
  client.close();
}

main().catch((e) => {
  console.error("\nS3 FAIL:", e?.message ?? e);
  process.exit(1);
});
