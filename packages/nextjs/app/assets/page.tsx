"use client";

import Link from "next/link";
import type { NextPage } from "next";
import { useScaffoldReadContract } from "~~/hooks/scaffold-hbar";

const LIFECYCLE = [
  ["Submit", "Issuer uploads the document to IPFS and registers the asset. An HCS topic is created."],
  ["Create token", "A server route mints a token with a ThresholdKey supply key and the registry as KYC/pause key."],
  ["Attest", "Each attester records a decision and, if approving, signs the scheduled mint."],
  ["Mint", "At the quorum the network mints to the issuer; a lockup begins."],
  ["Finalize", "After the lockup, anyone opens trading — the registry grants KYC to the SaucerSwap pair."],
  ["Trade", "A verified investor enables the asset and swaps on SaucerSwap; the guardian can pause anytime."],
] as const;

const Assets: NextPage = () => {
  // Reads the deployed AssetRegistry when present; renders gracefully (0) without a deployment or env.
  const { data: assetCount } = useScaffoldReadContract({
    contractName: "AssetRegistry",
    functionName: "assetCount",
  });

  return (
    <div className="flex flex-col items-center grow w-full px-5 py-10">
      <div className="max-w-3xl w-full">
        <h1 className="text-3xl font-bold mb-2">Assets</h1>
        <p className="opacity-80 mb-6">
          Real-world assets issued through this template. The network refuses to mint a token until a quorum of
          attesters signs, and only KYC-verified accounts can hold it.
        </p>

        <div className="alert alert-info mb-8">
          <span>
            Demo mode needs testnet actors and deployed contracts. Run <code>yarn seed:demo</code> then{" "}
            <code>yarn deploy:testnet</code>, and set your operator in <code>.env</code>. Without configuration the app
            still runs; on-chain actions are disabled.
          </span>
        </div>

        <div className="stats bg-base-200 mb-8">
          <div className="stat">
            <div className="stat-title">Registered assets</div>
            <div className="stat-value">{assetCount !== undefined ? assetCount.toString() : "—"}</div>
          </div>
        </div>

        <h2 className="text-xl font-semibold mb-3">Lifecycle</h2>
        <ol className="space-y-3">
          {LIFECYCLE.map(([title, detail], i) => (
            <li key={title} className="flex gap-3">
              <span className="badge badge-primary badge-lg">{i + 1}</span>
              <div>
                <span className="font-medium">{title}</span> — <span className="opacity-80">{detail}</span>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8">
          <Link href="/" className="link">
            ← Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Assets;
