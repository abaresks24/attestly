import { NextResponse } from "next/server";
import { TESTNET, getAssetView } from "@sh/hedera";
import { loadState, registryEvm } from "~~/utils/demo";

export const runtime = "nodejs";

async function topicMessages(topicId: string) {
  if (!topicId) return [];
  const res = await fetch(`${TESTNET.mirror}/topics/${topicId}/messages?order=asc&limit=50`).catch(() => null);
  if (!res || !res.ok) return [];
  const data = (await res.json()) as { messages?: { consensus_timestamp: string; message: string }[] };
  return (data.messages ?? []).map(m => {
    const decoded = Buffer.from(m.message, "base64").toString("utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(decoded);
    } catch {
      parsed = decoded;
    }
    return { at: m.consensus_timestamp, entry: parsed };
  });
}

async function scheduleStatus(scheduleId: string | undefined) {
  if (!scheduleId) return null;
  const res = await fetch(`${TESTNET.mirror}/schedules/${scheduleId}`).catch(() => null);
  if (!res || !res.ok) return null;
  const d = (await res.json()) as { executed_timestamp: string | null; signatures?: unknown[] };
  return { executed: d.executed_timestamp != null, signatures: d.signatures?.length ?? 0 };
}

/// Full asset view: on-chain state + HCS timeline + scheduled-mint signature progress.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const assetId = Number(id);
  if (!Number.isInteger(assetId) || assetId < 0) {
    return NextResponse.json({ error: "invalid asset id" }, { status: 400 });
  }
  const asset = await getAssetView(registryEvm(), assetId).catch(() => null);
  if (!asset) return NextResponse.json({ error: "asset not found" }, { status: 404 });

  const state = loadState()[assetId];
  const [timeline, schedule] = await Promise.all([topicMessages(asset.topicId), scheduleStatus(state?.schedule)]);

  // The contract stores the token as a long-zero EVM address; HashScan uses the 0.0.N id.
  const zero = "0x0000000000000000000000000000000000000000";
  const tokenId = asset.token && asset.token !== zero ? "0.0." + BigInt(asset.token).toString() : null;

  return NextResponse.json({
    asset: { ...asset, tokenId },
    timeline,
    schedule: schedule ? { ...schedule, scheduleId: state?.schedule ?? null } : null,
    links: {
      token: tokenId ? `${TESTNET.hashscan}/token/${tokenId}` : null,
      topic: asset.topicId ? `${TESTNET.hashscan}/topic/${asset.topicId}` : null,
      schedule: state?.schedule ? `${TESTNET.hashscan}/schedule/${state.schedule}` : null,
    },
  });
}
