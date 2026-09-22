// ID <-> EVM address conversions and HashScan links.
import { AccountId } from "@hiero-ledger/sdk";
import { TESTNET } from "./constants.js";

/** Hedera 0.0.N -> long-zero EVM address (correct for tokens and non-alias accounts). */
export function idToEvmAddress(id: AccountId | string): string {
  const account = typeof id === "string" ? AccountId.fromString(id) : id;
  return "0x" + account.toSolidityAddress();
}

/** Any entity 0.0.N (schedule, token, contract) -> long-zero EVM address from its entity number. */
export function entityLongZero(id: string): string {
  const num = BigInt(id.split(".").pop() as string);
  return "0x" + num.toString(16).padStart(40, "0");
}

export const hashscan = {
  tx: (id: string) => `${TESTNET.hashscan}/tx/${id}`,
  token: (id: string) => `${TESTNET.hashscan}/token/${id}`,
  account: (id: string) => `${TESTNET.hashscan}/account/${id}`,
  schedule: (id: string) => `${TESTNET.hashscan}/schedule/${id}`,
  contract: (id: string) => `${TESTNET.hashscan}/contract/${id}`,
};

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
