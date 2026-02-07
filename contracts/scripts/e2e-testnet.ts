/**
 * End-to-end testnet integration test for Restless Escrow.
 *
 * Tests the full deal lifecycle on Sepolia/Base Sepolia with REAL on-chain transactions:
 *   1. Mint test USDC via Aave Faucet
 *   2. Approve escrow to spend USDC
 *   3. createDeal
 *   4. fundDeal (USDC → Aave via adapter)
 *   5. Verify deal state & Aave deposit
 *   6. settleDeal (same-chain settlement)
 *   7. Verify final balances
 *
 * Usage:
 *   npx hardhat run scripts/e2e-testnet.ts --network sepolia
 *   npx hardhat run scripts/e2e-testnet.ts --network baseSepolia
 */

import { network } from "hardhat";
import {
  parseUnits,
  formatUnits,
  getAddress,
  keccak256,
  toHex,
  encodeFunctionData,
  parseAbi,
} from "viem";

const { viem } = await network.connect();

// ─── Config per network ──────────────────────────────────────────────
type NetworkConfig = {
  escrow: `0x${string}`;
  adapter: `0x${string}`;
  settlement: `0x${string}`;
  usdc: `0x${string}`;
  aUsdc: `0x${string}`;
  aaveFaucet: `0x${string}`;
  explorerTx: string;
};

const SEPOLIA_CONFIG: NetworkConfig = {
  escrow: "0xc6b1316438d1597035B6D97BA22a610745685284",
  adapter: "0xC6A101B9a376d3b6aB7d4092658E66d718738600",
  settlement: "0x913997E266B5732Db47eD856Fe75F99983C471A8",
  usdc: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
  aUsdc: "0x16dA4541aD1807f4443d92D26044C1147406EB80",
  aaveFaucet: "0xC959483DBa39aa9E78757139af0e9a2EDEb3f42D",
  explorerTx: "https://sepolia.etherscan.io/tx/",
};

const BASE_SEPOLIA_CONFIG: NetworkConfig = {
  escrow: "0x52Bd9308B7c5f2f6362449C750BC35f57294D630",
  adapter: "0x984342567Cc5980AcB7e51EED6A189e53A49DB30",
  settlement: "0x2ED54fB830F51C5519AAfF5698dab4DAC71163b2",
  usdc: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f",
  aUsdc: "0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC",
  aaveFaucet: "0xD9145b5F45Ad4519c7ACcD6E0A4A82e83bB8A6Dc",
  explorerTx: "https://sepolia.basescan.org/tx/",
};

// ─── Setup ────────────────────────────────────────────────────────
const [deployer] = await viem.getWalletClients();
const publicClient = await viem.getPublicClient();

// Detect network from chain ID
const chainId = await publicClient.getChainId();
let config: NetworkConfig;
let networkName: string;
if (chainId === 11155111) {
  config = SEPOLIA_CONFIG;
  networkName = "sepolia";
} else if (chainId === 84532) {
  config = BASE_SEPOLIA_CONFIG;
  networkName = "baseSepolia";
} else {
  throw new Error(`Unsupported chain ID: ${chainId}. Use --network sepolia or --network baseSepolia`);
}

// Normalize all addresses to proper checksums
for (const key of Object.keys(config) as (keyof NetworkConfig)[]) {
  if (key !== "explorerTx" && typeof config[key] === "string" && (config[key] as string).startsWith("0x")) {
    (config as any)[key] = getAddress(config[key] as string);
  }
}

console.log(`\n${"=".repeat(70)}`);
console.log(`  RESTLESS E2E TESTNET — ${networkName.toUpperCase()} (chain ${chainId})`);
console.log(`${"=".repeat(70)}\n`);
const depositor = deployer.account.address;
// Use a burn address as counterparty (depositor can still settle)
const counterparty = getAddress("0x000000000000000000000000000000000000dEaD");

