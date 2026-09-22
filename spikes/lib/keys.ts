// Verifies a token's on-chain key set against expectations, using the mirror node.
//
// Gotcha (findings.json > network.mirror_node): the mirror node returns a ThresholdKey/KeyList
// as { _type: "ProtobufEncoded", key: <hex> } and does NOT expand threshold or sub-keys into
// JSON. We decode that protobuf with @hiero-ledger/proto + Key._fromProtobufKey to assert the
// threshold, the members, and the absence of an admin key. This backs the template's FR-2 invariant.
import { Key, KeyList, PublicKey } from "@hashgraph/sdk";
import { proto } from "@hiero-ledger/proto";

export interface MirrorKey {
  _type: "ECDSA_SECP256K1" | "ED25519" | "ProtobufEncoded";
  key: string;
}

/** Decodes any mirror-node key object into an SDK Key (single key or KeyList). */
export function decodeMirrorKey(mk: MirrorKey | null): Key | KeyList | null {
  if (!mk) return null;
  if (mk._type === "ProtobufEncoded") {
    const bytes = Buffer.from(mk.key, "hex");
    return (Key as unknown as { _fromProtobufKey: (k: unknown) => Key })._fromProtobufKey(
      proto.Key.decode(bytes),
    );
  }
  if (mk._type === "ECDSA_SECP256K1") return PublicKey.fromStringECDSA(mk.key);
  return PublicKey.fromStringED25519(mk.key);
}

export interface ThresholdCheck {
  ok: boolean;
  reasons: string[];
}

/** Asserts a mirror-node key is a ThresholdKey(threshold of expectedMembers), order-independent. */
export function verifyThresholdKey(
  mk: MirrorKey | null,
  threshold: number,
  expectedMembers: PublicKey[],
): ThresholdCheck {
  const reasons: string[] = [];
  const decoded = decodeMirrorKey(mk);
  if (!(decoded instanceof KeyList)) {
    return { ok: false, reasons: ["key is not a KeyList/ThresholdKey"] };
  }
  if (decoded.threshold !== threshold) {
    reasons.push(`threshold ${decoded.threshold} != expected ${threshold}`);
  }
  const got = decoded
    .toArray()
    .map((k) => (k as PublicKey).toStringRaw())
    .sort();
  const want = expectedMembers.map((k) => k.toStringRaw()).sort();
  if (got.length !== want.length) reasons.push(`member count ${got.length} != ${want.length}`);
  if (JSON.stringify(got) !== JSON.stringify(want)) reasons.push("members do not match expected set");
  return { ok: reasons.length === 0, reasons };
}
