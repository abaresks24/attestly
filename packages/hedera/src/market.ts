// KYC-gated market operations on SaucerSwap V1 (venue chosen in the feasibility phase; V2 pool
// creation is blocked on testnet). Pair/liquidity/swap reuse the flow proven in spike S1b. The
// guardian emergency stop is a native ThresholdKey(2 of 3) account calling the registry — no
// multisig contract.
import {
  AccountAllowanceApproveTransaction,
  AccountId,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  PrivateKey,
  TokenAssociateTransaction,
  TokenId,
  TransactionId,
  type Client,
} from "@hiero-ledger/sdk";
import { ethers } from "ethers";
import { SAUCERSWAP_V1, EXCHANGE_RATE_PRECOMPILE } from "./constants.js";
import { entityLongZero, idToEvmAddress } from "./evm.js";
import { contractIdFromEvm } from "./mirror.js";
import { provider, registryAs } from "./registry.js";

const FACTORY_ABI = [
  "function createPair(address,address) payable returns (address)",
  "function getPair(address,address) view returns (address)",
  "function pairCreateFee() view returns (uint256)",
];
const ROUTER_ABI = [
  "function addLiquidityETH(address token,uint amountTokenDesired,uint amountTokenMin,uint amountETHMin,address to,uint deadline) payable returns (uint,uint,uint)",
  "function swapExactETHForTokens(uint amountOutMin,address[] path,address to,uint deadline) payable returns (uint[])",
];
const RATE_ABI = ["function tinycentsToTinybars(uint256) returns (uint256)"];
const INVESTOR_REGISTRY_ABI = ["function approve(address investor)", "function isVerified(address) view returns (bool)"];

const walletFor = (derKey: string) => new ethers.Wallet("0x" + PrivateKey.fromStringECDSA(derKey).toStringRaw(), provider());
const tinybarToWeibar = (tinybar: bigint) => tinybar * 10n ** 10n;

/** Creates the V1 pair (empty) and returns its ids. The pair is CREATE2-deployed, not long-zero. */
export async function createPair(issuerDerKey: string, tokenId: string): Promise<{ pairEvm: string; pairId: string }> {
  const factory = new ethers.Contract(entityLongZero(SAUCERSWAP_V1.factory), FACTORY_ABI, walletFor(issuerDerKey));
  const rate = new ethers.Contract(EXCHANGE_RATE_PRECOMPILE, RATE_ABI, provider());
  const feeTinybar: bigint = await rate.tinycentsToTinybars.staticCall(await factory.pairCreateFee());
  const tokenEvm = idToEvmAddress(tokenId);
  const whbar = entityLongZero(SAUCERSWAP_V1.whbarToken);
  // HTS self-association inside pair creation is gas-heavy.
  await (await factory.createPair(tokenEvm, whbar, { value: tinybarToWeibar(feeTinybar + 100n), gasLimit: 9_000_000 })).wait();
  const pairEvm: string = await factory.getPair(tokenEvm, whbar);
  return { pairEvm, pairId: await contractIdFromEvm(pairEvm) };
}

/** Resolves the V1 pair for a token (zero address if none created yet). Read-only, no key needed. */
export async function getPairEvm(tokenId: string): Promise<string> {
  const factory = new ethers.Contract(entityLongZero(SAUCERSWAP_V1.factory), FACTORY_ABI, provider());
  return factory.getPair(idToEvmAddress(tokenId), entityLongZero(SAUCERSWAP_V1.whbarToken));
}

/** finalize(assetId, pair): the registry grants KYC to the pair (only contract that must hold the token). */
export async function finalizeAsset(issuerDerKey: string, registryEvm: string, assetId: number, pairEvm: string): Promise<void> {
  await (await registryAs(registryEvm, issuerDerKey).finalize(assetId, pairEvm, { gasLimit: 1_000_000 })).wait();
}