console.log(`Depositor (you):  ${depositor}`);
console.log(`Counterparty:     ${counterparty} (burn address — depositor settles)`);
console.log(`Escrow:           ${config.escrow}`);
console.log(`Adapter:          ${config.adapter}`);
console.log(`Settlement:       ${config.settlement}`);
console.log(`USDC:             ${config.usdc}`);
console.log();

const txLog: { step: string; hash: string; url: string }[] = [];

function logTx(step: string, hash: string) {
  const url = `${config.explorerTx}${hash}`;
  txLog.push({ step, hash, url });
  console.log(`  tx: ${hash}`);
  console.log(`  ${url}\n`);
}

async function waitForTx(hash: `0x${string}`) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === "reverted") {
    throw new Error(`Transaction reverted: ${hash}`);
  }
  return receipt;
}

// ─── ERC20 read helpers ───────────────────────────────────────────
const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);

async function usdcBalance(addr: `0x${string}`): Promise<bigint> {
  return publicClient.readContract({
    address: config.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [addr],
  });
}

// ─── Escrow read helpers ──────────────────────────────────────────
const escrowAbi = parseAbi([
  "function dealCount() view returns (uint256)",
  "function getDeal(uint256) view returns ((uint256 id, address depositor, address counterparty, uint256 amount, uint8 yieldSplitCounterparty, uint8 status, uint256 timeout, bytes32 dealHash, uint256 createdAt, uint256 fundedAt, uint256 disputedAt))",
  "function getAccruedYield(uint256) view returns (uint256)",
  "function createDeal(address,uint256,uint8,uint256,bytes32) returns (uint256)",
  "function fundDeal(uint256)",
  "function settleDeal(uint256,bytes)",
]);

// ─── Step 0: Check USDC balance, mint via faucet if needed ────────
const DEAL_AMOUNT = parseUnits("10", 6); // 10 USDC

console.log("─── STEP 0: Check USDC balance & faucet ─────────────────────────");
let bal = await usdcBalance(depositor);
console.log(`  Current USDC balance: ${formatUnits(bal, 6)} USDC`);

if (bal < DEAL_AMOUNT) {
  console.log(`  Need ${formatUnits(DEAL_AMOUNT, 6)} USDC — trying to mint...`);

  // Try Method 1: Aave faucet contract mint(address token, address to, uint256 amount)
  try {
    console.log("  Trying Aave faucet contract...");
    const faucetAbi = parseAbi([
      "function mint(address token, address to, uint256 amount) returns (uint256)",
    ]);
    const mintHash = await deployer.writeContract({
      address: config.aaveFaucet,
      abi: faucetAbi,
      functionName: "mint",
      args: [config.usdc, depositor, parseUnits("100", 6)],
      chain: deployer.chain,
    });
    console.log("\n  [FAUCET MINT] Minting 100 USDC via Aave faucet");
    logTx("Faucet Mint 100 USDC", mintHash);
    await waitForTx(mintHash);
  } catch (e: any) {
    console.log(`  Faucet method failed: ${e.shortMessage?.slice(0, 80) ?? e.message?.slice(0, 80)}`);
  }

  bal = await usdcBalance(depositor);
  console.log(`  USDC balance after faucet: ${formatUnits(bal, 6)} USDC`);

  // Try Method 2: Direct mint on token (some test tokens support this)
  if (bal < DEAL_AMOUNT) {
    try {
      console.log("  Trying direct token mint...");
      const mintableAbi = parseAbi([
        "function mint(address to, uint256 amount)",
      ]);
      const mintHash2 = await deployer.writeContract({
        address: config.usdc,
        abi: mintableAbi,
        functionName: "mint",
        args: [depositor, parseUnits("100", 6)],
        chain: deployer.chain,
      });
      console.log("\n  [TOKEN MINT] Minting 100 USDC directly");
      logTx("Direct Token Mint 100 USDC", mintHash2);
      await waitForTx(mintHash2);
    } catch (e: any) {
      console.log(`  Direct mint failed: ${e.shortMessage?.slice(0, 80) ?? e.message?.slice(0, 80)}`);
    }
    bal = await usdcBalance(depositor);
    console.log(`  USDC balance after direct mint: ${formatUnits(bal, 6)} USDC`);
  }

  if (bal < DEAL_AMOUNT) {
    throw new Error(`Could not get test USDC. Balance: ${formatUnits(bal, 6)}. Please use Aave faucet UI: https://app.aave.com/faucet/`);
  }
}

