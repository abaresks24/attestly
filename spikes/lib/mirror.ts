// Mirror node REST helpers with propagation-aware retry.
// The testnet mirror node lags consensus by a few seconds, so every read retries
// until a predicate holds or the timeout elapses.
import { TESTNET, sleep } from "./hedera.js";

async function raw(path: string): Promise<any> {
  const url = path.startsWith("http") ? path : `${TESTNET.mirror}${path}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`mirror ${res.status} for ${url}`);
  return res.json();
}

/** GET a mirror path, retrying while the result is missing or `until` returns false. */
export async function mirrorGet(
  path: string,
  opts: { until?: (data: any) => boolean; timeoutMs?: number; intervalMs?: number } = {},
): Promise<any> {
  const { until = (d) => d != null, timeoutMs = 30_000, intervalMs = 2_000 } = opts;
  const deadline = Date.now() + timeoutMs;
  let last: any = null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    last = await raw(path);
    if (last != null && until(last)) return last;
    if (Date.now() >= deadline) return last;
    await sleep(intervalMs);
  }
}

export const tokenInfo = (tokenId: string) => mirrorGet(`/tokens/${tokenId}`);

export const scheduleInfo = (scheduleId: string) => mirrorGet(`/schedules/${scheduleId}`);

/** Waits until the schedule reports an executed_timestamp (or times out). */
export const waitScheduleExecuted = (scheduleId: string, timeoutMs = 30_000) =>
  mirrorGet(`/schedules/${scheduleId}`, {
    until: (d) => d?.executed_timestamp != null,
    timeoutMs,
  });

/** Returns the {kyc_status, freeze_status, balance} of a token for an account, or null. */
export async function tokenRelationship(accountId: string, tokenId: string): Promise<any> {
  const data = await mirrorGet(`/accounts/${accountId}/tokens?token.id=${tokenId}`);
  return data?.tokens?.find((t: any) => t.token_id === tokenId) ?? null;
}

export const contractActions = (txIdOrHash: string) =>
  mirrorGet(`/contracts/results/${txIdOrHash}/actions`);

export const exchangeRate = () => mirrorGet(`/network/exchangerate`);
