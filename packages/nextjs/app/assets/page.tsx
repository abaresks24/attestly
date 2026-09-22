"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";

interface AssetView {
  assetId: number;
  issuer: string;
  token: string;
  shares: string;
  status: string;
}

const STATUS_BADGE: Record<string, string> = {
  Submitted: "badge-ghost",
  Registered: "badge-warning",
  Minted: "badge-info",
  Finalized: "badge-success",
};

const Assets: NextPage = () => {
  const [assets, setAssets] = useState<AssetView[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/assets")
      .then(r => r.json())
      .then(d => {
        setAssets(d.assets ?? []);
        setConfigured(d.configured ?? false);
      })
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col items-center grow w-full px-5 py-10">
      <div className="max-w-3xl w-full">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold">Assets</h1>
          <Link href="/assets/new" className="btn btn-primary btn-sm">
            + New asset
          </Link>
        </div>
        <p className="opacity-80 mb-6">
          Real-world assets issued through this template. The network refuses to mint until a quorum of attesters signs;
          only KYC-verified accounts can hold the token.
        </p>

        {!configured && (
          <div className="alert alert-info mb-6">
            <span>
              Demo not seeded. Run <code>yarn seed:demo</code> then <code>yarn deploy:testnet</code>, and set your
              operator in <code>.env</code>. The app still runs; issuing is disabled until then.
            </span>
          </div>
        )}

        {loading ? (
          <span className="loading loading-spinner" />
        ) : assets.length === 0 ? (
          <div className="opacity-70">No assets yet. Create the first one.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Shares</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {assets.map(a => (
                  <tr key={a.assetId}>
                    <td>{a.assetId}</td>
                    <td>{a.shares}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[a.status] ?? "badge-ghost"}`}>{a.status}</span>
                    </td>
                    <td>
                      <Link href={`/assets/${a.assetId}`} className="link">
                        view →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-8 flex gap-4">
          <Link href="/attest" className="link">
            Attester queue →
          </Link>
          <Link href="/" className="link opacity-70">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Assets;
