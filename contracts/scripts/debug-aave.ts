import { network } from "hardhat";
import { parseAbi, formatUnits, getAddress } from "viem";

const { viem } = await network.connect();
const publicClient = await viem.getPublicClient();
const chainId = await publicClient.getChainId();
const [deployer] = await viem.getWalletClients();

console.log(`Chain: ${chainId}`);

const isSepolia = chainId === 11155111;
const USDC = getAddress(isSepolia ? "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8" : "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f");
const aUSDC = getAddress(isSepolia ? "0x16dA4541aD1807f4443d92D26044C1147406EB80" : "0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC");
const POOL = getAddress(isSepolia ? "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951" : "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27");

const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
]);

// Check aUSDC total supply (= total USDC deposited in Aave)
const aUsdcTotalSupply = await publicClient.readContract({
  address: aUSDC, abi: erc20, functionName: "totalSupply",
});
console.log(`aUSDC total supply: ${formatUnits(aUsdcTotalSupply, 6)} USDC`);

// Check supply cap from config
const configAbi = parseAbi(["function getConfiguration(address asset) view returns (uint256)"]);
const configRaw = await publicClient.readContract({
  address: POOL, abi: configAbi, functionName: "getConfiguration", args: [USDC],
});
const supplyCap = (configRaw >> 116n) & ((1n << 36n) - 1n);
console.log(`Supply cap: ${supplyCap} (whole USDC units)`);
console.log(`Supply cap in USDC: ${formatUnits(supplyCap * 1000000n, 6)}`);
console.log(`Headroom: ${supplyCap > 0n ? formatUnits(supplyCap * 1000000n - aUsdcTotalSupply, 6) : "unlimited"} USDC`);

// Check USDC balance of deployer
const myBal = await publicClient.readContract({
  address: USDC, abi: erc20, functionName: "balanceOf", args: [deployer.account.address],
});
console.log(`\nYour USDC balance: ${formatUnits(myBal, 6)}`);

// Try a test supply to see exact error
if (myBal > 0n) {
  const supplyAbi = parseAbi([
    "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
    "function approve(address spender, uint256 amount) returns (bool)",
  ]);
  const testAmount = 1000000n; // 1 USDC
  try {
    // Approve pool
    const appTx = await deployer.writeContract({
      address: USDC, abi: supplyAbi, functionName: "approve",
      args: [POOL, testAmount], chain: deployer.chain,
    });
    await publicClient.waitForTransactionReceipt({ hash: appTx });
    console.log("Approved pool, trying supply of 1 USDC...");

    const supplyTx = await deployer.writeContract({
      address: POOL, abi: supplyAbi, functionName: "supply",
      args: [USDC, testAmount, deployer.account.address, 0],
      chain: deployer.chain,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: supplyTx });
    console.log(`Supply succeeded! tx: ${supplyTx}`);

    // Withdraw it back
    const withdrawAbi = parseAbi([
      "function withdraw(address asset, uint256 amount, address to) returns (uint256)",
    ]);
    const wdTx = await deployer.writeContract({
      address: POOL, abi: withdrawAbi, functionName: "withdraw",
      args: [USDC, testAmount, deployer.account.address],
      chain: deployer.chain,
    });
    await publicClient.waitForTransactionReceipt({ hash: wdTx });
    console.log("Withdrew back successfully");
  } catch (e: any) {
    console.log(`Supply test failed: ${e.shortMessage ?? e.message?.slice(0, 200)}`);
  }
}
