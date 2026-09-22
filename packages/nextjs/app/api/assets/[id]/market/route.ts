import { NextResponse } from "next/server";
import { SAUCERSWAP_V1, TESTNET, contractIdFromEvm, getAssetView, getPairEvm } from "@sh/hedera";
import { demoConfigured, demoKeys, loadState, registryEvm } from "~~/utils/demo";

export const runtime = "nodejs";

const ZERO = "0x0000000000000000000000000000000000000000";

async function mirror(path: string): Promise<any> {
  const res = await fetch(`${TESTNET.mirror}${path}`).catch(() => null);
  return res && res.ok ? res.json() : null;
}

/// Market view for an asset: token + pair, pause status, per-investor KYC + balance, guardian info.
/// Drives the /assets/[id]/market page. Read-only; no keys touched.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const assetId = Number(id);
  if (!Number.isInteger(assetId) || assetId < 0) {
    return NextResponse.json({ error: "invalid asset id" }, { status: 400 });
  }
  const asset = await getAssetView(registryEvm(), assetId).catch(() => null);
  if (!asset) return NextResponse.json({ error: "asset not found" }, { status: 404 });

  const tokenId = asset.token && asset.token !== ZERO ? "0.0." + BigInt(asset.token).toString() : null;

  // Pair: prefer the persisted id, else resolve from the V1 factory (recreatable after a state loss).
  let pairId = loadState()[assetId]?.pair ?? null;
  if (!pairId && tokenId) {
    const pairEvm = await getPairEvm(tokenId).catch(() => ZERO);
    if (pairEvm && pairEvm !== ZERO) pairId = await contractIdFromEvm(pairEvm).catch(() => null);
  }

  const token = tokenId ? await mirror(`/tokens/${tokenId}`) : null;
  const pauseStatus: string | null = token?.pause_status ?? null;

  // Per-investor state for THIS asset. What gates a swap is the HTS KYC on the token relationship
  // (granted by enableAsset), not the global InvestorRegistry flag — so we read the token relation.
  let investors: { index: number; id: string; verified: boolean; balance: number }[] = [];
  let guardian: { id: string; threshold: number; members: number } | null = null;
  if (demoConfigured()) {
    const keys = demoKeys();
    investors = await Promise.all(
      keys.investors.map(async (inv, index) => {
        const rel = tokenId ? await mirror(`/accounts/${inv.id}/tokens?token.id=${tokenId}`) : null;
        const relation = rel?.tokens?.[0];
        return {
          index,
          id: inv.id,
          verified: relation?.kyc_status === "GRANTED",
          balance: Number(relation?.balance ?? 0),
        };
      }),
    );
    guardian = { id: keys.guardian.id, threshold: keys.guardian.threshold, members: keys.guardianMembers.length };
  }

  const lockupRemaining = Math.max(0, asset.lockupEnds * 1000 - Date.now());

  return NextResponse.json({
    asset: { assetId, status: asset.status, shares: asset.shares, lockupEnds: asset.lockupEnds, tokenId },
    lockupRemaining,
    pair: pairId,
    pauseStatus,
    investors,
    guardian,
    venue: { name: "SaucerSwap V1", router: SAUCERSWAP_V1.router },
    configured: demoConfigured(),
    links: {
      token: tokenId ? `${TESTNET.hashscan}/token/${tokenId}` : null,
      pair: pairId ? `${TESTNET.hashscan}/contract/${pairId}` : null,
    },
  });
}
