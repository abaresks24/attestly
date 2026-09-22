// Tops up test accounts from the operator (SaucerSwap ops burn HBAR on fees + gas).
import { TransferTransaction, Hbar } from "@hashgraph/sdk";
import { loadOperator, testnetClient } from "./lib/hedera.js";
import { loadKeystore, idOf } from "./lib/accounts.js";
import { accountHbarBalance } from "./lib/mirror.js";

// name -> target HBAR floor
const TARGETS: Record<string, number> = { issuer: 120, investor: 40, outsider: 40 };

async function main() {
  const op = loadOperator();
  const client = testnetClient(op);
  const store = loadKeystore();
  for (const [name, target] of Object.entries(TARGETS)) {
    const acct = store[name];
    if (!acct) continue;
    const bal = await accountHbarBalance(acct.id);
    const top = Math.ceil(target - bal);
    if (top <= 0) {
      console.log(`${name} ${bal} HBAR (ok)`);
      continue;
    }
    await (
      await new TransferTransaction()
        .addHbarTransfer(op.id, new Hbar(-top))
        .addHbarTransfer(idOf(acct), new Hbar(top))
        .execute(client)
    ).getReceipt(client);
    console.log(`${name} ${bal} -> ~${target} HBAR (+${top})`);
  }
  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
