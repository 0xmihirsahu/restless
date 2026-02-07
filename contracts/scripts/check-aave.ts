import { network } from "hardhat";
import { parseAbi, formatUnits } from "viem";

const { viem } = await network.connect();
const publicClient = await viem.getPublicClient();
const chainId = await publicClient.getChainId();

const USDC = chainId === 84532
  ? "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f" as const
  : "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8" as const;
const POOL = chainId === 84532
  ? "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27" as const
  : "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951" as const;
const aUsdcAddr = chainId === 84532
  ? "0x10F1A9D11CDf50041f3f8cB7191CBe2f31750ACC" as const
  : "0x16dA4541aD1807f4443d92D26044C1147406EB80" as const;
const adapterAddr = chainId === 84532
  ? "0x984342567Cc5980AcB7e51EED6A189e53A49DB30" as const
  : "0xC6A101B9a376d3b6aB7d4092658E66d718738600" as const;

console.log(`Chain: ${chainId}, USDC: ${USDC}, Pool: ${POOL}`);

const configAbi = parseAbi([
  "function getConfiguration(address asset) view returns (uint256)",
]);

try {
  const configRaw = await publicClient.readContract({
    address: POOL,
    abi: configAbi,
    functionName: "getConfiguration",
    args: [USDC],
  });

  console.log("Reserve config (raw):", configRaw.toString());
  const isActive = (configRaw >> 56n) & 1n;
  const isFrozen = (configRaw >> 57n) & 1n;
  const borrowEnabled = (configRaw >> 58n) & 1n;
  const isPaused = (configRaw >> 60n) & 1n;
  // Supply cap is bits 116-151 (36 bits)
  const supplyCap = (configRaw >> 116n) & ((1n << 36n) - 1n);
  console.log("isActive:", isActive === 1n ? "YES" : "NO");
  console.log("isFrozen:", isFrozen === 1n ? "YES" : "NO");
  console.log("borrowEnabled:", borrowEnabled === 1n ? "YES" : "NO");
  console.log("isPaused:", isPaused === 1n ? "YES" : "NO");
  console.log("supplyCap:", supplyCap.toString(), "(in whole token units, 0 = unlimited)");
} catch (e: any) {
  console.log("Error reading pool config:", e.message?.slice(0, 300));
}

const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const adapterAUsdcBal = await publicClient.readContract({
  address: aUsdcAddr,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [adapterAddr],
});
console.log("\nAdapter aUSDC balance:", formatUnits(adapterAUsdcBal, 6));
