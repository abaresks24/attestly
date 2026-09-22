// S1b — KYC-gated token on SaucerSwap V1 (fallback venue).
//
// V2 pool creation is blocked on testnet by a misconfigured poolCreateFee ($1M). V1's pairCreateFee
// is ~$2, so V1 is a viable venue. This spike answers the real question the template depends on:
// can a KYC-gated HTS token be pooled and swapped on a public AMM at all?
//
// Key ordering: create the (empty) pair first, THEN grant KYC to the pair and router, THEN add
// liquidity — because a KYC grant needs the account to exist and be associated, which happens when
// the pair is created. PASS if a verified investor swaps and an unverified one is refused.
import {
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TokenMintTransaction,
  TokenGrantKycTransaction,
  TokenAssociateTransaction,
  AccountAllowanceApproveTransaction,
  TokenId,
  AccountId,
  type Client,
} from "@hashgraph/sdk";
import { ethers } from "ethers";
import { loadOperator, testnetClient, link, idToEvmAddress, entityLongZero } from "./lib/hedera.js";
import { loadKeystore, keyOf, idOf, type TestAccount } from "./lib/accounts.js";
import { mirrorGet, contractActions, contractIdFromEvm } from "./lib/mirror.js";
import { provider, tinybarToWeibar } from "./lib/saucerswap.js";

const V1_FACTORY = "0.0.9959";
const V1_ROUTER = "0.0.19264";
const WHBAR_TOKEN = "0.0.15058";

const SHARE_LIQUIDITY = 500_000n; // raw (5000.00 shares)
const HBAR_LIQUIDITY = 10n;
const SWAP_HBAR_IN = 1n;

const FACTORY_ABI = [
  "function createPair(address,address) payable returns (address)",
  "function getPair(address,address) view returns (address)",
  "function pairCreateFee() view returns (uint256)",
];
const ROUTER_ABI = [
  "function addLiquidityETH(address token,uint amountTokenDesired,uint amountTokenMin,uint amountETHMin,address to,uint deadline) payable returns (uint amountToken,uint amountETH,uint liquidity)",
  "function swapExactETHForTokens(uint amountOutMin,address[] path,address to,uint deadline) payable returns (uint[] amounts)",
];
const RATE_ABI = ["function tinycentsToTinybars(uint256) returns (uint256)"];

function need(store: Record<string, TestAccount>, name: string): TestAccount {
  const a = store[name];
  if (!a) throw new Error(`Missing '${name}' — run: yarn accounts`);
  return a;
}
function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}
function walletFor(a: TestAccount, p: ethers.JsonRpcProvider) {
  return new ethers.Wallet("0x" + keyOf(a).toStringRaw(), p);
}
async function grantKyc(client: Client, token: string, accountId: string): Promise<string> {
  try {
    await (
      await new TokenGrantKycTransaction()
        .setTokenId(TokenId.fromString(token))
        .setAccountId(AccountId.fromString(accountId))
        .execute(client)
    ).getReceipt(client);
    return "GRANTED";
  } catch (e: any) {
    return e?.status?.toString() ?? String(e?.message ?? e);
  }
}
async function trace(hash: string) {
  try {
    const d = await contractActions(hash);
    for (const a of (d?.actions ?? []).filter((x: any) => /REVERT|ERROR/.test(x.result_data_type)))
      console.log(`    depth=${a.call_depth} ${a.call_operation_type} caller=${a.caller} to=${a.to} ${a.result_data_type} ${(a.result_data || "").slice(0, 40)}`);
  } catch {
    /* ignore */
  }
}

