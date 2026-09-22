// Test-account creation and a JSON keystore reused across spikes (spikes/.keys.json).
// Accounts are ECDSA secp256k1 (required for S3/HIP-755), created with an EVM alias
// and unlimited automatic token associations so spikes don't associate manually.
import { AccountCreateTransaction, AccountId, Hbar, PrivateKey, type Client } from "@hashgraph/sdk";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { link } from "./hedera.js";

const KEYSTORE = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".keys.json");

export interface TestAccount {
  id: string;
  evmAddress: string;
  privateKey: string; // ECDSA DER hex
}

export type Keystore = Record<string, TestAccount>;

export function loadKeystore(): Keystore {
  return existsSync(KEYSTORE) ? JSON.parse(readFileSync(KEYSTORE, "utf8")) : {};
}

export function saveKeystore(store: Keystore): void {
  writeFileSync(KEYSTORE, JSON.stringify(store, null, 2));
}

/** Creates a funded ECDSA account with an EVM alias and unlimited auto-associations. */
export async function createEcdsaAccount(
  client: Client,
  balanceHbar: number,
): Promise<TestAccount> {
  const key = PrivateKey.generateECDSA();
  const receipt = await (
    await new AccountCreateTransaction()
      .setECDSAKeyWithAlias(key)
      .setInitialBalance(new Hbar(balanceHbar))
      .setMaxAutomaticTokenAssociations(-1)
      .execute(client)
  ).getReceipt(client);
  const id = receipt.accountId!;
  return {
    id: id.toString(),
    evmAddress: "0x" + key.publicKey.toEvmAddress(),
    privateKey: key.toStringDer(),
  };
}

/** Returns the named account from the keystore, creating and persisting it if absent. */
export async function ensureAccount(
  client: Client,
  store: Keystore,
  name: string,
  balanceHbar: number,
): Promise<TestAccount> {
  if (store[name]) return store[name];
  const account = await createEcdsaAccount(client, balanceHbar);
  store[name] = account;
  saveKeystore(store);
  console.log(`  + ${name.padEnd(10)} ${account.id}  ${link.account(account.id)}`);
  return account;
}

export const keyOf = (account: TestAccount): PrivateKey =>
  PrivateKey.fromStringECDSA(account.privateKey);

export const idOf = (account: TestAccount): AccountId => AccountId.fromString(account.id);
