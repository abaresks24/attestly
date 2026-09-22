import { NextResponse } from "next/server";
import { enableInvestor, getAssetView, requireOperator } from "@sh/hedera";
import { demoConfigured, demoKeys, investorRegistryEvm, registryEvm, serverClient } from "~~/utils/demo";

export const runtime = "nodejs";
export const maxDuration = 120;

const ZERO = "0x0000000000000000000000000000000000000000";

/// Verify an investor for this asset: admin approves in the InvestorRegistry, the investor associates
/// the token, then enableAsset() makes the registry grant HTS KYC. Admin = the deployer (operator).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!demoConfigured()) return NextResponse.json({ error: "Demo not seeded." }, { status: 400 });
  const { id } = await params;
  const assetId = Number(id);
  const body = await req.json().catch(() => ({}));
  const investorIndex = Number(body.investorIndex ?? 0);

  const keys = demoKeys();
  const investor = keys.investors[investorIndex];
  if (!investor) return NextResponse.json({ error: "unknown investor" }, { status: 400 });

  const asset = await getAssetView(registryEvm(), assetId).catch(() => null);
  if (!asset || asset.token === ZERO) {
    return NextResponse.json({ error: "asset has no token yet" }, { status: 400 });
  }
  const tokenId = "0.0." + BigInt(asset.token).toString();

  const client = serverClient();
  try {
    await enableInvestor(client, {
      adminDerKey: requireOperator().key.toStringDer(),
      investorRegistryEvm: investorRegistryEvm(),
      investorId: investor.id,
      investorEvm: investor.evmAddress,
      investorDerKey: investor.privateKey,
      tokenId,
      registryEvm: registryEvm(),
      assetId,
    });
    return NextResponse.json({ ok: true, investor: investor.id });
  } catch (e: any) {
    console.error("[api/market/enable]", e);
    return NextResponse.json({ error: e?.shortMessage ?? e?.message ?? "enable failed" }, { status: 500 });
  } finally {
    client.close();
  }
}