async function main() {
  const op = loadOperator();
  const client = testnetClient(op);
  const store = loadKeystore();
  const issuer = need(store, "issuer");
  const investor = need(store, "investor");
  const outsider = need(store, "outsider");
  const p = provider();
  const whbar = entityLongZero(WHBAR_TOKEN);

  console.log("== S1b: KYC-gated token on SaucerSwap V1 ==");

  // 1. Token (KYC key = pause key = operator), mint, associate + KYC accounts.
  const token = (
    await (
      await (
        await new TokenCreateTransaction()
          .setTokenName("Attested Share (S1v1)")
          .setTokenSymbol("ATTV1")
          .setTokenType(TokenType.FungibleCommon)
          .setSupplyType(TokenSupplyType.Finite)
          .setDecimals(2)
          .setInitialSupply(0)
          .setMaxSupply(1_000_000)
          .setTreasuryAccountId(idOf(issuer))
          .setSupplyKey(op.key.publicKey)
          .setKycKey(op.key.publicKey)
          .setPauseKey(op.key.publicKey)
          .freezeWith(client)
          .sign(keyOf(issuer))
      ).execute(client)
    ).getReceipt(client)
  ).tokenId!.toString();
  const tokenEvm = idToEvmAddress(token);
  console.log(`token ${token}  ${link.token(token)}`);
  await (await new TokenMintTransaction().setTokenId(token).setAmount(1_000_000).execute(client)).getReceipt(client);
  for (const a of [investor, outsider])
    await (
      await (await new TokenAssociateTransaction().setAccountId(idOf(a)).setTokenIds([token]).freezeWith(client).sign(keyOf(a))).execute(client)
    ).getReceipt(client);
  console.log(`KYC issuer=${await grantKyc(client, token, issuer.id)} investor=${await grantKyc(client, token, investor.id)}`);

  // 2. Create the (empty) pair, paying the pair-creation fee (msg.value is in tinybars on Hedera).
  const issuerWallet = walletFor(issuer, p);
  const factory = new ethers.Contract(entityLongZero(V1_FACTORY), FACTORY_ABI, issuerWallet);
  const rate = new ethers.Contract("0x0000000000000000000000000000000000000168", RATE_ABI, p);
  const feeTinybar: bigint = await rate.tinycentsToTinybars.staticCall(await factory.pairCreateFee());
  console.log(`pairCreateFee ${Number(feeTinybar) / 1e8} HBAR; creating pair...`);
  try {
    // HTS token association inside pair creation is gas-heavy; give it generous headroom.
    const t = await factory.createPair(tokenEvm, whbar, { value: tinybarToWeibar(feeTinybar + 100n), gasLimit: 9_000_000 });
    await t.wait();
  } catch (e: any) {
    console.log("createPair FAILED:", e?.shortMessage ?? e?.message);
    if (e?.receipt?.hash) await trace(e.receipt.hash);
    throw new Error("S1b blocked at createPair");
  }
  const pairEvm: string = await factory.getPair(tokenEvm, whbar);
  const pairId = await contractIdFromEvm(pairEvm); // V1 pairs are CREATE2-deployed, not long-zero
  console.log(`pair ${pairEvm} (${pairId})  ${link.contract(pairId)}`);

  // 3. THE KEY TEST: grant KYC to the pair (it holds the token). In UniV2 the token moves directly
  //    issuer -> pair, so the router itself never holds it; its grant is best-effort.
  const grants = {
    pair: await grantKyc(client, token, pairId),
    router: await grantKyc(client, token, V1_ROUTER),
  };
  console.log(`contract KYC grants: ${JSON.stringify(grants)}`);

  // 4. Approve the router to pull shares, then add liquidity to the existing pair.
  await (
    await (
      await new AccountAllowanceApproveTransaction()
        .approveTokenAllowance(TokenId.fromString(token), idOf(issuer), AccountId.fromString(V1_ROUTER), Number(SHARE_LIQUIDITY))
        .freezeWith(client)
        .sign(keyOf(issuer))
    ).execute(client)
  ).getReceipt(client);

  const router = new ethers.Contract(entityLongZero(V1_ROUTER), ROUTER_ABI, issuerWallet);
  const deadline = Math.floor(Date.now() / 1000) + 600;
  console.log("adding liquidity...");
  try {
    const t = await router.addLiquidityETH(tokenEvm, SHARE_LIQUIDITY, 0, 0, issuer.evmAddress, deadline, {
      value: tinybarToWeibar(HBAR_LIQUIDITY * 100_000_000n),
      gasLimit: 8_000_000,
    });
    const r = await t.wait();
    console.log(`liquidity added; tx ${r?.hash}`);
  } catch (e: any) {
    console.log("addLiquidity FAILED:", e?.shortMessage ?? e?.message);
    if (e?.receipt?.hash) await trace(e.receipt.hash);
    throw new Error("S1b blocked at add-liquidity");
  }

  // 5. Verified investor swaps HBAR for shares.
  const investorRouter = new ethers.Contract(entityLongZero(V1_ROUTER), ROUTER_ABI, walletFor(investor, p));
  const before = Number((await mirrorGet(`/accounts/${investor.id}/tokens?token.id=${token}`))?.tokens?.[0]?.balance ?? 0);
  console.log("investor swapping 1 HBAR for shares...");
  const st = await investorRouter.swapExactETHForTokens(0, [whbar, tokenEvm], investor.evmAddress, Math.floor(Date.now() / 1000) + 600, {
    value: tinybarToWeibar(SWAP_HBAR_IN * 100_000_000n),
    gasLimit: 6_000_000,
  });
  await st.wait();
  const after = await mirrorGet(`/accounts/${investor.id}/tokens?token.id=${token}`, { until: (d) => Number(d?.tokens?.[0]?.balance ?? 0) > before });
  const gained = Number(after?.tokens?.[0]?.balance ?? 0) - before;
  assert(gained > 0, "investor did not receive shares");
  console.log(`investor received ${gained} share units`);

  // 6. Negative control: un-KYC'd outsider cannot receive shares.
  const outsiderRouter = new ethers.Contract(entityLongZero(V1_ROUTER), ROUTER_ABI, walletFor(outsider, p));
  let outsiderCode = "SWAP_SUCCEEDED_UNEXPECTEDLY";
  try {
    const t = await outsiderRouter.swapExactETHForTokens(0, [whbar, tokenEvm], outsider.evmAddress, Math.floor(Date.now() / 1000) + 600, {
      value: tinybarToWeibar(SWAP_HBAR_IN * 100_000_000n),
      gasLimit: 6_000_000,
    });
    await t.wait();
  } catch (e: any) {
    // Pull the real HTS status from the child-action trace (the pair->outsider transfer is refused).
    const hash = e?.receipt?.hash ?? e?.transactionHash;
    outsiderCode = e?.shortMessage ?? "REVERTED";
    if (hash) {
      const d = await contractActions(hash).catch(() => null);
      const errAction = (d?.actions ?? []).find((a: any) => a.to?.endsWith("0167") && /ERROR|REVERT/.test(a.result_data_type));
      if (errAction?.result_data) {
        const hex = errAction.result_data.replace(/^0x/, "");
        const decoded = Buffer.from(hex, "hex").toString().replace(/[^\x20-\x7e]/g, "");
        if (decoded) outsiderCode = decoded;
      }
    }
  }
  assert(outsiderCode !== "SWAP_SUCCEEDED_UNEXPECTEDLY", "outsider swap unexpectedly succeeded");
  console.log(`outsider swap refused: ${outsiderCode}`);

  console.log("\nS1b PASS (V1)");
  console.log(JSON.stringify({ token, pair: pairId, grants, investorGained: gained }));
  client.close();
}

main().catch((e) => {
  console.error("\nS1b FAIL/PARTIAL:", e?.message ?? e);
  process.exit(1);
});
