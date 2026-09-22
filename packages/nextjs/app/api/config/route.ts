import { NextResponse } from "next/server";
import { SAUCERSWAP_V1, loadOperator } from "@sh/hedera";

// Node runtime: this pulls the Hedera SDK, which is not Edge-compatible.
export const runtime = "nodejs";

/// Reports whether the server is configured for on-chain actions. The app boots and every route
/// returns 200 even when unconfigured; the UI uses this to show a setup notice.
export async function GET() {
  const operator = loadOperator();
  return NextResponse.json({
    configured: operator !== null,
    operatorId: operator ? operator.id.toString() : null,
    venue: "saucerswap-v1",
    router: SAUCERSWAP_V1.router,
  });
}
