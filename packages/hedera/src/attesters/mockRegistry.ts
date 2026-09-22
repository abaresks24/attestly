import { readFileSync } from "node:fs";
import { type Attestation, type Attester, type AssetForReview, attestation } from "./types.js";

interface Title {
  cid: string;
  documentHash: string;
  owner: string;
  parcel: string;
}

/// A registry-oracle attester: looks the asset up in a local land registry (mock-registry/titles.json)
/// and approves only if a title exists whose document hash and owner match the submission. Replace the
/// JSON lookup with a real registry API to get a production attester.
export class MockRegistryAttester implements Attester {
  readonly name = "mock-registry";
  private readonly titles: Title[];

  constructor(titlesPathOrData: string | { titles: Title[] }) {
    this.titles =
      typeof titlesPathOrData === "string"
        ? (JSON.parse(readFileSync(titlesPathOrData, "utf8")).titles as Title[])
        : titlesPathOrData.titles;
  }

  evaluate(asset: AssetForReview): Attestation {
    const title = this.titles.find((t) => t.cid === asset.cid);
    if (!title) return attestation(false, `No registry title found for CID ${asset.cid}.`);
    if (title.documentHash.toLowerCase() !== asset.documentHash.toLowerCase()) {
      return attestation(false, `Document hash does not match the registered title for ${title.parcel}.`);
    }
    if (asset.owner && asset.owner !== title.owner) {
      return attestation(false, `Owner "${asset.owner}" does not match registry owner "${title.owner}".`);
    }
    return attestation(true, `Registry title for ${title.parcel} matches (owner ${title.owner}).`);
  }
}
