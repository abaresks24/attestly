import { NextResponse } from "next/server";
import { addLiquidity, getAssetView } from "@sh/hedera";
import { demoConfigured, demoKeys, registryEvm, serverClient } from "~~/utils/demo";

export const runtime = "nodejs";
export const maxDuration = 120;

const ZERO = "0x0000000000000000000000000000000000000000";

/// Issuer step: approve the router to pull shares, then seed the pair with shares + HBAR liquidity.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!demoConfigured()) return NextResponse.json({ error: "Demo not seeded." }, { status: 400 });
  const { id } = await params;
  const assetId = Number(id);
  const body = await req.json().catch(() => ({}));
  const shareAmount = Number(body.shares ?? 500_000);
  const hbarAmount = Number(body.hbar ?? 10);

  const asset = await getAssetView(registryEvm(), assetId).catch(() => null);
  if (!asset || asset.token === ZERO) {
    return NextResponse.json({ error: "asset has no token yet" }, { status: 400 });
  }
  const tokenId = "0.0." + BigInt(asset.token).toString();
  const issuer = demoKeys().issuer;

  const client = serverClient();
  try {
    await addLiquidity(client, {
      issuerId: issuer.id,
      issuerEvm: issuer.evmAddress,
      issuerDerKey: issuer.privateKey,
      tokenId,
      shareAmount,
      hbarAmount,
    });
    return NextResponse.json({ ok: true, shares: shareAmount, hbar: hbarAmount });
  } catch (e: any) {
    console.error("[api/market/liquidity]", e);
    return NextResponse.json({ error: e?.shortMessage ?? e?.message ?? "add liquidity failed" }, { status: 500 });
  } finally {
    client.close();
  }
}
