// Creates (once) and reports the shared testnet actors used by every spike.
// Keys are ECDSA secp256k1 (required for S3/HIP-755), persisted to spikes/.keys.json (gitignored).
import { AccountBalanceQuery } from "@hashgraph/sdk";
import { loadOperator, testnetClient, link } from "./lib/hedera.js";
import { ensureAccount, loadKeystore } from "./lib/accounts.js";

// Modest funding; issuer and investor pay for pool creation / liquidity / swaps in S1.
const FUNDING: Record<string, number> = {
  issuer: 60,
  attester1: 10,
  attester2: 10,
  attester3: 10,
  investor: 60,
  outsider: 10,
};

async function main() {
  const op = loadOperator();
  const client = testnetClient(op);
  const store = loadKeystore();

  const balance = await new AccountBalanceQuery().setAccountId(op.id).execute(client);
  const hbar = balance.hbars.toBigNumber().toNumber();
  console.log(`Operator ${op.id.toString()}  ${hbar} HBAR  ${link.account(op.id.toString())}`);
  if (hbar < 50) {
    throw new Error(`Operator balance ${hbar} HBAR is below the 50 HBAR floor. Top up from the faucet.`);
  }
  console.log("Ensuring test accounts (ECDSA, EVM alias, unlimited auto-association):");

  for (const [name, hbar] of Object.entries(FUNDING)) {
    await ensureAccount(client, store, name, hbar);
  }

  console.log("\nKeystore ready at spikes/.keys.json");
  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
