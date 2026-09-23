import { NextResponse } from "next/server";
import { PrivateKey } from "@hiero-ledger/sdk";
import { explainError, guardianSetPause } from "@sh/hedera";
import { demoConfigured, demoKeys, registryId, serverClient } from "~~/utils/demo";

export const runtime = "nodejs";
export const maxDuration = 120;

/// Guardian emergency stop: pause/unpause the asset via the native ThresholdKey(2/3) account, signed
/// by the chosen members. Fewer than the threshold fails (INVALID_SIGNATURE) — the multisig pattern
/// without a multisig contract.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!demoConfigured()) return NextResponse.json({ error: "Demo not seeded." }, { status: 400 });
  const { id } = await params;
  const assetId = Number(id);
  if (!Number.isInteger(assetId) || assetId < 0)
    return NextResponse.json({ error: "invalid asset id" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const pause = body.pause !== false;
  const memberIndexes: number[] = Array.isArray(body.memberIndexes) ? body.memberIndexes : [0, 1];

  const keys = demoKeys();
  const memberKeys = memberIndexes
    .map(i => keys.guardianMembers[i])
    .filter(Boolean)
    .map(m => PrivateKey.fromStringECDSA(m.privateKey));
  if (memberKeys.length === 0) return NextResponse.json({ error: "no guardian members selected" }, { status: 400 });

  const client = serverClient();
  try {
    await guardianSetPause(client, {
      registryId: await registryId(),
      assetId,
      guardianId: keys.guardian.id,
      memberKeys,
      pause,
    });
    return NextResponse.json({ ok: true, pause, signers: memberKeys.length });
  } catch (e: any) {
    // ReceiptStatusError carries a Status: prefer its numeric _code (mapped by HTS_CODES), then the
    // status name, then the raw message — so a below-threshold pause always reads as INVALID_SIGNATURE.
    const readable = explainError(e?.status?._code ?? e?.status?.toString() ?? e?.message ?? "reverted");
    console.error("[api/market/guardian]", readable.code);
    return NextResponse.json(
      { error: readable.message, code: readable.code, signers: memberKeys.length },
      { status: 400 },
    );
  } finally {
    client.close();
  }
}
