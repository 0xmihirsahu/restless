import "dotenv/config";
import { defineConfig } from "hardhat/config";
import HardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";

const networks: Record<string, any> = {
  hardhat: {
    type: "edr-simulated",
    chainType: "l1",
  },
};

if (process.env.SEPOLIA_RPC_URL) {
  networks.sepolia = {
    type: "http",
    chainType: "l1",
    url: process.env.SEPOLIA_RPC_URL,
    accounts: process.env.DEPLOYER_PRIVATE_KEY
      ? [process.env.DEPLOYER_PRIVATE_KEY]
      : [],
  };
}

if (process.env.ARB_SEPOLIA_RPC_URL) {
  networks.arbitrumSepolia = {
    type: "http",
    chainType: "l1",
    url: process.env.ARB_SEPOLIA_RPC_URL,
    accounts: process.env.DEPLOYER_PRIVATE_KEY
      ? [process.env.DEPLOYER_PRIVATE_KEY]
      : [],
  };
}

export default defineConfig({
  plugins: [HardhatToolboxViem],
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "shanghai",
    },
  },
  networks,
});
