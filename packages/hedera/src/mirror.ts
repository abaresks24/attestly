// Mirror node REST helpers with propagation-aware retry (the testnet mirror lags consensus by a
// few seconds, so reads retry until a predicate holds or the timeout elapses).
import { TESTNET } from "./constants.js";
import { sleep } from "./evm.js";

async function raw(path: string): Promise<any> {
  const url = path.startsWith("http") ? path : `${TESTNET.mirror}${path}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`mirror ${res.status} for ${url}`);
  return res.json();
}

export async function mirrorGet(
  path: string,
  opts: { until?: (data: any) => boolean; timeoutMs?: number; intervalMs?: number } = {},
): Promise<any> {
  const { until = (d) => d != null, timeoutMs = 30_000, intervalMs = 2_000 } = opts;
  const deadline = Date.now() + timeoutMs;
  let last: any = null;
  for (;;) {
    last = await raw(path);
    if (last != null && until(last)) return last;
    if (Date.now() >= deadline) return last;
    await sleep(intervalMs);
  }
}

export const tokenInfo = (tokenId: string) => mirrorGet(`/tokens/${tokenId}`);

export const accountInfo = (accountId: string) => mirrorGet(`/accounts/${accountId}`);

export const scheduleInfo = (scheduleId: string) => mirrorGet(`/schedules/${scheduleId}`);

/** Account HBAR balance from the mirror node (avoids busy consensus nodes for a simple read). */
export async function accountHbarBalance(accountId: string): Promise<number> {
  const data = await accountInfo(accountId);
  return (data?.balance?.balance ?? 0) / 1e8;
}

/** Resolves a CREATE2-deployed contract's EVM address to its Hedera 0.0.N id. */
export async function contractIdFromEvm(evmAddress: string): Promise<string> {
  const data = await mirrorGet(`/contracts/${evmAddress}`);
  if (!data?.contract_id) throw new Error(`no contract_id for ${evmAddress}`);
  return data.contract_id;
}
