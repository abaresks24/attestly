// Default deployed contracts on testnet (see docs/TESTNET_VERIFICATION.md). Override with env after a
// fresh `yarn deploy:testnet`. The Next.js app reads addresses from its generated deployedContracts.ts.
export function registryEvmDefault(): string {
  return process.env.ASSET_REGISTRY_EVM ?? "0xB461DD05E0E5C803ac11110E51A9DdCAd0c0Ab62";
}

export function investorRegistryEvmDefault(): string {
  return process.env.INVESTOR_REGISTRY_EVM ?? "0xbcB2237B6FB03390bDEC0b0A58998472563fE48b";
}
