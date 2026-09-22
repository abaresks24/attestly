// `yarn seed:demo` — creates the testnet actors the demo acts as: issuer, attesters, guardian
// members + a native ThresholdKey(2 of 3) guardian account, and investors. Keys are written to a
// gitignored .demo-keys.json at the repo root. Idempotent: existing accounts are kept.
//
// Counts mirror packages/hardhat/config/rwa.ts (attesters 3, threshold 2, guardian 2 of 3).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { requireOperator, testnetClient } from "./client.js";
import { createEcdsaAccount, createThresholdAccount, type DemoAccount, type GuardianAccount } from "./accounts.js";
import { accountHbarBalance } from "./mirror.js";
import { hashscan } from "./evm.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const KEYSTORE = resolve(ROOT, ".demo-keys.json");
loadEnv({ path: resolve(ROOT, ".env") });
loadEnv({ path: resolve(ROOT, "packages/hardhat/.env") });

interface Keystore {
  issuer?: DemoAccount;
  attesters?: DemoAccount[];
  guardianMembers?: DemoAccount[];
  guardian?: GuardianAccount;
  investors?: DemoAccount[];
}

const FUNDING = { issuer: 60, attester: 10, guardianMember: 10, guardian: 20, investor: 40 };

function load(): Keystore {
  return existsSync(KEYSTORE) ? (JSON.parse(readFileSync(KEYSTORE, "utf8")) as Keystore) : {};
}
function save(store: Keystore) {
  writeFileSync(KEYSTORE, JSON.stringify(store, null, 2));
}

async function main() {
  const op = requireOperator();
  const client = testnetClient(op);

  const hbar = await accountHbarBalance(op.id.toString());
  console.log(`Operator ${op.id.toString()}  ${hbar} HBAR`);
  if (hbar < 100) throw new Error(`Operator balance ${hbar} HBAR is below the 100 HBAR the seed needs. Top up from the faucet.`);

  const store = load();

  if (!store.issuer) {
    store.issuer = await createEcdsaAccount(client, FUNDING.issuer);
    save(store);
    console.log(`issuer            ${store.issuer.id}`);
  }
  store.attesters ??= [];
  while (store.attesters.length < 3) {
    const a = await createEcdsaAccount(client, FUNDING.attester);
    store.attesters.push(a);
    save(store);
    console.log(`attester ${store.attesters.length}         ${a.id}`);
  }
  store.guardianMembers ??= [];
  while (store.guardianMembers.length < 3) {
    const m = await createEcdsaAccount(client, FUNDING.guardianMember);
    store.guardianMembers.push(m);
    save(store);
    console.log(`guardian member ${store.guardianMembers.length}  ${m.id}`);
  }
  if (!store.guardian) {
    store.guardian = await createThresholdAccount(client, store.guardianMembers, 2, FUNDING.guardian);
    save(store);
    console.log(`guardian (2 of 3) ${store.guardian.id}  ${hashscan.account(store.guardian.id)}`);
  }
  store.investors ??= [];
  while (store.investors.length < 2) {
    const inv = await createEcdsaAccount(client, FUNDING.investor);
    store.investors.push(inv);
    save(store);
    console.log(`investor ${store.investors.length}        ${inv.id}`);
  }

  const guardianHbar = await accountHbarBalance(store.guardian.id);
  console.log(`\nDemo actors ready in .demo-keys.json (gitignored).`);
  console.log(`Guardian ${store.guardian.id} funded with ${guardianHbar} HBAR; ThresholdKey(2 of 3).`);
  console.log(`Verify the threshold key: ${hashscan.account(store.guardian.id)}`);
  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
