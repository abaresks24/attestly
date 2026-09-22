// Shared Hedera testnet constants and client helpers for the feasibility spikes.
// Sourced values are documented in ../findings.json.
import { Client, AccountId, PrivateKey } from "@hashgraph/sdk";
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "..", ".env") });

export const TESTNET = {
  mirror: "https://testnet.mirrornode.hedera.com/api/v1",
  hashio: "https://testnet.hashio.io/api",
  chainId: 296,
  hashscan: "https://hashscan.io/testnet",
} as const;

// System contract EVM addresses (findings.json > system_contracts).
export const HTS_ADDRESS = "0x0000000000000000000000000000000000000167";
export const HSS_ADDRESS = "0x000000000000000000000000000000000000016b";

// SaucerSwap V2 testnet (findings.json > saucerswap.v2_testnet). Hedera IDs.
export const SAUCERSWAP_V2 = {
  factory: "0.0.1197038",
  positionManager: "0.0.1308184",
  swapRouter: "0.0.1414040",
  quoter: "0.0.1390002",
  whbarContract: "0.0.15057",
  whbarToken: "0.0.15058",
  whbarHelper: "0.0.5286055",
} as const;

export interface Operator {
  id: AccountId;
  key: PrivateKey;
}

/** Reads OPERATOR_ID / OPERATOR_KEY from .env. Key type defaults to ECDSA (required for S3). */
export function loadOperator(): Operator {
  const id = process.env.OPERATOR_ID;
  const key = process.env.OPERATOR_KEY;
  if (!id || !key) {
    throw new Error(
      "Missing OPERATOR_ID / OPERATOR_KEY in spikes/.env. " +
        "Create a testnet ECDSA account at https://portal.hedera.com and fund it from the faucet.",
    );
  }
  const type = (process.env.OPERATOR_KEY_TYPE ?? "ECDSA").toUpperCase();
  const parsed =
    type === "ED25519" ? PrivateKey.fromStringED25519(key) : PrivateKey.fromStringECDSA(key);
  return { id: AccountId.fromString(id), key: parsed };
}

export function testnetClient(op: Operator): Client {
  // Testnet consensus nodes return BUSY under load; widen retries and backoff so
  // transient congestion doesn't fail a spike run.
  return Client.forTestnet()
    .setOperator(op.id, op.key)
    .setMaxAttempts(40)
    .setMinBackoff(500)
    .setMaxBackoff(8000);
}

export const link = {
  tx: (id: string) => `${TESTNET.hashscan}/tx/${id}`,
  token: (id: string) => `${TESTNET.hashscan}/token/${id}`,
  account: (id: string) => `${TESTNET.hashscan}/account/${id}`,
  schedule: (id: string) => `${TESTNET.hashscan}/schedule/${id}`,
  contract: (id: string) => `${TESTNET.hashscan}/contract/${id}`,
};

/** Hedera 0.0.N -> long-zero EVM address (for contract calls that take an address). */
export function idToEvmAddress(id: AccountId | string): string {
  const account = typeof id === "string" ? AccountId.fromString(id) : id;
  return "0x" + account.toSolidityAddress();
}

/** Any entity 0.0.N (schedule, token, contract) -> long-zero EVM address from its entity number. */
export function entityLongZero(id: string): string {
  const num = BigInt(id.split(".").pop()!);
  return "0x" + num.toString(16).padStart(40, "0");
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
