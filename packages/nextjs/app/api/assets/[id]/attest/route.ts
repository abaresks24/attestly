import { NextResponse } from "next/server";
import { attestAndSign } from "@sh/hedera";
import { createHash } from "crypto";
import { demoConfigured, demoKeys, loadState, registryEvm, serverClient } from "~~/utils/demo";

export const runtime = "nodejs";

/// Records an attestation as the chosen demo attester ("Act as") and, if approving, signs the
/// scheduled mint. The mint executes on-chain once the quorum of signatures is reached.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!demoConfigured()) {
    return NextResponse.json({ error: "Demo not seeded. Run `yarn seed:demo`." }, { status: 400 });
  }
  const { id } = await params;
  const assetId = Number(id);
  const body = await req.json().catch(() => ({}));
  const attesterIndex = Number(body.attesterIndex ?? 0);
  const approve = body.approve !== false;
  const note = String(body.note ?? (approve ? "Approved by attester" : "Rejected by attester"));

  const keys = demoKeys();
  const attester = keys.attesters[attesterIndex];
  const state = loadState()[assetId];
  if (!attester) return NextResponse.json({ error: "unknown attester" }, { status: 400 });
  if (!state) return NextResponse.json({ error: "no issuance state for this asset" }, { status: 400 });

  const client = serverClient();
  try {
    await attestAndSign(client, {
      registryEvm: registryEvm(),
      topicId: state.topicId,
      schedule: state.schedule,
      assetId,
      attester,
      approve,
      evidence: note,
      evidenceHash: "0x" + createHash("sha256").update(note).digest("hex"),
    });
    return NextResponse.json({ ok: true, attester: attester.id, approve });
  } catch (e: any) {
    console.error("[api/assets/attest]", e);
    return NextResponse.json({ error: e?.message ?? "attestation failed" }, { status: 500 });
  } finally {
    client.close();
  }
}