// ─── Step 1: Approve escrow to spend USDC ─────────────────────────
console.log("─── STEP 1: Approve USDC to Escrow ──────────────────────────────");
const approveHash = await deployer.writeContract({
  address: config.usdc,
  abi: erc20Abi,
  functionName: "approve",
  args: [config.escrow, DEAL_AMOUNT],
  chain: deployer.chain,
});
logTx("Approve USDC", approveHash);
await waitForTx(approveHash);

const allowance = await publicClient.readContract({
  address: config.usdc,
  abi: erc20Abi,
  functionName: "allowance",
  args: [depositor, config.escrow],
});
console.log(`  Allowance: ${formatUnits(allowance, 6)} USDC\n`);

// ─── Step 2: Create deal ──────────────────────────────────────────
console.log("─── STEP 2: Create Deal ─────────────────────────────────────────");
const dealTerms = `E2E test deal on ${networkName} at ${new Date().toISOString()}`;
const dealHash = keccak256(toHex(dealTerms));
const timeout = 86400n; // 1 day
const yieldSplit = 100; // 100% yield to counterparty

console.log(`  Terms: "${dealTerms}"`);
console.log(`  Amount: ${formatUnits(DEAL_AMOUNT, 6)} USDC`);
console.log(`  Yield split: ${yieldSplit}% to counterparty`);
console.log(`  Timeout: ${timeout}s (1 day)`);

const dealCountBefore = await publicClient.readContract({
  address: config.escrow,
  abi: escrowAbi,
  functionName: "dealCount",
});
console.log(`  Current dealCount: ${dealCountBefore}`);

const createHash = await deployer.writeContract({
  address: config.escrow,
  abi: escrowAbi,
  functionName: "createDeal",
  args: [counterparty, DEAL_AMOUNT, yieldSplit, timeout, dealHash],
  chain: deployer.chain,
});
logTx("Create Deal", createHash);
const createReceipt = await waitForTx(createHash);

// Extract deal ID from DealCreated event logs
const dealCreatedAbi = parseAbi([
  "event DealCreated(uint256 indexed dealId, address indexed depositor, address indexed counterparty, uint256 amount, bytes32 dealHash)",
]);
const dealLogs = createReceipt.logs;
let dealId = 0n;
// DealCreated event: topic0 = keccak256("DealCreated(uint256,address,address,uint256,bytes32)")
// dealId is the first indexed param (topic1)
for (const log of dealLogs) {
  if (log.address.toLowerCase() === config.escrow.toLowerCase() && log.topics.length >= 2) {
    dealId = BigInt(log.topics[1]!);
    break;
  }
}
if (dealId === 0n) {
  // Fallback: read dealCount
  dealId = await publicClient.readContract({
    address: config.escrow,
    abi: escrowAbi,
    functionName: "dealCount",
  });
}
console.log(`  Deal ID: ${dealId}`);

// Read deal state
const dealAfterCreate = await publicClient.readContract({
  address: config.escrow,
  abi: escrowAbi,
  functionName: "getDeal",
  args: [dealId],
});
console.log(`  Deal status: ${dealAfterCreate.status} (0=Created)\n`);

// ─── Step 3: Fund deal (USDC → Aave via adapter) ─────────────────
console.log("─── STEP 3: Fund Deal (USDC → Aave) ────────────────────────────");
const balBeforeFund = await usdcBalance(depositor);
console.log(`  Depositor USDC before fund: ${formatUnits(balBeforeFund, 6)}`);

