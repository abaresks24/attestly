"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { NextPage } from "next";

const SAMPLE = "DEED: Parcel 12, Demo Registry. Owner: Issuer Demo. 1,000,000 shares.";

const NewAsset: NextPage = () => {
  const router = useRouter();
  const [name, setName] = useState("Demo Parcel 12");
  const [symbol, setSymbol] = useState("ATTD");
  const [document, setDocument] = useState(SAMPLE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, symbol, document }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "issuance failed");
      router.push(`/assets/${data.assetId}`);
    } catch (e: any) {
      setError(e?.message ?? "issuance failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center grow w-full px-5 py-10">
      <div className="max-w-xl w-full">
        <h1 className="text-3xl font-bold mb-2">Submit an asset</h1>
        <p className="opacity-80 mb-6">
          Registers the asset, stores the document (IPFS or local demo), creates the token with a ThresholdKey supply
          key and the registry as KYC/pause key, and schedules the mint. Runs in demo mode as the seeded issuer.
        </p>

        <label className="form-control mb-3">
          <span className="label-text mb-1">Name</span>
          <input className="input input-bordered" value={name} onChange={e => setName(e.target.value)} />
        </label>
        <label className="form-control mb-3">
          <span className="label-text mb-1">Symbol</span>
          <input className="input input-bordered" value={symbol} onChange={e => setSymbol(e.target.value)} />
        </label>
        <label className="form-control mb-4">
          <span className="label-text mb-1">Document (its SHA-256 is recorded on-chain)</span>
          <textarea
            className="textarea textarea-bordered h-28"
            value={document}
            onChange={e => setDocument(e.target.value)}
          />
        </label>

        {error && <div className="alert alert-error mb-4 text-sm">{error}</div>}

        <button className="btn btn-primary w-full" disabled={busy} onClick={submit}>
          {busy ? (
            <>
              <span className="loading loading-spinner loading-sm" /> Issuing on testnet…
            </>
          ) : (
            "Submit & create token"
          )}
        </button>
        <p className="text-xs opacity-60 mt-3">
          This can take ~30–60s: it creates an HCS topic, the token, and the scheduled mint on Hedera testnet.
        </p>
      </div>
    </div>
  );
};

export default NewAsset;
