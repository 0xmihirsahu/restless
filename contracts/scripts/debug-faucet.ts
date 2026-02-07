import { network } from "hardhat";
import { parseAbi, formatUnits, getAddress, decodeEventLog } from "viem";

const { viem } = await network.connect();
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();

const USDC = getAddress("0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f");
const FAUCET = getAddress("0xFc7215C9498Fc12b22Bc0ed335871Db4315f3885");

// Check the previous faucet tx
const prevTx = "0x9fc8aba56cb69cb5c5b4ff5419551e037b43a865840e9f2f88a1a47342439ec3" as `0x${string}`;
const receipt = await publicClient.getTransactionReceipt({ hash: prevTx });
console.log("Previous faucet tx status:", receipt.status);
console.log("Logs count:", receipt.logs.length);
for (const log of receipt.logs) {
  console.log("  Log from:", log.address, "topics:", log.topics.length, "data:", log.data.slice(0, 40) + "...");
}

// Check if the faucet has a different signature. Let's try getCode to see if it's a contract
const faucetCode = await publicClient.getCode({ address: FAUCET });
console.log("\nFaucet has code:", faucetCode ? `yes (${faucetCode.length} chars)` : "no");

// Also check the USDC token — does it have a public mint?
const usdcCode = await publicClient.getCode({ address: USDC });
console.log("USDC has code:", usdcCode ? `yes (${usdcCode.length} chars)` : "no");

// Try different faucet signature: mint(address, uint256) — 2 args, no token param
console.log("\n--- Trying alternative faucet: mint(address, uint256) ---");
try {
  const faucetAbi2 = parseAbi(["function mint(address to, uint256 amount)"]);
  const tx = await deployer.writeContract({
    address: FAUCET, abi: faucetAbi2, functionName: "mint",
    args: [deployer.account.address, 100000000n],
    chain: deployer.chain,
  });
  console.log("tx:", tx);
  await publicClient.waitForTransactionReceipt({ hash: tx });
  const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
  const bal = await publicClient.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [deployer.account.address] });
  console.log("USDC balance after:", formatUnits(bal, 6));
} catch (e: any) {
  console.log("Failed:", e.shortMessage?.slice(0, 100) ?? e.message?.slice(0, 100));
}

// Try faucet with different amount format (Aave faucet uses amount in whole units on some chains)
console.log("\n--- Trying faucet with large amount (in smallest units) ---");
try {
  const faucetAbi3 = parseAbi(["function mint(address token, address to, uint256 amount) returns (uint256)"]);
  const tx = await deployer.writeContract({
    address: FAUCET, abi: faucetAbi3, functionName: "mint",
    args: [USDC, deployer.account.address, 100000000000n], // 100k USDC
    chain: deployer.chain,
  });
  console.log("tx:", tx);
  await publicClient.waitForTransactionReceipt({ hash: tx });
  const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
  const bal = await publicClient.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [deployer.account.address] });
  console.log("USDC balance after:", formatUnits(bal, 6));
} catch (e: any) {
  console.log("Failed:", e.shortMessage?.slice(0, 100) ?? e.message?.slice(0, 100));
}
