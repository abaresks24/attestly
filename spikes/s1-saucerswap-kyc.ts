// S1 — KYC-gated token in a SaucerSwap V2 pool (the decisive spike).
//
// Question: can we create a V2 pool for a token whose KYC key is active, add liquidity, and let a
// verified investor swap, while blocking unverified accounts?
//
// Passe A: KYC key held by the operator (simplest). We grant KYC to the accounts and the minimal
// set of SaucerSwap contracts that touch the token, then verify a swap moves shares to a verified
// investor and is refused for an unverified one.
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
import { loadOperator, testnetClient, link, idToEvmAddress } from "./lib/hedera.js";
import { loadKeystore, keyOf, idOf, type TestAccount } from "./lib/accounts.js";
import { mirrorGet, contractActions } from "./lib/mirror.js";
import {
  SS,
  FACTORY_ABI,
  POSITION_MANAGER_ABI,
  SWAP_ROUTER_ABI,
  provider,
  poolCreateFeeTinybar,
  tinybarToWeibar,
  encodePath,
  sqrtPriceX96,
  fullRangeTicks,
} from "./lib/saucerswap.js";

const FEE = 3000; // 0.30% tier
const SPACING = 60;
const SHARE_LIQUIDITY = 500_000n; // raw (5000.00 shares)
const HBAR_LIQUIDITY = 5n; // HBAR paired
const SWAP_HBAR_IN = 1n; // investor buys shares with 1 HBAR

function need(store: Record<string, TestAccount>, name: string): TestAccount {
  const a = store[name];
  if (!a) throw new Error(`Missing '${name}' in .keys.json — run: yarn accounts`);
  return a;
}
function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}
function walletFor(acct: TestAccount, p: ethers.JsonRpcProvider): ethers.Wallet {
  return new ethers.Wallet("0x" + keyOf(acct).toStringRaw(), p);
}

/** Native KYC grant (Passe A: operator holds the KYC key). Returns the resulting status name. */
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