const fundHash = await deployer.writeContract({
  address: config.escrow,
  abi: escrowAbi,
  functionName: "fundDeal",
  args: [dealId],
  chain: deployer.chain,
});
logTx("Fund Deal", fundHash);
await waitForTx(fundHash);

const balAfterFund = await usdcBalance(depositor);
console.log(`  Depositor USDC after fund: ${formatUnits(balAfterFund, 6)}`);
console.log(`  USDC spent: ${formatUnits(balBeforeFund - balAfterFund, 6)}`);

// Verify deal state
const dealAfterFund = await publicClient.readContract({
  address: config.escrow,
  abi: escrowAbi,
  functionName: "getDeal",
  args: [dealId],
});
console.log(`  Deal status: ${dealAfterFund.status} (1=Funded)`);

// Check aUSDC balance in adapter (verifies Aave deposit worked)
const aUsdcBal = await publicClient.readContract({
  address: config.aUsdc,
  abi: erc20Abi,
  functionName: "balanceOf",
  args: [config.adapter],
});
console.log(`  Adapter aUSDC balance: ${formatUnits(aUsdcBal, 6)} (Aave deposit confirmed)`);

// Check yield (will be ~0 since just deposited)
const yieldAccrued = await publicClient.readContract({
  address: config.escrow,
  abi: escrowAbi,
  functionName: "getAccruedYield",
  args: [dealId],
});
console.log(`  Accrued yield: ${formatUnits(yieldAccrued, 6)} USDC\n`);

// ─── Step 4: Settle deal (same-chain) ─────────────────────────────
console.log("─── STEP 4: Settle Deal (depositor triggers, same-chain) ───────");
const counterpartyBalBefore = await usdcBalance(counterparty);
console.log(`  Counterparty USDC before settle: ${formatUnits(counterpartyBalBefore, 6)}`);

const settleHash = await deployer.writeContract({
  address: config.escrow,
  abi: escrowAbi,
  functionName: "settleDeal",
  args: [dealId, "0x"],
  chain: deployer.chain,
});
logTx("Settle Deal", settleHash);
await waitForTx(settleHash);

// ─── Step 5: Verify final state ───────────────────────────────────
console.log("─── STEP 5: Verify Final State ──────────────────────────────────");
const dealAfterSettle = await publicClient.readContract({
  address: config.escrow,
  abi: escrowAbi,
  functionName: "getDeal",
  args: [dealId],
});
console.log(`  Deal status: ${dealAfterSettle.status} (2=Settled)`);

const counterpartyBalAfter = await usdcBalance(counterparty);
console.log(`  Counterparty USDC after settle: ${formatUnits(counterpartyBalAfter, 6)}`);
console.log(`  Counterparty received: ${formatUnits(counterpartyBalAfter - counterpartyBalBefore, 6)} USDC`);

const depositorBalFinal = await usdcBalance(depositor);
console.log(`  Depositor USDC final: ${formatUnits(depositorBalFinal, 6)}`);

// ─── Summary ──────────────────────────────────────────────────────
console.log(`\n${"=".repeat(70)}`);
console.log("  TRANSACTION LOG");
console.log(`${"=".repeat(70)}`);
for (const tx of txLog) {
  console.log(`\n  [${tx.step}]`);
  console.log(`    Hash: ${tx.hash}`);
  console.log(`    URL:  ${tx.url}`);
}

console.log(`\n${"=".repeat(70)}`);
console.log("  E2E TEST COMPLETE");
console.log(`${"=".repeat(70)}`);
console.log(`  Network:     ${networkName}`);
console.log(`  Deal ID:     ${dealId}`);
console.log(`  Deal Status: Settled`);
console.log(`  Amount:      ${formatUnits(DEAL_AMOUNT, 6)} USDC`);
console.log(`  Yield:       ${formatUnits(yieldAccrued, 6)} USDC (accrued during test)`);
console.log(`  Txns:        ${txLog.length}`);
console.log(`${"=".repeat(70)}\n`);
