"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";

interface AssetView {
  assetId: number;
  shares: string;
  status: string;
}

const Attest: NextPage = () => {
  const [assets, setAssets] = useState<AssetView[]>([]);
  const [actor, setActor] = useState(0);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/assets")
      .then(r => r.json())
      .then(d => setAssets((d.assets ?? []).filter((a: AssetView) => a.status === "Registered")))
      .catch(() => setAssets([]));
  }, []);

  useEffect(refresh, [refresh]);

  async function attest(assetId: number, approve: boolean) {
    setBusy(assetId);
    setMsg(null);
    try {
      const res = await fetch(`/api/assets/${assetId}/attest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attesterIndex: actor, approve }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      setMsg(`Attester ${actor + 1} ${approve ? "approved & signed" : "rejected"} asset #${assetId}.`);
      refresh();
    } catch (e: any) {
      setMsg(`Error: ${e?.message ?? "failed"}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-center grow w-full px-5 py-10">
      <div className="max-w-2xl w-full">
        <h1 className="text-3xl font-bold mb-1">Attester queue</h1>
        <p className="opacity-80 mb-4">
          Assets awaiting attestation. Approving records the decision on HCS and adds your signature to the scheduled
          mint — the network mints only when the quorum (2 of 3) is reached.
        </p>

        <label className="form-control mb-6 max-w-xs">
          <span className="label-text mb-1">Act as</span>
          <select className="select select-bordered" value={actor} onChange={e => setActor(Number(e.target.value))}>
            <option value={0}>Attester 1</option>
            <option value={1}>Attester 2</option>
            <option value={2}>Attester 3</option>
          </select>
        </label>

        {msg && <div className="alert mb-4 text-sm">{msg}</div>}

        {assets.length === 0 ? (
          <div className="opacity-70">
            Nothing to attest.{" "}
            <Link href="/assets/new" className="link">
              Submit an asset
            </Link>{" "}
            first.
          </div>
        ) : (
          <div className="space-y-3">
            {assets.map(a => (
              <div
                key={a.assetId}
                className="flex items-center justify-between gap-3 flex-wrap bg-base-200 rounded-lg p-4"
              >
                <div className="min-w-0">
                  <span className="font-medium">Asset #{a.assetId}</span>
                  <span className="opacity-70 ml-2">{a.shares} shares</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    className="btn btn-sm btn-success"
                    disabled={busy === a.assetId}
                    onClick={() => attest(a.assetId, true)}
                  >
                    {busy === a.assetId ? <span className="loading loading-spinner loading-xs" /> : "Approve & sign"}
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    disabled={busy === a.assetId}
                    onClick={() => attest(a.assetId, false)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8">
          <Link href="/assets" className="link opacity-70">
            ← Assets
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Attest;
