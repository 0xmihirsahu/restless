import { network } from "hardhat";
import { parseAbi, getAddress, formatUnits, keccak256, toHex, parseUnits } from "viem";

const { viem } = await network.connect();
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
const chainId = await publicClient.getChainId();

const ESCROW = getAddress("0x52Bd9308B7c5f2f6362449C750BC35f57294D630");
const USDC = getAddress("0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f");

const abi = parseAbi([
  "function dealCount() view returns (uint256)",
  "function paused() view returns (bool)",
  "function owner() view returns (address)",
  "function token() view returns (address)",
  "function getDeal(uint256) view returns ((uint256 id, address depositor, address counterparty, uint256 amount, uint8 yieldSplitCounterparty, uint8 status, uint256 timeout, bytes32 dealHash, uint256 createdAt, uint256 fundedAt, uint256 disputedAt))",
  "function createDeal((address counterparty, uint256 amount, uint8 yieldSplitCounterparty, uint256 timeout, bytes32 dealHash) params) returns (uint256)",
  "function fundDeal(uint256)",
]);

console.log(`Chain: ${chainId}`);
console.log(`Escrow: ${ESCROW}`);
console.log(`Deployer: ${deployer.account.address}`);

// Check basic state
const dealCount = await publicClient.readContract({ address: ESCROW, abi, functionName: "dealCount" });
console.log(`dealCount: ${dealCount}`);

const paused = await publicClient.readContract({ address: ESCROW, abi, functionName: "paused" });
console.log(`paused: ${paused}`);

const owner = await publicClient.readContract({ address: ESCROW, abi, functionName: "owner" });
console.log(`owner: ${owner}`);

const token = await publicClient.readContract({ address: ESCROW, abi, functionName: "token" });
console.log(`token: ${token}`);

// Check all existing deals
for (let i = 0n; i <= dealCount; i++) {
  const deal = await publicClient.readContract({ address: ESCROW, abi, functionName: "getDeal", args: [i] });
  console.log(`\nDeal ${i}:`, JSON.stringify(deal, (_, v) => typeof v === "bigint" ? v.toString() : v));
}

// Try creating a new deal and check receipt carefully
console.log("\n--- Creating new deal ---");
const counterparty = getAddress("0x000000000000000000000000000000000000dEaD");
const amount = parseUnits("5", 6);
const dealHash = keccak256(toHex("debug test"));

const createHash = await deployer.writeContract({
  address: ESCROW, abi, functionName: "createDeal",
  args: [{ counterparty, amount, yieldSplitCounterparty: 100, timeout: 86400n, dealHash }] as const,
  chain: deployer.chain,
});
console.log("createDeal tx:", createHash);

const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
console.log("status:", receipt.status);
console.log("gasUsed:", receipt.gasUsed.toString());
console.log("logs count:", receipt.logs.length);
for (const log of receipt.logs) {
  console.log(`  log from ${log.address}, topics: ${log.topics.length}, data: ${log.data.slice(0, 66)}...`);
  if (log.topics.length >= 2) {
    console.log(`    topic0: ${log.topics[0]}`);
    console.log(`    topic1 (dealId): ${BigInt(log.topics[1]!)}`);
  }
}

// Check dealCount after
const dealCountAfter = await publicClient.readContract({ address: ESCROW, abi, functionName: "dealCount" });
console.log(`\ndealCount after: ${dealCountAfter}`);

// Check the new deal
const newDeal = await publicClient.readContract({ address: ESCROW, abi, functionName: "getDeal", args: [dealCountAfter] });
console.log(`Deal ${dealCountAfter}:`, JSON.stringify(newDeal, (_, v) => typeof v === "bigint" ? v.toString() : v));
