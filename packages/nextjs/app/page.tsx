"use client";

import Image from "next/image";
import Link from "next/link";
import type { NextPage } from "next";

// The demo walkthrough: each step links to the page that performs it. Reads left-to-right as the
// lifecycle a real-world asset goes through — submit, attest to quorum, mint, open a KYC-gated
// market, and (if needed) hit the guardian emergency stop.
const STORY: { n: number; title: string; body: string; href: string; cta: string }[] = [
  {
    n: 1,
    title: "Submit the asset",
    body: "Upload the document (IPFS), register CID + SHA-256, and open a per-asset HCS audit topic.",
    href: "/assets/new",
    cta: "Submit an asset",
  },
  {
    n: 2,
    title: "Attest to quorum",
    body: "Each attester approves and signs the scheduled mint. The network mints only at the k-th signature — no Solidity enforces it.",
    href: "/attest",
    cta: "Open the attester queue",
  },
  {
    n: 3,
    title: "Mint & lock up",
    body: "At quorum the token mints to the issuer. Confirm the mint to start the lockup; shares can't leave the treasury yet.",
    href: "/assets",
    cta: "View assets",
  },
  {
    n: 4,
    title: "Open the KYC-gated market",
    body: "After lockup: create the SaucerSwap V1 pair, grant it KYC, add liquidity, verify an investor, and swap. Unverified accounts are refused by the network.",
    href: "/assets",
    cta: "Go to an asset's market",
  },
  {
    n: 5,
    title: "Guardian emergency stop",
    body: "A native ThresholdKey(2-of-3) account pauses the token. One signature fails; two succeed. Swaps then fail with a plain explanation until unpause.",
    href: "/assets",
    cta: "Try pause / unpause",
  },
];

const Home: NextPage = () => {
  return (
    <div className="flex items-center flex-col grow">
      <div className="hedera-gradient dark:bg-none dark:bg-hedera-charcoal w-full py-14 px-5">
        <div className="flex flex-col items-center max-w-2xl mx-auto text-center">
          <Image
            src="/Hedera-Icon-White.svg"
            alt="Hedera icon"
            width={64}
            height={64}
            className="mb-5 hidden dark:block"
          />
          <Image src="/Hedera-Icon-Dark.svg" alt="Hedera icon" width={64} height={64} className="mb-5 dark:hidden" />
          <h1 className="text-3xl md:text-4xl font-bold text-white m-0">Attested RWA</h1>
          <p className="text-white/80 mt-3 mb-0 max-w-xl">
            Issue a real-world-asset token the network refuses to mint until a quorum of attesters signs — then trade it
            on a KYC-gated SaucerSwap pool. Every step is on an HCS audit trail.
          </p>
        </div>
      </div>

      <div className="w-full max-w-3xl mx-auto px-5 -mt-6 pb-16">
        <div className="bg-base-100 rounded-2xl shadow-lg p-6 md:p-8 border border-base-300">
          <h2 className="text-xl font-bold mb-1">Run the full story</h2>
          <p className="text-base-content/70 text-sm mb-6">
            Seed the demo (<code>yarn seed:demo</code>) and set your operator, then walk the five steps. Each links to
            the page that performs it; on-chain effects are linked to HashScan from the asset page.
          </p>

          <ol className="space-y-4">
            {STORY.map(step => (
              <li key={step.n} className="flex items-start gap-4">
                <span className="w-8 h-8 shrink-0 rounded-full hedera-gradient text-white flex items-center justify-center font-bold">
                  {step.n}
                </span>
                <div className="grow">
                  <h3 className="font-semibold m-0">{step.title}</h3>
                  <p className="text-sm text-base-content/70 m-0 mt-0.5 mb-2">{step.body}</p>
                  <Link href={step.href} className="btn btn-xs btn-primary">
                    {step.cta} →
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <Link href="/assets" className="btn btn-outline">
            Assets
          </Link>
          <Link href="/debug" className="btn btn-outline">
            Debug Contracts
          </Link>
          <Link href="/blockexplorer" className="btn btn-outline">
            Block Explorer
          </Link>
        </div>

        <p className="text-xs text-base-content/50 text-center mt-6">
          Testnet demo. The token carries no legal title to any asset. See the README disclaimer.
        </p>
      </div>
    </div>
  );
};

export default Home;
