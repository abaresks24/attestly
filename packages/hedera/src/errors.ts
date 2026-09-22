// Maps Hedera / HTS failures to readable messages, keeping the raw code visible (FR-7). Covers both
// native status codes and the wrapper string SaucerSwap's TransferHelper reverts with, which hides
// the underlying HTS code (see spike S1b).

const HTS_MESSAGES: Record<string, string> = {
  ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN: "This account is not KYC-verified for the asset, so it cannot hold or receive shares.",
  TOKEN_IS_PAUSED: "Trading is paused for this asset (the guardian triggered an emergency stop).",
  INVALID_SIGNATURE: "A required signature is missing — the attester quorum has not been reached yet.",
  TOKEN_NOT_ASSOCIATED_TO_ACCOUNT: "This account has not associated the asset token yet.",
  ACCOUNT_FROZEN_FOR_TOKEN: "This account is frozen for the asset token.",
  SCHEDULE_ALREADY_EXECUTED: "The scheduled mint has already executed.",
};

// Numeric HTS response codes surfaced by the contracts (int64) -> canonical name.
const HTS_CODES: Record<number, string> = {
  7: "INVALID_SIGNATURE",
  176: "ACCOUNT_KYC_NOT_GRANTED_FOR_TOKEN",
  184: "TOKEN_NOT_ASSOCIATED_TO_ACCOUNT",
  265: "TOKEN_IS_PAUSED",
};

export interface ReadableError {
  code: string;
  message: string;
}

/** Turns a raw error (status name, numeric HTS code, or a SaucerSwap wrapper string) into a message. */
export function explainError(raw: string | number): ReadableError {
  if (typeof raw === "number") {
    const name = HTS_CODES[raw] ?? `HTS_${raw}`;
    return { code: name, message: HTS_MESSAGES[name] ?? `Hedera returned status ${name}.` };
  }
  const text = raw.trim();
  // SaucerSwap's TransferHelper masks the HTS code; the common causes are KYC or pause.
  if (/safe token transfer failed/i.test(text)) {
    return {
      code: "SAUCERSWAP_TRANSFER_FAILED",
      message: "SaucerSwap could not move the asset — the recipient is likely not KYC-verified, or trading is paused.",
    };
  }
  for (const name of Object.keys(HTS_MESSAGES)) {
    if (text.includes(name)) return { code: name, message: HTS_MESSAGES[name] };
  }
  return { code: text, message: text };
}