/** Approves the router to pull shares, then adds token/HBAR liquidity to the pair. */
export async function addLiquidity(
  client: Client,
  p: { issuerId: string; issuerEvm: string; issuerDerKey: string; tokenId: string; shareAmount: number; hbarAmount: number },
): Promise<void> {
  await (
    await (
      await new AccountAllowanceApproveTransaction()
        .approveTokenAllowance(TokenId.fromString(p.tokenId), AccountId.fromString(p.issuerId), AccountId.fromString(SAUCERSWAP_V1.router), p.shareAmount)
        .freezeWith(client)
        .sign(PrivateKey.fromStringECDSA(p.issuerDerKey))
    ).execute(client)
  ).getReceipt(client);

  const router = new ethers.Contract(entityLongZero(SAUCERSWAP_V1.router), ROUTER_ABI, walletFor(p.issuerDerKey));
  const deadline = Math.floor(Date.now() / 1000) + 600;
  // The LP NFT recipient must be the issuer's ALIAS EVM address, not its long-zero (HTS rejects the
  // long-zero of an aliased account with INVALID_ALIAS_KEY — same gotcha as grantTokenKyc in spike S4).
  await (
    await router.addLiquidityETH(idToEvmAddress(p.tokenId), p.shareAmount, 0, 0, p.issuerEvm, deadline, {
      value: tinybarToWeibar(BigInt(p.hbarAmount) * 100_000_000n),
      gasLimit: 8_000_000,
    })
  ).wait();
}

/**
 * Admin approves the investor in InvestorRegistry, the investor associates the token, then enables
 * the asset (the registry grants KYC). Association must precede the KYC grant: auto-association only
 * fires on receipt, and receiving requires KYC — so we associate explicitly to break the deadlock.
 */
export async function enableInvestor(
  client: Client,
  p: {
    adminDerKey: string;
    investorRegistryEvm: string;
    investorId: string;
    investorEvm: string;
    investorDerKey: string;
    tokenId: string;
    registryEvm: string;
    assetId: number;
  },
): Promise<void> {
  const ir = new ethers.Contract(p.investorRegistryEvm, INVESTOR_REGISTRY_ABI, walletFor(p.adminDerKey));
  await (await ir.approve(p.investorEvm, { gasLimit: 200_000 })).wait();

  await (
    await (
      await new TokenAssociateTransaction()
        .setAccountId(AccountId.fromString(p.investorId))
        .setTokenIds([TokenId.fromString(p.tokenId)])
        .freezeWith(client)
        .sign(PrivateKey.fromStringECDSA(p.investorDerKey))
    ).execute(client)
  ).getReceipt(client);

  await (await registryAs(p.registryEvm, p.investorDerKey).enableAsset(p.assetId, { gasLimit: 1_000_000 })).wait();
}

/** Investor swaps HBAR for shares. Returns the swap tx hash. */
export async function swapHbarForShares(investorDerKey: string, tokenId: string, hbarIn: number): Promise<string> {
  const router = new ethers.Contract(entityLongZero(SAUCERSWAP_V1.router), ROUTER_ABI, walletFor(investorDerKey));
  const path = [entityLongZero(SAUCERSWAP_V1.whbarToken), idToEvmAddress(tokenId)];
  const investorEvm = new ethers.Wallet("0x" + PrivateKey.fromStringECDSA(investorDerKey).toStringRaw()).address;
  const tx = await router.swapExactETHForTokens(0, path, investorEvm, Math.floor(Date.now() / 1000) + 600, {
    value: tinybarToWeibar(BigInt(hbarIn) * 100_000_000n),
    gasLimit: 6_000_000,
  });
  const r = await tx.wait();
  return r?.hash ?? "";
}

/**
 * Guardian pause/unpause: a ContractExecuteTransaction paid by the native ThresholdKey guardian
 * account and signed by `memberKeys`. With fewer than the threshold it fails; with the threshold it
 * succeeds. This is the multisig-without-a-multisig-contract pattern.
 */
export async function guardianSetPause(
  client: Client,
  p: { registryId: string; assetId: number; guardianId: string; memberKeys: PrivateKey[]; pause: boolean },
): Promise<void> {
  let tx = new ContractExecuteTransaction()
    .setContractId(ContractId.fromString(p.registryId))
    .setGas(1_000_000)
    .setFunction(p.pause ? "pause" : "unpause", new ContractFunctionParameters().addUint256(p.assetId))
    .setTransactionId(TransactionId.generate(AccountId.fromString(p.guardianId)))
    .freezeWith(client);
  for (const key of p.memberKeys) tx = await tx.sign(key);
  await (await tx.execute(client)).getReceipt(client);
}
