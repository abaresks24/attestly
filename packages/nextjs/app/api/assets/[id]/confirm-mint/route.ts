import { NextResponse } from "next/server";
import { registryAs } from "@sh/hedera";
import { demoConfigured, demoKeys, registryEvm } from "~~/utils/demo";

export const runtime = "nodejs";

/// Issuer confirms the mint executed; the contract starts the lockup (status -> Minted).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!demoConfigured()) return NextResponse.json({ error: "Demo not seeded." }, { status: 400 });
  const { id } = await params;
  const assetId = Number(id);
  try {
    const registry = registryAs(registryEvm(), demoKeys().issuer.privateKey);
    await (await registry.confirmMint(assetId, { gasLimit: 300_000 })).wait();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[api/assets/confirm-mint]", e);
    return NextResponse.json({ error: e?.message ?? "confirm failed" }, { status: 500 });
  }
}
