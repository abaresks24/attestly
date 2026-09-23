import { type DemoActor, contractIdFromEvm, requireOperator, testnetClient } from "@sh/hedera";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import "server-only";
import deployedContracts from "~~/contracts/deployedContracts";

// Demo actors and per-asset issuance state live at the repo root (both gitignored).
const ROOT = resolve(process.cwd(), "..", "..");
const KEYSTORE = resolve(ROOT, ".demo-keys.json");
const STATE = resolve(ROOT, ".demo-state.json");

export interface DemoKeys {
  issuer: DemoActor;
  attesters: DemoActor[];
  guardianMembers: DemoActor[];
  guardian: { id: string; evmAddress: string; threshold: number; members: DemoActor[] };
  investors: DemoActor[];
}

export function demoConfigured(): boolean {
  return existsSync(KEYSTORE);
}

export function demoKeys(): DemoKeys {
  if (!existsSync(KEYSTORE)) throw new Error("Demo not seeded — run `yarn seed:demo`.");
  return JSON.parse(readFileSync(KEYSTORE, "utf8")) as DemoKeys;
}

export const registryEvm = (): string => deployedContracts[296].AssetRegistry.address;
export const investorRegistryEvm = (): string => deployedContracts[296].InvestorRegistry.address;

let cachedRegistryId: string | null = null;
export async function registryId(): Promise<string> {
  if (!cachedRegistryId) cachedRegistryId = await contractIdFromEvm(registryEvm());
  return cachedRegistryId;
}

export const serverClient = () => testnetClient(requireOperator());

// Per-asset off-chain state the contract doesn't keep (the scheduled-mint id and HCS topic).
export interface AssetState {
  topicId: string;
  schedule: string;
  token: string;
  pair?: string; // V1 pair id (0.0.N), set at finalize
}
type StateFile = Record<string, AssetState>;

export function loadState(): StateFile {
  return existsSync(STATE) ? (JSON.parse(readFileSync(STATE, "utf8")) as StateFile) : {};
}
export function saveAssetState(assetId: number, state: AssetState) {
  const all = loadState();
  all[assetId] = state;
  writeFileSync(STATE, JSON.stringify(all, null, 2));
}
/**
 * Records the resolved pair id for an asset. Upserts: the pair is created and KYC-granted on-chain
 * before this runs, so a missing/lost local state entry must not turn a successful finalize into a
 * permanent 500. The GET route can always re-resolve the pair from the factory anyway.
 */
export function setAssetPair(assetId: number, pair: string) {
  const all = loadState();
  const existing = all[assetId] ?? { topicId: "", schedule: "", token: "" };
  all[assetId] = { ...existing, pair };
  writeFileSync(STATE, JSON.stringify(all, null, 2));
}
