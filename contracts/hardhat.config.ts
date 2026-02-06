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
    accounts: process.env.SEPOLIA_PRIVATE_KEY
      ? [process.env.SEPOLIA_PRIVATE_KEY]
      : [],
  };
}

if (process.env.BASE_SEPOLIA_RPC_URL) {
  networks.baseSepolia = {
    type: "http",
    chainType: "l1",
    url: process.env.BASE_SEPOLIA_RPC_URL,
    accounts: process.env.SEPOLIA_PRIVATE_KEY
      ? [process.env.SEPOLIA_PRIVATE_KEY]
      : [],
  };
}

export default defineConfig({
  plugins: [HardhatToolboxViem],
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
    },
  },
  networks,
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY ?? "",
    },
  },
});
