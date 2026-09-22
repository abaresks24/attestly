// The attester interface. Adding a new attester type (a registry oracle, a notary panel, an auditor)
// is a single file implementing {Attester}. The demo ships a manual one and a mock-registry one.
import { createHash } from "node:crypto";

export interface AssetForReview {
  assetId: string;
  cid: string;
  documentHash: string; // SHA-256 hex (0x-prefixed) of the IPFS document
  owner?: string; // claimed owner reference, checked by registry-style attesters
}

export interface Attestation {
  approve: boolean;
  evidenceHash: string; // SHA-256 hex (0x-prefixed) of the evidence, recorded on-chain and on HCS
  evidence: string; // human-readable reason
}

export interface Attester {
  readonly name: string;
  evaluate(asset: AssetForReview): Promise<Attestation> | Attestation;
}

/** Builds an {Attestation} from a decision and a reason, hashing the reason as the evidence. */
export function attestation(approve: boolean, evidence: string): Attestation {
  return { approve, evidence, evidenceHash: "0x" + createHash("sha256").update(evidence).digest("hex") };
}
