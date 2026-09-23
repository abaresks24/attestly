import { NextResponse } from "next/server";
import { TESTNET, explainError, getAssetView, swapHbarForShares } from "@sh/hedera";
import { demoConfigured, demoKeys, registryEvm } from "~~/utils/demo";

export const runtime = "nodejs";
export const maxDuration = 120;

const ZERO = "0x0000000000000000000000000000000000000000";

async function mirror(path: string): Promise<any> {
  const res = await fetch(`${TESTNET.mirror}${path}`).catch(() => null);
  return res && res.ok ? res.json() : null;
}

/// A router swap is sent with an explicit gas limit, so an on-chain revert reaches us as a generic
/// "transaction execution reverted" — the SaucerSwap "Safe token transfer failed!" wrapper never
/// surfaces. We diagnose the real cause from the mirror instead: paused token, or KYC not granted.
async function diagnoseSwapFailure(tokenId: string, investorId: string, raw: string) {
  const [token, rel] = await Promise.all([
    mirror(`/tokens/${tokenId}`),
    mirror(`/accounts/${investorId}/tokens?token.id=${tokenId}`),
  ]);
  if (token?.pause_status === "PAUSED") return explainError("TOKEN_IS_PAUSED");
  const relation = rel?.tokens?.[0];
  if (!relation) return explainError("TOKEN_NOT_ASSOCIATED_TO_ACCOUNT");
  if (relation.kyc_status !== "GRANTED") return explainError("ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN");
  return explainError(raw);
}

/// Investor step: swap HBAR for shares on the V1 pair. On failure the HTS/SaucerSwap reason is mapped
/// to a plain sentence (KYC not granted, or trading paused) so the UI can explain the refusal.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!demoConfigured()) return NextResponse.json({ error: "Demo not seeded." }, { status: 400 });
  const { id } = await params;
  const assetId = Number(id);
  const body = await req.json().catch(() => ({}));
  const investorIndex = Number(body.investorIndex ?? 0);
  const hbarIn = Number(body.hbar ?? 1);
  if (!Number.isInteger(hbarIn) || hbarIn <= 0 || hbarIn > 10_000) {
    return NextResponse.json({ error: "hbar must be a positive whole number within range" }, { status: 400 });
  }

  const keys = demoKeys();
  const investor = keys.investors[investorIndex];
  if (!investor) return NextResponse.json({ error: "unknown investor" }, { status: 400 });

  const asset = await getAssetView(registryEvm(), assetId).catch(() => null);
  if (!asset || asset.token === ZERO) {
    return NextResponse.json({ error: "asset has no token yet" }, { status: 400 });
  }
  const tokenId = "0.0." + BigInt(asset.token).toString();

  try {
    const hash = await swapHbarForShares(investor.privateKey, tokenId, hbarIn);
    return NextResponse.json({ ok: true, hash, investor: investor.id });
  } catch (e: any) {
    const readable = await diagnoseSwapFailure(tokenId, investor.id, e?.shortMessage ?? e?.message ?? "reverted");
    console.error("[api/market/swap]", readable.code);
    return NextResponse.json({ error: readable.message, code: readable.code }, { status: 400 });
  }
}
