import { network } from "hardhat";
import { parseAbi, getAddress, formatUnits } from "viem";

const { viem } = await network.connect();
const publicClient = await viem.getPublicClient();
const chainId = await publicClient.getChainId();
console.log("Chain:", chainId);

const USDC = getAddress("0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f");

// Check USDC owner
const ownerAbi = parseAbi(["function owner() view returns (address)"]);
try {
  const owner = await publicClient.readContract({ address: USDC, abi: ownerAbi, functionName: "owner" });
  console.log("USDC owner:", owner);

  // Check if owner has code (is it a contract?)
  const code = await publicClient.getCode({ address: owner });
  console.log("Owner is contract:", code ? `yes (${code.length} chars)` : "no (EOA)");

  // If owner is a contract, it might be the Faucet — try calling mint on it
  if (code && code.length > 2) {
    console.log("\nOwner is a contract — this is likely the Faucet!");
    console.log("Trying to call mint on the owner contract...");
    const faucetAbi = parseAbi([
      "function mint(address token, address to, uint256 amount) returns (uint256)",
    ]);
    const [deployer] = await viem.getWalletClients();
    const tx = await deployer.writeContract({
      address: owner, abi: faucetAbi, functionName: "mint",
      args: [USDC, deployer.account.address, 100000000n], // 100 USDC
      chain: deployer.chain,
    });
    console.log("tx:", tx);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    console.log("status:", receipt.status, "logs:", receipt.logs.length);

    const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
    const bal = await publicClient.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [deployer.account.address] });
    console.log("USDC balance:", formatUnits(bal, 6));
  }
} catch (e: any) {
  console.log("Error:", e.shortMessage?.slice(0, 150) ?? e.message?.slice(0, 150));
}

// Also try PoolAddressesProvider to find the pool admin
const providerAbi = parseAbi([
  "function getACLAdmin() view returns (address)",
  "function getPoolConfigurator() view returns (address)",
]);
const PROVIDER = getAddress("0xd449FeD49d9C443688d6816fE6872F21402e41de"); // Base Sepolia PoolAddressesProvider
try {
  const admin = await publicClient.readContract({ address: PROVIDER, abi: providerAbi, functionName: "getACLAdmin" });
  console.log("\nACL Admin:", admin);
} catch (e: any) {
  console.log("Provider read failed:", e.shortMessage?.slice(0, 100));
}
