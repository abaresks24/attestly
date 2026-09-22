// Central parameters for the Attested RWA template (PRD §6). Change these to adapt the demo:
// committee size and quorum, lockup and schedule windows, guardian threshold, and total shares.
// Mirrored in template.json so a developer sees them before instantiating.

export const rwaConfig = {
  /// Number of attesters whose keys form the token's ThresholdKey supply key.
  attesters: 3,
  /// Signatures required to mint (the k in ThresholdKey(k of n)).
  threshold: 2,
  /// Seconds shares stay locked in the treasury after mint before finalize can open trading.
  lockupPeriodSeconds: 10 * 60, // 10 min
  /// Long-term expiry (HIP-423) of the scheduled mint that collects attester signatures.
  scheduleExpirySeconds: 24 * 60 * 60, // 24 h
  /// Emergency guardian: a native ThresholdKey(threshold of members) account, not a multisig contract.
  guardian: { members: 3, threshold: 2 },
  /// Total shares minted, in raw units. With `decimals: 2`, 1_000_000 => 10,000.00 shares.
  totalShares: 1_000_000n,
  decimals: 2,
} as const;

/// HTS system contract address (Hedera). Used as the KYC/pause key executor in production.
export const HTS_PRECOMPILE = "0x0000000000000000000000000000000000000167";

export type RwaConfig = typeof rwaConfig;
