// SaucerSwap V2 helpers for spike S1: ABI fragments, math, and the on-chain pool-creation fee.
import { ethers } from "ethers";
import { SAUCERSWAP_V2, TESTNET, entityLongZero } from "./hedera.js";

export const SS = {
  factory: entityLongZero(SAUCERSWAP_V2.factory),
  positionManager: entityLongZero(SAUCERSWAP_V2.positionManager),
  swapRouter: entityLongZero(SAUCERSWAP_V2.swapRouter),
  whbarToken: entityLongZero(SAUCERSWAP_V2.whbarToken),
};

export const FACTORY_ABI = [
  "function mintFee() view returns (uint256)",
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
];

export const POSITION_MANAGER_ABI = [
  "function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) payable returns (address pool)",
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function refundETH() payable",
  "function multicall(bytes[] data) payable returns (bytes[] results)",
];

export const SWAP_ROUTER_ABI = [
  "function exactInput((bytes path,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum)) payable returns (uint256 amountOut)",
];

export function provider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(TESTNET.hashio, TESTNET.chainId);
}

const EXCHANGE_RATE_PRECOMPILE = "0x0000000000000000000000000000000000000168";
const EXCHANGE_RATE_ABI = ["function tinycentsToTinybars(uint256) returns (uint256)"];

/**
 * Pool-creation fee in tinybars. We convert Factory.mintFee() (tinycents) with the SAME on-chain
 * exchange-rate precompile (0x168) the pool contract uses, so msg.value matches its "PCF" check
 * exactly rather than drifting against the mirror node's rate snapshot.
 */
export async function poolCreateFeeTinybar(p: ethers.JsonRpcProvider): Promise<bigint> {
  const factory = new ethers.Contract(SS.factory, FACTORY_ABI, p);
  const tinycent: bigint = await factory.mintFee();
  const rate = new ethers.Contract(EXCHANGE_RATE_PRECOMPILE, EXCHANGE_RATE_ABI, p);
  return await rate.tinycentsToTinybars.staticCall(tinycent);
}

/** tinybars -> weibars (Hedera EVM native value uses 18 decimals; 1 tinybar = 1e10 weibars). */
export const tinybarToWeibar = (tinybar: bigint): bigint => tinybar * 10n ** 10n;

/** Encodes a UniswapV3-style path: token(20B) fee(3B) token(20B). */
export function encodePath(tokens: string[], fees: number[]): string {
  let path = "0x";
  for (let i = 0; i < tokens.length; i++) {
    path += tokens[i].slice(2);
    if (i < fees.length) path += fees[i].toString(16).padStart(6, "0");
  }
  return path;
}

/** Integer square root for bigints (Newton's method). */
export function isqrt(value: bigint): bigint {
  if (value < 0n) throw new Error("isqrt of negative");
  if (value < 2n) return value;
  let x = value;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }
  return x;
}

/** sqrtPriceX96 for an initial pool price of amount1/amount0 (raw units). */
export function sqrtPriceX96(amount0: bigint, amount1: bigint): bigint {
  return isqrt((amount1 << 192n) / amount0);
}

// Full-range ticks for a given tick spacing.
export function fullRangeTicks(spacing: number): { lower: number; upper: number } {
  const max = Math.floor(887272 / spacing) * spacing;
  return { lower: -max, upper: max };
}
