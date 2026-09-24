"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { NextPage } from "next";

interface Detail {
  asset: { assetId: number; status: string; shares: string; cid: string; lockupEnds: number; tokenId: string | null };
  timeline: { at: string; entry: unknown }[];
  schedule: { executed: boolean; signatures: number; scheduleId: string | null } | null;
  links: { token: string | null; topic: string | null; schedule: string | null };
}

const AssetDetail: NextPage = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);

  const load = () =>
    fetch(`/api/assets/${id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(setData);

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function confirmMint() {
    setConfirming(true);
    try {
      await fetch(`/api/assets/${id}/confirm-mint`, { method: "POST" });
      await load();
    } finally {
      setConfirming(false);
    }
  }

  if (loading)
    return (
      <div className="p-10 text-center">
        <span className="loading loading-spinner" />
      </div>
    );
  if (!data) return <div className="p-10 text-center opacity-70">Asset not found.</div>;

  const { asset, timeline, schedule, links } = data;
  const lockupRemaining = asset.lockupEnds * 1000 - Date.now();

  return (
    <div className="flex flex-col items-center grow w-full px-5 py-10">
      <div className="max-w-2xl w-full">
        <Link href="/assets" className="link text-sm opacity-70">
          ← Assets
        </Link>
        <h1 className="text-3xl font-bold mt-2 mb-1">Asset #{asset.assetId}</h1>
        <div className="flex items-center gap-2 mb-6">
          <span className="badge badge-lg">{asset.status}</span>
          <span className="opacity-70">{asset.shares} shares</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <Fact label="Document CID" value={asset.cid} />
          <Fact label="Token" value={asset.tokenId ?? "—"} href={links.token} />
          <Fact label="HCS topic" value={links.topic ? "view" : "—"} href={links.topic} />
          <Fact label="Scheduled mint" value={schedule?.scheduleId ?? "—"} href={links.schedule} />
        </div>

        {schedule && (
          <div className="stats stats-vertical sm:stats-horizontal bg-base-200 mb-6 w-full">
            <div className="stat">
              <div className="stat-title">Attester signatures</div>
              <div className="stat-value text-2xl">{schedule.signatures} / 2</div>
              <div className="stat-desc">{schedule.executed ? "mint executed ✓" : "awaiting quorum"}</div>
            </div>
            {asset.status === "Minted" && lockupRemaining > 0 && (
              <div className="stat">
                <div className="stat-title">Lockup</div>
                <div className="stat-value text-2xl">{Math.ceil(lockupRemaining / 60000)}m</div>
                <div className="stat-desc">until finalize can open trading</div>
              </div>
            )}
          </div>
        )}

        {schedule?.executed && asset.status === "Registered" && (
          <div className="alert alert-success mb-6 flex-col sm:flex-row items-start sm:items-center gap-3">
            <span className="text-sm">Mint executed. Confirm it to start the lockup.</span>
            <button className="btn btn-sm sm:ml-auto shrink-0" disabled={confirming} onClick={confirmMint}>
              {confirming ? <span className="loading loading-spinner loading-xs" /> : "Confirm mint"}
            </button>
          </div>
        )}

        {(asset.status === "Minted" || asset.status === "Finalized") && (
          <div className="alert mb-6 flex-col sm:flex-row items-start sm:items-center gap-3">
            <span className="text-sm">
              Open the KYC-gated market: create the pair, verify investors, trade, and run the guardian stop.
            </span>
            <Link href={`/assets/${asset.assetId}/market`} className="btn btn-sm btn-primary sm:ml-auto shrink-0">
              Market →
            </Link>
          </div>
        )}

        <h2 className="text-lg font-semibold mb-2">Audit trail (HCS)</h2>
        {timeline.length === 0 ? (
          <div className="opacity-60 text-sm">No topic messages.</div>
        ) : (
          <ul className="timeline timeline-vertical timeline-compact">
            {timeline.map((m, i) => (
              <li key={i}>
                {i > 0 && <hr />}
                <div className="timeline-start text-xs opacity-60">{m.at?.split(".")[0]}</div>
                <div className="timeline-middle">●</div>
                <div className="timeline-end mb-4 min-w-0">
                  <code className="text-xs block bg-base-200 rounded px-2 py-1 break-all whitespace-pre-wrap">
                    {typeof m.entry === "string" ? m.entry : JSON.stringify(m.entry)}
                  </code>
                </div>
                {i < timeline.length - 1 && <hr />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const Fact = ({ label, value, href }: { label: string; value: string; href?: string | null }) => (
  <div className="bg-base-200 rounded-lg p-3">
    <div className="text-xs opacity-60">{label}</div>
    {href ? (
      <a className="link font-mono text-sm break-all" href={href} target="_blank" rel="noreferrer">
        {value}
      </a>
    ) : (
      <div className="font-mono text-sm break-all">{value}</div>
    )}
  </div>
);

export default AssetDetail;
