import assert from "node:assert/strict";
import { test } from "node:test";
import { ManualAttester } from "./manual.js";
import { MockRegistryAttester } from "./mockRegistry.js";
import type { AssetForReview } from "./types.js";

const TITLES = {
  titles: [
    { cid: "bafkreidemoattestedrwaparcel12", documentHash: "0xabc123", owner: "Issuer Demo", parcel: "Parcel 12" },
  ],
};

const matching: AssetForReview = {
  assetId: "0",
  cid: "bafkreidemoattestedrwaparcel12",
  documentHash: "0xabc123",
  owner: "Issuer Demo",
};

test("ManualAttester returns the given decision and a hashed evidence", () => {
  const yes = new ManualAttester(true).evaluate(matching);
  assert.equal(yes.approve, true);
  assert.match(yes.evidenceHash, /^0x[0-9a-f]{64}$/);

  const no = new ManualAttester(false, "docs incomplete").evaluate(matching);
  assert.equal(no.approve, false);
  assert.equal(no.evidence, "docs incomplete");
});

test("MockRegistryAttester approves a matching title", () => {
  const a = new MockRegistryAttester(TITLES).evaluate(matching);
  assert.equal(a.approve, true);
  assert.match(a.evidence, /Parcel 12/);
});

test("MockRegistryAttester rejects an unknown CID with a reason", () => {
  const a = new MockRegistryAttester(TITLES).evaluate({ ...matching, cid: "bafkreiunknown" });
  assert.equal(a.approve, false);
  assert.match(a.evidence, /No registry title/);
});

test("MockRegistryAttester rejects a document-hash mismatch with a reason", () => {
  const a = new MockRegistryAttester(TITLES).evaluate({ ...matching, documentHash: "0xdeadbeef" });
  assert.equal(a.approve, false);
  assert.match(a.evidence, /hash does not match/);
});

test("MockRegistryAttester rejects an owner mismatch with a reason", () => {
  const a = new MockRegistryAttester(TITLES).evaluate({ ...matching, owner: "Someone Else" });
  assert.equal(a.approve, false);
  assert.match(a.evidence, /does not match registry owner/);
});
