// Testnet SDK client + operator loading. Resilient to the BUSY / timeout responses testnet
// consensus nodes return under load (see spikes/REPORT.md).
import { AccountId, Client, PrivateKey } from "@hiero-ledger/sdk";

export interface Operator {
  id: AccountId;
  key: PrivateKey;
}

/** Reads OPERATOR_ID / OPERATOR_KEY from the environment. Returns null if unset (app still boots). */
export function loadOperator(): Operator | null {
  const id = process.env.OPERATOR_ID;
  const key = process.env.OPERATOR_KEY;
  if (!id || !key) return null;
  const type = (process.env.OPERATOR_KEY_TYPE ?? "ECDSA").toUpperCase();
  const parsed = type === "ED25519" ? PrivateKey.fromStringED25519(key) : PrivateKey.fromStringECDSA(key);
  return { id: AccountId.fromString(id), key: parsed };
}

/** Like {loadOperator} but throws a clear message when the operator is missing. */
export function requireOperator(): Operator {
  const op = loadOperator();
  if (!op) {
    throw new Error(
      "Missing OPERATOR_ID / OPERATOR_KEY. Create a funded testnet account at https://portal.hedera.com " +
        "and copy .env.example to your package env file.",
    );
  }
  return op;
}

export function testnetClient(op: Operator): Client {
  return Client.forTestnet()
    .setOperator(op.id, op.key)
    .setMaxAttempts(40)
    .setMinBackoff(500)
    .setMaxBackoff(8000);
}
