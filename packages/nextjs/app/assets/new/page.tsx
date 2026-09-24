"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NextPage } from "next";

const SAMPLE = "DEED: Parcel 12, Demo Registry. Owner: Issuer Demo. 1,000,000 shares.";

const STEPS = [
  "Store the document (IPFS, or a labeled local CID in the demo)",
  "Open a per-asset HCS topic and log the submission (CID + SHA-256)",
  "Create the token: ThresholdKey supply key, registry as KYC + pause key, no admin key",
  "Schedule the mint — it executes only once the attester quorum signs",
];

const NewAsset: NextPage = () => {
  const router = useRouter();
  const [name, setName] = useState("Demo Parcel 12");
  const [symbol, setSymbol] = useState("ATTD");
  const [document, setDocument] = useState(SAMPLE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    fetch("/api/config")
      .then(r => r.json())
      .then(d => setConfigured(d.configured ?? false))
      .catch(() => setConfigured(false));
  }, []);

  const canSubmit = configured && name.trim() && symbol.trim() && document.trim() && !busy;

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
        <Link href="/assets" className="link text-sm opacity-70">
          ← Assets
        </Link>
        <h1 className="text-3xl font-bold mt-2 mb-1">Submit an asset</h1>
        <p className="opacity-70 mb-6">Issue a new real-world-asset token as the seeded demo issuer.</p>

        {!configured && (
          <div className="alert alert-warning mb-6 text-sm">
            <span>
              Demo not seeded. Run <code>yarn seed:demo</code> and set your operator in <code>.env</code> to enable
              issuing.
            </span>
          </div>
        )}

        <div className="bg-base-100 rounded-2xl shadow-md border border-base-300 p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="form-control sm:col-span-2">
              <div className="label py-1">
                <span className="label-text font-medium">Name</span>
              </div>
              <input
                className="input input-bordered w-full"
                placeholder="Demo Parcel 12"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </label>
            <label className="form-control">
              <div className="label py-1">
                <span className="label-text font-medium">Symbol</span>
              </div>
              <input
                className="input input-bordered w-full uppercase"
                placeholder="ATTD"
                maxLength={8}
                value={symbol}
                onChange={e => setSymbol(e.target.value.toUpperCase())}
              />
            </label>
          </div>

          <label className="form-control mt-4">
            <div className="label py-1">
              <span className="label-text font-medium">Asset document</span>
              <span className="label-text-alt opacity-60">SHA-256 recorded on-chain</span>
            </div>
            <textarea
              className="textarea textarea-bordered h-28 w-full"
              placeholder="Deed, prospectus, receipt… the document your attesters review."
              value={document}
              onChange={e => setDocument(e.target.value)}
            />
          </label>

          {error && <div className="alert alert-error mt-4 text-sm">{error}</div>}

          <button className="btn btn-primary w-full mt-5" disabled={!canSubmit} onClick={submit}>
            {busy ? (
              <>
                <span className="loading loading-spinner loading-sm" /> Issuing on testnet…
              </>
            ) : (
              "Submit & create token"
            )}
          </button>
        </div>

        <div className="bg-base-200 rounded-2xl p-5 mt-6">
          <h2 className="text-sm font-semibold mb-3 opacity-80">What this does</h2>
          <ol className="space-y-2">
            {STEPS.map((s, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="badge badge-neutral badge-sm shrink-0 mt-0.5">{i + 1}</span>
                <span className="opacity-80">{s}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs opacity-50 mt-4">
            Takes ~30–60s on Hedera testnet (HCS topic, token creation, scheduled mint). You&apos;ll land on the asset
            page to collect attestations.
          </p>
        </div>
      </div>
    </div>
  );
};

export default NewAsset;
