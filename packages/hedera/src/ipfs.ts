// Stores the attested document. With IPFS_PINNING_JWT set, it pins to a provider (Pinata-compatible
// endpoint); without it, the demo computes a deterministic local id and keeps the file under
// mock-registry/uploads, clearly labeled as demo storage. Either way it returns the CID and SHA-256.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const UPLOADS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "mock-registry", "uploads");
const PINATA_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";

export interface StoredDocument {
  cid: string;
  sha256: string; // 0x-prefixed
  pinned: boolean; // false => local demo store
}

export function sha256Hex(content: string | Uint8Array): string {
  return "0x" + createHash("sha256").update(content).digest("hex");
}

/** Uploads a document. Pins to IPFS when configured, otherwise stores it locally (labeled demo). */
export async function storeDocument(filename: string, content: string): Promise<StoredDocument> {
  const sha256 = sha256Hex(content);
  const jwt = process.env.IPFS_PINNING_JWT;

  if (jwt) {
    const form = new FormData();
    form.append("file", new Blob([content]), filename);
    const res = await fetch(PINATA_URL, { method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: form });
    if (!res.ok) throw new Error(`IPFS pin failed (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as { IpfsHash: string };
    return { cid: data.IpfsHash, sha256, pinned: true };
  }

  // Demo fallback: a deterministic, clearly-labeled local id derived from the content hash.
  const cid = "demo-" + sha256.slice(2, 34);
  mkdirSync(UPLOADS, { recursive: true });
  writeFileSync(resolve(UPLOADS, `${cid}-${filename}`), content);
  return { cid, sha256, pinned: false };
}
