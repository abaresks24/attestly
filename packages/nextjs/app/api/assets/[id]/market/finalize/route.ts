import { NextResponse } from "next/server";
import { contractIdFromEvm, createPair, finalizeAsset, getAssetView, getPairEvm } from "@sh/hedera";
import { demoConfigured, demoKeys, registryEvm, setAssetPair } from "~~/utils/demo";

export const runtime = "nodejs";
export const maxDuration = 120; // pair creation is gas-heavy (~9M) and slow on testnet.

const ZERO = "0x0000000000000000000000000000000000000000";

/// Issuer step: create the V1 pair (if absent) and finalize the asset so the registry grants KYC to
/// the pair — the only contract that must hold the token. Persists the resolved pair id.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!demoConfigured()) return NextResponse.json({ error: "Demo not seeded." }, { status: 400 });
  const { id } = await params;
  const assetId = Number(id);
  const asset = await getAssetView(registryEvm(), assetId).catch(() => null);
  if (!asset || asset.token === ZERO) {
    return NextResponse.json({ error: "asset has no token yet" }, { status: 400 });
  }
  const tokenId = "0.0." + BigInt(asset.token).toString();
  const issuerKey = demoKeys().issuer.privateKey;

  try {
    // Reuse the pair if one already exists (finalize is idempotent enough to re-run).
    let pairEvm = await getPairEvm(tokenId).catch(() => ZERO);
    if (!pairEvm || pairEvm === ZERO) {
      ({ pairEvm } = await createPair(issuerKey, tokenId));
    }
    await finalizeAsset(issuerKey, registryEvm(), assetId, pairEvm);
    const pairId = await contractIdFromEvm(pairEvm);
    setAssetPair(assetId, pairId);
    return NextResponse.json({ ok: true, pair: pairId });
  } catch (e: any) {
    console.error("[api/market/finalize]", e);
    return NextResponse.json({ error: e?.shortMessage ?? e?.message ?? "finalize failed" }, { status: 500 });
  }
}
