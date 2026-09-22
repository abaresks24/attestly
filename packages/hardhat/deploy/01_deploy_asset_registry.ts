import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { HTS_PRECOMPILE, rwaConfig } from "../config/rwa";
import { getDeployGasPrice } from "../utils/getDeployGasPrice";

/// Reads the guardian's EVM address from the demo keystore (written by `yarn seed:demo`). Falls back to
/// the deployer with a warning so the deploy still works before seeding or in a non-demo setup.
function resolveGuardian(deployer: string): string {
  const keystore = resolve(__dirname, "../../../.demo-keys.json");
  if (existsSync(keystore)) {
    const keys = JSON.parse(readFileSync(keystore, "utf8"));
    if (keys.guardian?.evmAddress) return keys.guardian.evmAddress;
  }
  console.warn("  no .demo-keys.json guardian found — using deployer as guardian (run yarn seed:demo first)");
  return deployer;
}

const deployAssetRegistry: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, get } = hre.deployments;

  const investorRegistry = await get("InvestorRegistry");
  const guardian = resolveGuardian(deployer);

  await deploy("AssetRegistry", {
    from: deployer,
    args: [guardian, investorRegistry.address, rwaConfig.lockupPeriodSeconds, HTS_PRECOMPILE],
    log: true,
    autoMine: true,
    gasLimit: "3000000",
    gasPrice: await getDeployGasPrice(hre),
  });

  const chainId = hre.network.config.chainId;
  if (chainId === 295 || chainId === 296) {
    const net = chainId === 295 ? "mainnet" : "testnet";
    const asset = await get("AssetRegistry");
    console.log(`\nHashScan:`);
    console.log(`  InvestorRegistry https://hashscan.io/${net}/contract/${investorRegistry.address}`);
    console.log(`  AssetRegistry    https://hashscan.io/${net}/contract/${asset.address}`);
  }
};

deployAssetRegistry.tags = ["AssetRegistry"];
deployAssetRegistry.dependencies = ["InvestorRegistry"];
export default deployAssetRegistry;