/** Dumps the child-action trace of a failed contract tx to pinpoint the refusing account. */
async function traceFailure(txHash: string) {
  try {
    const data = await contractActions(txHash);
    const failing = (data?.actions ?? []).filter(
      (a: any) => a.result_data_type === "REVERT" || a.result_data_type === "ERROR",
    );
    console.log("  actions trace (failing frames):");
    for (const a of failing) {
      console.log(
        `    depth=${a.call_depth} ${a.call_operation_type} caller=${a.caller} recipient=${a.recipient} to=${a.to} data=${a.result_data}`,
      );
    }
  } catch (e: any) {
    console.log("  (could not fetch actions:", e?.message ?? e, ")");
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

  console.log("== S1 Passe A: KYC-gated token on SaucerSwap V2 ==");

  // 1. Token with KYC key = pause key = operator; no admin key; no custom fees.
  const token = (
    await (
      await (
        await new TokenCreateTransaction()
          .setTokenName("Attested Share (S1)")
          .setTokenSymbol("ATTS1")
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
  console.log(`token ${token}  ${link.token(token)}`);
  const tokenEvm = idToEvmAddress(token);

  await (
    await new TokenMintTransaction().setTokenId(token).setAmount(1_000_000).execute(client)
  ).getReceipt(client);

  // 2. Associate + KYC the investor and outsider; KYC the issuer (treasury already associated).
  for (const acct of [investor, outsider]) {
    await (
      await (
        await new TokenAssociateTransaction()
          .setAccountId(idOf(acct))
          .setTokenIds([token])
          .freezeWith(client)
          .sign(keyOf(acct))
      ).execute(client)
    ).getReceipt(client);
  }
  console.log(`KYC issuer=${await grantKyc(client, token, issuer.id)} investor=${await grantKyc(client, token, investor.id)}`);
  // Outsider is deliberately left un-KYC'd.

  // 3. Sort tokens and derive the initial price and amounts.
  const whbar = SS.whbarToken;
  const tokenIsToken0 = tokenEvm.toLowerCase() < whbar.toLowerCase();
  const token0 = tokenIsToken0 ? tokenEvm : whbar;
  const token1 = tokenIsToken0 ? whbar : tokenEvm;
  const shareRaw = SHARE_LIQUIDITY;
  const whbarRaw = HBAR_LIQUIDITY * 100_000_000n; // WHBAR has 8 decimals
  const amount0 = tokenIsToken0 ? shareRaw : whbarRaw;
  const amount1 = tokenIsToken0 ? whbarRaw : shareRaw;
  const price = sqrtPriceX96(amount0, amount1);
  const { lower, upper } = fullRangeTicks(SPACING);

  // 4. Create + initialize the pool (issuer pays the pool-creation fee via msg.value).
  const issuerWallet = walletFor(issuer, p);
  const pm = new ethers.Contract(SS.positionManager, POSITION_MANAGER_ABI, issuerWallet);
  const feeTinybar = await poolCreateFeeTinybar(p);
  const feeValue = tinybarToWeibar(feeTinybar); // exact, matching the contract's on-chain conversion
  console.log(`pool fee ${Number(feeTinybar) / 1e8} HBAR; creating pool ${token0}/${token1} fee ${FEE}`);
  const createTx = await pm.createAndInitializePoolIfNecessary(token0, token1, FEE, price, {
    value: feeValue,
    gasLimit: 3_000_000,
  });
  await createTx.wait();

  const factory = new ethers.Contract(SS.factory, FACTORY_ABI, p);
  const pool: string = await factory.getPool(token0, token1, FEE);
  const poolId = AccountId.fromSolidityAddress(pool).toString();
  console.log(`pool ${pool} (${poolId})  ${link.contract(poolId)}`);

  // 5. Grant KYC to the SaucerSwap contracts that will hold/route the token.
  const contractGrants: Record<string, string> = {};
  for (const [label, id] of [
    ["pool", poolId],
    ["positionManager", SS.positionManager],
    ["swapRouter", SS.swapRouter],
  ] as const) {
    const acctId = id.startsWith("0x") ? AccountId.fromSolidityAddress(id).toString() : id;
    contractGrants[label] = await grantKyc(client, token, acctId);
  }
  console.log(`contract KYC grants: ${JSON.stringify(contractGrants)}`);

  // 6. Approve the position manager to pull the issuer's shares, then add liquidity.
  await (
    await (
      await new AccountAllowanceApproveTransaction()
        .approveTokenAllowance(TokenId.fromString(token), idOf(issuer), AccountId.fromString(SS.positionManager.startsWith("0x") ? AccountId.fromSolidityAddress(SS.positionManager).toString() : SS.positionManager), Number(shareRaw))
        .freezeWith(client)
        .sign(keyOf(issuer))
    ).execute(client)
  ).getReceipt(client);

  const deadline = Math.floor(Date.now() / 1000) + 600;
  const mintParams = {
    token0,
    token1,
    fee: FEE,
    tickLower: lower,
    tickUpper: upper,
    amount0Desired: amount0,
    amount1Desired: amount1,
    amount0Min: 0,
    amount1Min: 0,
    recipient: issuer.evmAddress,
    deadline,
  };
  const mintData = pm.interface.encodeFunctionData("mint", [mintParams]);
  const refundData = pm.interface.encodeFunctionData("refundETH");
  console.log("adding liquidity...");
  try {
    const mintTx = await pm.multicall([mintData, refundData], {
      value: tinybarToWeibar(HBAR_LIQUIDITY * 100_000_000n),
      gasLimit: 6_000_000,
    });
    const r = await mintTx.wait();
    console.log(`liquidity added; tx ${r?.hash}`);
  } catch (e: any) {
    console.log("liquidity FAILED:", e?.shortMessage ?? e?.message ?? e);
    if (e?.receipt?.hash) await traceFailure(e.receipt.hash);
    else if (e?.transactionHash) await traceFailure(e.transactionHash);
    throw new Error("S1 blocked at add-liquidity");
  }

  // 7. Verified investor swaps HBAR for shares.
  const path = encodePath([whbar, tokenEvm], [FEE]);
  const investorRouter = new ethers.Contract(SS.swapRouter, SWAP_ROUTER_ABI, walletFor(investor, p));
  const swapParams = {
    path,
    recipient: investor.evmAddress,
    deadline: Math.floor(Date.now() / 1000) + 600,
    amountIn: SWAP_HBAR_IN * 100_000_000n,
    amountOutMinimum: 0,
  };
  console.log("investor swapping 1 HBAR for shares...");
  const before = await mirrorGet(`/accounts/${investor.id}/tokens?token.id=${token}`);
  const beforeBal = Number(before?.tokens?.[0]?.balance ?? 0);
  const swapTx = await investorRouter.exactInput(swapParams, {
    value: tinybarToWeibar(SWAP_HBAR_IN * 100_000_000n),
    gasLimit: 3_000_000,
  });
  await swapTx.wait();
  const after = await mirrorGet(`/accounts/${investor.id}/tokens?token.id=${token}`, {
    until: (d) => Number(d?.tokens?.[0]?.balance ?? 0) > beforeBal,
  });
  const gained = Number(after?.tokens?.[0]?.balance ?? 0) - beforeBal;
  assert(gained > 0, "investor did not receive shares from the swap");
  console.log(`investor received ${gained} share units from the pool`);

  // 8. Negative control: an un-KYC'd outsider cannot receive shares.
  const outsiderRouter = new ethers.Contract(SS.swapRouter, SWAP_ROUTER_ABI, walletFor(outsider, p));
  let outsiderResult = "SWAP_SUCCEEDED_UNEXPECTEDLY";
  try {
    const t = await outsiderRouter.exactInput(
      { path, recipient: outsider.evmAddress, deadline: Math.floor(Date.now() / 1000) + 600, amountIn: SWAP_HBAR_IN * 100_000_000n, amountOutMinimum: 0 },
      { value: tinybarToWeibar(SWAP_HBAR_IN * 100_000_000n), gasLimit: 3_000_000 },
    );
    await t.wait();
  } catch (e: any) {
    outsiderResult = e?.shortMessage ?? e?.message ?? "REVERTED";
  }
  assert(outsiderResult !== "SWAP_SUCCEEDED_UNEXPECTEDLY", "outsider swap unexpectedly succeeded");
  console.log(`outsider swap refused: ${outsiderResult}`);

  console.log("\nS1 PASS (Passe A)");
  console.log(JSON.stringify({ token, pool: poolId, contractGrants, investorGained: gained }));
  client.close();
}

main().catch((e) => {
  console.error("\nS1 FAIL/PARTIAL:", e?.message ?? e);
  process.exit(1);
});
