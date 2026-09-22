// Hedera testnet endpoints and the addresses this template depends on.
// SaucerSwap venue is V1 (see docs/BUILD_PLAN.md G1: V2 pool creation is blocked on testnet by a
// misconfigured poolCreateFee). Sources are recorded in spikes/findings.json.

export const TESTNET = {
  mirror: "https://testnet.mirrornode.hedera.com/api/v1",
  jsonRpc: "https://testnet.hashio.io/api",
  chainId: 296,
  hashscan: "https://hashscan.io/testnet",
} as const;

// HTS system contract (KYC/pause key executor) and Schedule Service facade.
export const HTS_ADDRESS = "0x0000000000000000000000000000000000000167";
export const HSS_ADDRESS = "0x000000000000000000000000000000000000016b";

// Exchange-rate precompile: converts the SaucerSwap tinycent fee to tinybars on-chain.
export const EXCHANGE_RATE_PRECOMPILE = "0x0000000000000000000000000000000000000168";

// SaucerSwap V1 (UniswapV2 fork) testnet — the KYC-gated trading venue.
export const SAUCERSWAP_V1 = {
  factory: "0.0.9959",
  router: "0.0.19264",
  whbarToken: "0.0.15058",
} as const;
