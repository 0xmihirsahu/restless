/**
 * Redeploy RestlessEscrow + AaveYieldAdapter (fixes Aave rounding loss bug).
 * Adapter has one-time setEscrow lock, so must redeploy both.
 * Settlement stays the same.
 */
import { network } from "hardhat";
import { getAddress, parseAbi } from "viem";

const { viem } = await network.connect();
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
const chainId = await publicClient.getChainId();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Config per chain
const configs: Record<number, { usdc: string; aUsdc: string; aavePool: string; settlement: string }> = {
  84532: {
    usdc: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f",
    aUsdc: "0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC",
    aavePool: "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27",
    settlement: "0x2ED54fB830F51C5519AAfF5698dab4DAC71163b2",
  },
  11155111: {
    usdc: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
    aUsdc: "0x16dA4541aD1807f4443d92D26044C1147406EB80",
    aavePool: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
    settlement: "0x913997E266B5732Db47eD856Fe75F99983C471A8",
  },
};

const config = configs[chainId];
if (!config) throw new Error(`Unsupported chain: ${chainId}`);

const usdc = getAddress(config.usdc);
const aUsdc = getAddress(config.aUsdc);
const aavePool = getAddress(config.aavePool);
const settlement = getAddress(config.settlement);

console.log(`Chain: ${chainId}`);
console.log(`Deployer: ${deployer.account.address}`);

// 1. Deploy new AaveYieldAdapter
console.log("\n--- Deploying new AaveYieldAdapter ---");
const adapterArtifact = (await import("../artifacts/contracts/AaveYieldAdapter.sol/AaveYieldAdapter.json")).default;
const adapterHash = await deployer.deployContract({
  abi: adapterArtifact.abi,
  bytecode: adapterArtifact.bytecode as `0x${string}`,
  args: [usdc, aUsdc, aavePool],
  chain: deployer.chain,
});
console.log(`Deploy tx: ${adapterHash}`);
const adapterReceipt = await publicClient.waitForTransactionReceipt({ hash: adapterHash });
if (adapterReceipt.status === "reverted") throw new Error("Adapter deploy reverted");
const newAdapter = adapterReceipt.contractAddress!;
console.log(`New AaveYieldAdapter: ${newAdapter}`);
await sleep(3000);

// 2. Deploy new RestlessEscrow
console.log("\n--- Deploying new RestlessEscrow ---");
const escrowArtifact = (await import("../artifacts/contracts/RestlessEscrow.sol/RestlessEscrow.json")).default;
const escrowHash = await deployer.deployContract({
  abi: escrowArtifact.abi,
  bytecode: escrowArtifact.bytecode as `0x${string}`,
  args: [usdc, newAdapter, settlement],
  chain: deployer.chain,
});
console.log(`Deploy tx: ${escrowHash}`);
const escrowReceipt = await publicClient.waitForTransactionReceipt({ hash: escrowHash });
if (escrowReceipt.status === "reverted") throw new Error("Escrow deploy reverted");
const newEscrow = escrowReceipt.contractAddress!;
console.log(`New RestlessEscrow: ${newEscrow}`);
await sleep(3000);

// 3. Link adapter to escrow
console.log("\n--- Linking adapter to escrow ---");
const setEscrowAbi = parseAbi(["function setEscrow(address _escrow)"]);
const setHash = await deployer.writeContract({
  address: newAdapter,
  abi: setEscrowAbi,
  functionName: "setEscrow",
  args: [newEscrow],
  chain: deployer.chain,
});
console.log(`setEscrow tx: ${setHash}`);
const setReceipt = await publicClient.waitForTransactionReceipt({ hash: setHash });
console.log(`setEscrow status: ${setReceipt.status}`);

console.log("\n=== DEPLOYMENT COMPLETE ===");
console.log(`New AaveYieldAdapter: ${newAdapter}`);
console.log(`New RestlessEscrow:   ${newEscrow}`);
console.log(`Settlement (unchanged): ${settlement}`);
console.log("\nUpdate your e2e script and frontend config with these addresses!");
