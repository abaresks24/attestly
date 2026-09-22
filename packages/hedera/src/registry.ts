// Reads and writes the AssetRegistry through ethers/Hashio. Reads use a plain provider; writes use a
// wallet built from a demo actor's key so msg.sender is that actor's alias (issuer, attester).
import { ethers } from "ethers";
import { PrivateKey } from "@hiero-ledger/sdk";
import { TESTNET } from "./constants.js";

export const REGISTRY_ABI = [
  "function submitAsset(string cid, bytes32 documentHash, uint64 shares, uint64 topicId) returns (uint256)",
  "function registerToken(uint256 assetId, address token)",
  "function attest(uint256 assetId, bool approve, bytes32 evidenceHash)",
  "function confirmMint(uint256 assetId)",
  "function finalize(uint256 assetId, address pair)",
  "function enableAsset(uint256 assetId)",
  "function pause(uint256 assetId)",
  "function unpause(uint256 assetId)",
  "function assetCount() view returns (uint256)",
  "function getAsset(uint256 assetId) view returns (tuple(address issuer,address token,bytes32 documentHash,string cid,uint64 shares,uint64 topicId,uint64 lockupEnds,uint8 status))",
  "event AssetSubmitted(uint256 indexed assetId, address indexed issuer, string cid, bytes32 documentHash, uint64 shares, uint64 topicId)",
  "event Attested(uint256 indexed assetId, address indexed attester, bool approve, bytes32 evidenceHash)",
];

export const STATUS = ["None", "Submitted", "Registered", "Minted", "Finalized"] as const;
export type StatusName = (typeof STATUS)[number];

export interface AssetView {
  assetId: number;
  issuer: string;
  token: string; // 0x0 until registered
  documentHash: string;
  cid: string;
  shares: string;
  topicId: string; // 0.0.N or "" if none
  lockupEnds: number;
  status: StatusName;
}

export function provider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(TESTNET.jsonRpc, TESTNET.chainId);
}

export function registryRead(evmAddress: string): ethers.Contract {
  return new ethers.Contract(evmAddress, REGISTRY_ABI, provider());
}

export function registryAs(evmAddress: string, ecdsaDerKey: string): ethers.Contract {
  const wallet = new ethers.Wallet("0x" + PrivateKey.fromStringECDSA(ecdsaDerKey).toStringRaw(), provider());
  return new ethers.Contract(evmAddress, REGISTRY_ABI, wallet);
}

const ZERO = "0x0000000000000000000000000000000000000000";

function toView(assetId: number, a: any): AssetView {
  const topicNum = a.topicId?.toString?.() ?? "0";
  return {
    assetId,
    issuer: a.issuer,
    token: a.token,
    documentHash: a.documentHash,
    cid: a.cid,
    shares: a.shares.toString(),
    topicId: topicNum === "0" ? "" : `0.0.${topicNum}`,
    lockupEnds: Number(a.lockupEnds),
    status: STATUS[Number(a.status)] ?? "None",
  };
}

/** Lists all assets (newest first). Returns [] if the contract has none or is unreachable. */
export async function listAssets(evmAddress: string): Promise<AssetView[]> {
  const c = registryRead(evmAddress);
  const count = Number(await c.assetCount());
  const views: AssetView[] = [];
  for (let i = count - 1; i >= 0; i--) views.push(toView(i, await c.getAsset(i)));
  return views;
}

export async function getAssetView(evmAddress: string, assetId: number): Promise<AssetView | null> {
  const c = registryRead(evmAddress);
  if (assetId >= Number(await c.assetCount())) return null;
  return toView(assetId, await c.getAsset(assetId));
}

export const isRegistered = (token: string) => token !== ZERO;
