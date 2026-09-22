"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { NextPage } from "next";

type MarketView = {
  asset: { assetId: number; status: string; shares: string; lockupEnds: number; tokenId: string | null };
  lockupRemaining: number;
  pair: string | null;
  pauseStatus: string | null;
  investors: { index: number; id: string; verified: boolean; balance: number }[];
  guardian: { id: string; threshold: number; members: number } | null;
  venue: { name: string; router: string };
  configured: boolean;
  links: { token: string | null; pair: string | null };
};

const Market: NextPage = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<MarketView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [swapInvestor, setSwapInvestor] = useState(0);
  const [swapHbar, setSwapHbar] = useState(1);
  const [guardianSigners, setGuardianSigners] = useState(2);

  const load = useCallback(
    () =>
      fetch(`/api/assets/${id}/market`)
        .then(r => (r.ok ? r.json() : null))
        .then(setData),
    [id],
  );

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Runs a POST action, surfaces its message, then refreshes the market view.
  async function run(key: string, url: string, body?: unknown, okText?: string) {
    setBusy(key);
    setMsg(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "action failed");
      setMsg({ kind: "ok", text: okText ?? "Done." });
      await load();
    } catch (e: any) {
      setMsg({ kind: "error", text: e?.message ?? "action failed" });
    } finally {
      setBusy(null);
    }
  }

  if (loading)
    return (
      <div className="p-10 text-center">
        <span className="loading loading-spinner" />
      </div>
    );
  if (!data) return <div className="p-10 text-center opacity-70">Asset not found.</div>;

  const { asset, lockupRemaining, pair, pauseStatus, investors, guardian, venue, configured, links } = data;
  const hasToken = !!asset.tokenId;
  const lockupOver = lockupRemaining <= 0;
  const tradable = !!pair && lockupOver;
  const paused = pauseStatus === "PAUSED";

  return (
    <div className="flex flex-col items-center grow w-full px-5 py-10">
      <div className="max-w-2xl w-full">
        <Link href={`/assets/${id}`} className="link text-sm opacity-70">
          ← Asset #{asset.assetId}
        </Link>
        <h1 className="text-3xl font-bold mt-2 mb-1">Market</h1>
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="badge badge-lg">{asset.status}</span>
          {paused ? (
            <span className="badge badge-lg badge-error">PAUSED</span>
          ) : pair ? (
            <span className="badge badge-lg badge-success">trading open</span>
          ) : (
            <span className="badge badge-lg badge-ghost">no pair yet</span>
          )}
          <span className="opacity-70 text-sm">
            venue: {venue.name} · router {venue.router}
          </span>
        </div>

        {!configured && (
          <div className="alert alert-info mb-6 text-sm">
            <span>
              Demo not seeded. Run <code>yarn seed:demo</code> and set your operator in <code>.env</code>.
            </span>
          </div>
        )}

        {msg && (
          <div className={`alert mb-6 text-sm ${msg.kind === "error" ? "alert-error" : "alert-success"}`}>
            {msg.text}
          </div>
        )}

        {!hasToken && (
          <div className="alert alert-warning mb-6 text-sm">
            <span>
              This asset has no token yet. Mint it first from the{" "}
              <Link href={`/assets/${id}`} className="link">
                asset page
              </Link>
              .
            </span>
          </div>
        )}

        {hasToken && !lockupOver && (
          <div className="alert alert-warning mb-6 text-sm">
            <span>
              Lockup still active ({Math.ceil(lockupRemaining / 60000)}m left). Trading opens once it elapses.
            </span>
          </div>
        )}

        {/* Step 1 — Issuer: create the pair + grant KYC to it. */}
        <Section
          n={1}
          title="Open the market (issuer)"
          desc="Create the SaucerSwap V1 pair and grant it KYC, so the pair can hold the token."
        >
          {pair ? (
            <div className="flex items-center gap-2">
              <span className="badge badge-success">pair {pair}</span>
              {links.pair && (
                <a className="link text-sm" href={links.pair} target="_blank" rel="noreferrer">
                  HashScan ↗
                </a>
              )}
            </div>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              disabled={!configured || !hasToken || !lockupOver || busy != null}
              onClick={() =>
                run("finalize", `/api/assets/${id}/market/finalize`, undefined, "Pair created and KYC granted.")
              }
            >
              {busy === "finalize" ? <span className="loading loading-spinner loading-xs" /> : "Finalize & create pair"}
            </button>
          )}
        </Section>

        {/* Step 2 — Issuer: seed liquidity. */}
        <Section n={2} title="Add liquidity (issuer)" desc="Seed the pair with shares and HBAR so investors can trade.">
          <button
            className="btn btn-primary btn-sm"
            disabled={!configured || !tradable || busy != null}
            onClick={() =>
              run(
                "liquidity",
                `/api/assets/${id}/market/liquidity`,
                { shares: 500_000, hbar: 10 },
                "Liquidity added (500,000 shares / 10 HBAR).",
              )
            }
          >
            {busy === "liquidity" ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              "Add 500,000 shares / 10 HBAR"
            )}
          </button>
        </Section>

        {/* Step 3 — Investors: KYC status + verify. */}
        <Section
          n={3}
          title="Investors"
          desc="Only KYC-verified accounts can receive shares. Verify an investor to grant KYC."
        >
          {investors.length === 0 ? (
            <div className="opacity-60 text-sm">Seed the demo to list investors.</div>
          ) : (
            <div className="space-y-2">
              {investors.map(inv => (
                <div key={inv.index} className="flex items-center justify-between bg-base-100 rounded-lg p-3">
                  <div className="text-sm">
                    <span className="font-medium">Investor {inv.index + 1}</span>
                    <span className="opacity-60 ml-2 font-mono">{inv.id}</span>
                    <span className="opacity-70 ml-2">· {inv.balance} shares</span>
                  </div>
                  {inv.verified ? (
                    <span className="badge badge-success">KYC ✓</span>
                  ) : (
                    <button
                      className="btn btn-xs btn-outline"
                      disabled={!configured || busy != null}
                      onClick={() =>
                        run(
                          `enable-${inv.index}`,
                          `/api/assets/${id}/market/enable`,
                          { investorIndex: inv.index },
                          `Investor ${inv.index + 1} verified (KYC granted).`,
                        )
                      }
                    >
                      {busy === `enable-${inv.index}` ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        "Verify"
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Step 4 — Investor: swap. */}
        <Section
          n={4}
          title="Swap HBAR → shares (investor)"
          desc="A verified investor swaps HBAR for shares. An unverified one is refused with a plain reason."
        >
          <div className="flex items-end gap-2 flex-wrap">
            <label className="form-control">
              <span className="label-text text-xs">Investor</span>
              <select
                className="select select-bordered select-sm"
                value={swapInvestor}
                onChange={e => setSwapInvestor(Number(e.target.value))}
              >
                {investors.map(inv => (
                  <option key={inv.index} value={inv.index}>
                    Investor {inv.index + 1} {inv.verified ? "(KYC ✓)" : "(unverified)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-control">
              <span className="label-text text-xs">HBAR in</span>
              <input
                type="number"
                min={1}
                className="input input-bordered input-sm w-24"
                value={swapHbar}
                onChange={e => setSwapHbar(Number(e.target.value))}
              />
            </label>
            <button
              className="btn btn-primary btn-sm"
              disabled={!configured || !tradable || busy != null}
              onClick={() =>
                run(
                  "swap",
                  `/api/assets/${id}/market/swap`,
                  { investorIndex: swapInvestor, hbar: swapHbar },
                  "Swap executed — shares received.",
                )
              }
            >
              {busy === "swap" ? <span className="loading loading-spinner loading-xs" /> : "Swap"}
            </button>
          </div>
        </Section>

        {/* Step 5 — Guardian: emergency stop. */}
        <Section
          n={5}
          title="Guardian emergency stop"
          desc={
            guardian
              ? `Native ThresholdKey account ${guardian.id} — needs ${guardian.threshold} of ${guardian.members} signatures.`
              : "Threshold-signed pause/unpause."
          }
        >
          <div className="flex items-end gap-2 flex-wrap">
            <label className="form-control">
              <span className="label-text text-xs">Signers</span>
              <select
                className="select select-bordered select-sm"
                value={guardianSigners}
                onChange={e => setGuardianSigners(Number(e.target.value))}
              >
                <option value={1}>1 member (below threshold)</option>
                <option value={2}>2 members (meets threshold)</option>
                <option value={3}>3 members</option>
              </select>
            </label>
            <button
              className="btn btn-error btn-sm"
              disabled={!configured || !hasToken || paused || busy != null}
              onClick={() =>
                run(
                  "pause",
                  `/api/assets/${id}/market/guardian`,
                  { pause: true, memberIndexes: memberRange(guardianSigners) },
                  "Pause succeeded — trading blocked.",
                )
              }
            >
              {busy === "pause" ? <span className="loading loading-spinner loading-xs" /> : "Pause"}
            </button>
            <button
              className="btn btn-success btn-sm"
              disabled={!configured || !paused || busy != null}
              onClick={() =>
                run(
                  "unpause",
                  `/api/assets/${id}/market/guardian`,
                  { pause: false, memberIndexes: memberRange(guardianSigners) },
                  "Unpause succeeded — trading restored.",
                )
              }
            >
              {busy === "unpause" ? <span className="loading loading-spinner loading-xs" /> : "Unpause"}
            </button>
          </div>
          <p className="text-xs opacity-60 mt-2">
            Try 1 member first: the transaction is refused (missing signature). Two members meet the 2-of-3 threshold.
          </p>
        </Section>
      </div>
    </div>
  );
};

const memberRange = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

const Section = ({
  n,
  title,
  desc,
  children,
}: {
  n: number;
  title: string;
  desc: string;
  children: React.ReactNode;
}) => (
  <div className="bg-base-200 rounded-lg p-4 mb-4">
    <div className="flex items-baseline gap-2 mb-1">
      <span className="badge badge-neutral badge-sm">{n}</span>
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>
    <p className="text-sm opacity-70 mb-3">{desc}</p>
    {children}
  </div>
);

export default Market;
