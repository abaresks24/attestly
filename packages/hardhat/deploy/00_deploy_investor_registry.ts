import type { HardhatRuntimeEnvironment } from "hardhat/types";
import type { DeployFunction } from "hardhat-deploy/types";

import { getDeployGasPrice } from "../utils/getDeployGasPrice";

/// InvestorRegistry: the deployer becomes the admin who approves verified investors.
const deployInvestorRegistry: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  await deploy("InvestorRegistry", {
    from: deployer,
    args: [deployer],
    log: true,
    autoMine: true,
    gasLimit: "3000000",
    gasPrice: await getDeployGasPrice(hre),
  });
};

deployInvestorRegistry.tags = ["InvestorRegistry"];
export default deployInvestorRegistry;
