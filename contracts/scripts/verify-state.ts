import { network } from "hardhat";
import { parseAbi, formatUnits, getAddress } from "viem";

const { viem } = await network.connect();
const publicClient = await viem.getPublicClient();

const ESCROW = getAddress("0xDCe58c9739a9F629cdFf840F9DA15AC82495B933");
const ADAPTER = getAddress("0xF2B99E27196809aFd35A5C1E1F0747A0540E51b6");
const USDC = getAddress("0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f");
const aUSDC = getAddress("0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC");
const SETTLEMENT = getAddress("0x2ED54fB830F51C5519AAfF5698dab4DAC71163b2");
const AAVE_POOL = getAddress("0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27");

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const escrowAbi = parseAbi([
  "function dealCount() view returns (uint256)",
  "function getDeal(uint256) view returns ((uint256 id, address depositor, address counterparty, uint256 amount, uint8 yieldSplitCounterparty, uint8 status, uint256 timeout, bytes32 dealHash, uint256 createdAt, uint256 fundedAt, uint256 disputedAt))",
]);

console.log("=== ON-CHAIN STATE VERIFICATION (Base Sepolia) ===\n");

// Check contracts exist
const escrowCode = await publicClient.getCode({ address: ESCROW });
console.log("Escrow has code:", escrowCode ? `YES (${escrowCode.length} chars)` : "NO");

const adapterCode = await publicClient.getCode({ address: ADAPTER });
console.log("Adapter has code:", adapterCode ? `YES (${adapterCode.length} chars)` : "NO");

// Deal count
const dealCount = await publicClient.readContract({ address: ESCROW, abi: escrowAbi, functionName: "dealCount" });
console.log(`\nDeal count: ${dealCount}`);

// Check all deals
const statusMap = ["Created", "Funded", "Settled", "Disputed", "TimedOut", "Cancelled"];
for (let i = 1n; i <= dealCount; i++) {
  const deal = await publicClient.readContract({ address: ESCROW, abi: escrowAbi, functionName: "getDeal", args: [i] });
  console.log(`\nDeal #${i}:`);
  console.log(`  Status: ${statusMap[deal.status] ?? deal.status}`);
  console.log(`  Amount: ${formatUnits(deal.amount, 6)} USDC`);
  console.log(`  Depositor: ${deal.depositor}`);
  console.log(`  Counterparty: ${deal.counterparty}`);
  console.log(`  Created: ${new Date(Number(deal.createdAt) * 1000).toISOString()}`);
  console.log(`  Funded:  ${deal.fundedAt > 0n ? new Date(Number(deal.fundedAt) * 1000).toISOString() : "N/A"}`);
}

// Balances
console.log("\n=== BALANCES ===");
const adapterAUsdc = await publicClient.readContract({ address: aUSDC, abi: erc20, functionName: "balanceOf", args: [ADAPTER] });
console.log(`Adapter aUSDC: ${formatUnits(adapterAUsdc, 6)}`);

const escrowUsdc = await publicClient.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [ESCROW] });
console.log(`Escrow USDC: ${formatUnits(escrowUsdc, 6)}`);

const settlementUsdc = await publicClient.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [SETTLEMENT] });
console.log(`Settlement USDC: ${formatUnits(settlementUsdc, 6)}`);

const deadBal = await publicClient.readContract({ address: USDC, abi: erc20, functionName: "balanceOf", args: [getAddress("0x000000000000000000000000000000000000dEaD")] });
console.log(`Counterparty (0xdead) USDC: ${formatUnits(deadBal, 6)}`);

// Verify the key transactions
console.log("\n=== TX VERIFICATION ===");

const txHashes: Record<string, `0x${string}`> = {
  "Approve": "0x9b40ae5cb1232ef0daec9a5ade85e9636a622b9277a0d97a95a88d4d4be3d01d",
  "Create Deal": "0x33778e176f863b27758dc9298ba4f602d29f2847253d452b4609da2376678eb6",
  "Fund Deal": "0x633d5baf629effdb33908f02d206bc9b710665bc15948dc7ebd4b3c5ff1c8b9f",
  "Settle Deal": "0xa499d67e26a76d210d399479f355edc3953bd407fce23f0181cf9c44d83953f4",
};

for (const [name, hash] of Object.entries(txHashes)) {
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash });
    console.log(`\n[${name}] ${hash}`);
    console.log(`  Status: ${receipt.status}`);
    console.log(`  Block: ${receipt.blockNumber}`);
    console.log(`  Gas used: ${receipt.gasUsed}`);
    console.log(`  Logs: ${receipt.logs.length}`);
    for (const log of receipt.logs) {
      const knownAddrs: Record<string, string> = {
        [USDC.toLowerCase()]: "USDC",
        [aUSDC.toLowerCase()]: "aUSDC",
        [ESCROW.toLowerCase()]: "Escrow",
        [ADAPTER.toLowerCase()]: "Adapter",
        [SETTLEMENT.toLowerCase()]: "Settlement",
        [AAVE_POOL.toLowerCase()]: "AavePool",
      };
      const label = knownAddrs[log.address.toLowerCase()] ?? log.address;
      console.log(`    ${label}: topics=${log.topics.length}, data=${log.data.slice(0, 42)}...`);
    }
  } catch (e: any) {
    console.log(`\n[${name}] ${hash}`);
    console.log(`  ERROR: ${e.shortMessage?.slice(0, 100) ?? e.message?.slice(0, 100)}`);
  }
}

console.log("\n=== BLOCK EXPLORER LINKS ===");
for (const [name, hash] of Object.entries(txHashes)) {
  console.log(`${name}: https://sepolia.basescan.org/tx/${hash}`);
}
console.log(`\nEscrow contract: https://sepolia.basescan.org/address/${ESCROW}`);
console.log(`Adapter contract: https://sepolia.basescan.org/address/${ADAPTER}`);
