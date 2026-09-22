import { NextResponse } from "next/server";
import { issueAsset, listAssets } from "@sh/hedera";
import { demoConfigured, demoKeys, registryEvm, registryId, saveAssetState, serverClient } from "~~/utils/demo";

export const runtime = "nodejs";

// Demo issuance defaults (mirror packages/hardhat/config/rwa.ts).
const THRESHOLD = 2;
const DECIMALS = 2;
const TOTAL_SHARES = 1_000_000;
const SCHEDULE_EXPIRY = 24 * 3600;

/// Lists all registered assets from the AssetRegistry.
export async function GET() {
  try {
    const assets = await listAssets(registryEvm());
    return NextResponse.json({ assets, configured: demoConfigured() });
  } catch (e) {
    console.error("[api/assets GET]", e);
    return NextResponse.json({ assets: [], configured: demoConfigured() });
  }
}

/// Issues a new asset in demo mode (server acts as the issuer): submit -> token -> schedule.
export async function POST(req: Request) {
  if (!demoConfigured()) {
    return NextResponse.json(
      { error: "Demo not seeded. Run `yarn seed:demo` and set your operator." },
      { status: 400 },
    );
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const symbol = String(body.symbol ?? "").trim();
  const document = String(body.document ?? "").trim();
  if (!name || !symbol || !document) {
    return NextResponse.json({ error: "name, symbol and document are required" }, { status: 400 });
  }

  const client = serverClient();
  try {
    const keys = demoKeys();
    const result = await issueAsset(client, {
      registryEvm: registryEvm(),
      registryId: await registryId(),
      issuer: keys.issuer,
      attesters: keys.attesters,
      threshold: THRESHOLD,
      decimals: DECIMALS,
      totalShares: TOTAL_SHARES,
      scheduleExpirySeconds: SCHEDULE_EXPIRY,
      name,
      symbol,
      filename: `${symbol.toLowerCase()}.txt`,
      document,
    });
    saveAssetState(result.assetId, { topicId: result.topicId, schedule: result.schedule, token: result.token });
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[api/assets POST]", e);
    return NextResponse.json({ error: e?.message ?? "issuance failed" }, { status: 500 });
  } finally {
    client.close();
  }
}
