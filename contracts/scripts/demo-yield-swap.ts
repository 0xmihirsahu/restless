/**
 * RESTLESS DEMO — Yield-Earning Escrow with v4 Hook Settlement
 *
 * Demonstrates the full Restless value proposition:
 *   1. Alice creates a deal with Bob for 10 USDC
 *   2. Funds are deposited into Aave → earning yield immediately
 *   3. (Simulated) yield accrues over time → 2 USDC earned
 *   4. Deal settles via Uniswap v4 hook:
 *      - Bob receives 10 USDC principal (direct)
 *      - Yield (2 USDC) is auto-swapped to WETH via v4 pool
 *      - Bob receives WETH yield bonus
 *
 * "Your escrow, never idle."
 *
 * Usage:
 *   npx hardhat run scripts/demo-yield-swap.ts --network baseSepolia
 */

import { network } from "hardhat";
import {
  parseUnits,
  formatUnits,
  getAddress,
  keccak256,
  toHex,
  parseAbi,
  maxUint256,
  formatEther,
  parseEther,
} from "viem";

const { viem } = await network.connect();
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
const chainId = await publicClient.getChainId();

if (chainId !== 84532) throw new Error("This script only works on Base Sepolia (84532)");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForTx(hash: `0x${string}`) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === "reverted") throw new Error(`Transaction reverted: ${hash}`);
  await sleep(5000);
  return receipt;
}

// ─── Addresses ───────────────────────────────────────────────────
const USDC = getAddress("0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f");
const WETH = getAddress("0x4200000000000000000000000000000000000006");
const A_USDC = getAddress("0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC");
const ESCROW = getAddress("0xDCe58c9739a9F629cdFf840F9DA15AC82495B933");
const ADAPTER = getAddress("0xF2B99E27196809aFd35A5C1E1F0747A0540E51b6");
const SETTLEMENT = getAddress("0x2ED54fB830F51C5519AAfF5698dab4DAC71163b2");
const HOOK = getAddress("0x1D397343a67023148De2CaCA15c4C378DDc3C040");
const AAVE_POOL = getAddress("0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27");
const AAVE_FAUCET = getAddress("0xD9145b5F45Ad4519c7ACcD6E0A4A82e83bB8A6Dc");
const EXPLORER = "https://sepolia.basescan.org/tx/";

// ─── ABIs ────────────────────────────────────────────────────────
const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
]);

const faucetAbi = parseAbi([
  "function mint(address token, address to, uint256 amount) returns (uint256)",
]);

const aavePoolAbi = parseAbi([
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
]);

const escrowAbi = parseAbi([
  "function createDeal(address,uint256,uint8,uint256,bytes32) returns (uint256)",
  "function fundDeal(uint256)",
  "function settleDealWithHook(uint256,address)",
  "function getDeal(uint256) view returns ((uint256 id, address depositor, address counterparty, uint256 amount, uint8 yieldSplitCounterparty, uint8 status, uint256 timeout, bytes32 dealHash, uint256 createdAt, uint256 fundedAt, uint256 disputedAt))",
  "function getAccruedYield(uint256) view returns (uint256)",
]);

const txLog: { step: string; hash: string; explorer: string }[] = [];
function logTx(step: string, hash: string) {
  txLog.push({ step, hash, explorer: `${EXPLORER}${hash}` });
}

// ═══════════════════════════════════════════════════════════════════
// DEMO START
// ═══════════════════════════════════════════════════════════════════

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   ⚡ RESTLESS — Your Escrow, Never Idle ⚡                       ║
║                                                                  ║
║   P2P escrow where locked funds earn yield in Aave while         ║
║   waiting for deal completion.                                   ║
║                                                                  ║
║   This demo shows:                                               ║
║   • Funds deposited into Aave (earning yield immediately)        ║
║   • Yield auto-swapped to WETH via Uniswap v4 hook              ║
║   • Counterparty gets principal (USDC) + yield bonus (WETH)      ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);

const DEAL_AMOUNT = parseUnits("10", 6);     // 10 USDC deal
const YIELD_AMOUNT = parseUnits("2", 6);     // 2 USDC simulated yield
const counterparty = getAddress("0x000000000000000000000000000000000000dEaD");

// ─── SCENE 1: Create Deal ────────────────────────────────────────
console.log("━━━ SCENE 1: Alice creates a deal with Bob ━━━━━━━━━━━━━━━━━━━━");
console.log(`  Amount:       ${formatUnits(DEAL_AMOUNT, 6)} USDC`);
console.log(`  Yield split:  100% to counterparty (yield bonus)`);
console.log(`  Counterparty: ${counterparty}`);
console.log();

// Ensure USDC balance
const usdcBal = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [deployer.account.address] });
if (usdcBal < DEAL_AMOUNT + YIELD_AMOUNT) {
  console.log("  Minting USDC from faucet...");
  const mintHash = await deployer.writeContract({
    address: AAVE_FAUCET, abi: faucetAbi, functionName: "mint",
    args: [USDC, deployer.account.address, parseUnits("50", 6)],
    chain: deployer.chain,
  });
  await waitForTx(mintHash);
}

// Approve + Create
console.log("  Approving USDC...");
const appHash = await deployer.writeContract({
  address: USDC, abi: erc20Abi, functionName: "approve",
  args: [ESCROW, DEAL_AMOUNT], chain: deployer.chain,
});
await waitForTx(appHash);

const dealHash = keccak256(toHex(`restless demo ${Date.now()}`));
const createHash = await deployer.writeContract({
  address: ESCROW, abi: escrowAbi, functionName: "createDeal",
  args: [counterparty, DEAL_AMOUNT, 100, 86400n, dealHash],
  chain: deployer.chain,
});
logTx("Create Deal", createHash);
const createReceipt = await waitForTx(createHash);

let dealId = 0n;
for (const log of createReceipt.logs) {
  if (log.address.toLowerCase() === ESCROW.toLowerCase() && log.topics.length >= 2) {
    dealId = BigInt(log.topics[1]!);
    break;
  }
}
console.log(`  Deal #${dealId} created!\n`);

// ─── SCENE 2: Fund → Aave ───────────────────────────────────────
console.log("━━━ SCENE 2: Alice funds the deal — USDC goes to Aave ━━━━━━━━");
console.log(`  ${formatUnits(DEAL_AMOUNT, 6)} USDC → Aave V3 → aUSDC (earning yield)`);
console.log();

const fundHash = await deployer.writeContract({
  address: ESCROW, abi: escrowAbi, functionName: "fundDeal",
  args: [dealId], chain: deployer.chain,
});
logTx("Fund Deal → Aave", fundHash);
await waitForTx(fundHash);

const aUsdcAfterFund = await publicClient.readContract({
  address: A_USDC, abi: erc20Abi, functionName: "balanceOf", args: [ADAPTER],
});
console.log(`  Aave deposit confirmed: ${formatUnits(aUsdcAfterFund, 6)} aUSDC held by adapter`);
console.log(`  Yield is now accruing...\n`);

// ─── SCENE 3: Yield accrues ──────────────────────────────────────
console.log("━━━ SCENE 3: Time passes... yield accrues in Aave ━━━━━━━━━━━━");
console.log(`  (Simulating ${formatUnits(YIELD_AMOUNT, 6)} USDC yield — equivalent to ~2 weeks at current rates)`);
console.log();

// Mint USDC → supply to Aave → transfer aUSDC to adapter
const yieldMintHash = await deployer.writeContract({
  address: AAVE_FAUCET, abi: faucetAbi, functionName: "mint",
  args: [USDC, deployer.account.address, YIELD_AMOUNT],
  chain: deployer.chain,
});
await waitForTx(yieldMintHash);

const approveAaveHash = await deployer.writeContract({
  address: USDC, abi: erc20Abi, functionName: "approve",
  args: [AAVE_POOL, YIELD_AMOUNT], chain: deployer.chain,
});
await waitForTx(approveAaveHash);

const supplyHash = await deployer.writeContract({
  address: AAVE_POOL, abi: aavePoolAbi, functionName: "supply",
  args: [USDC, YIELD_AMOUNT, deployer.account.address, 0],
  chain: deployer.chain,
});
await waitForTx(supplyHash);

const myAUsdc = await publicClient.readContract({
  address: A_USDC, abi: erc20Abi, functionName: "balanceOf", args: [deployer.account.address],
});
const toTransfer = myAUsdc < YIELD_AMOUNT ? myAUsdc : YIELD_AMOUNT;
const transferHash = await deployer.writeContract({
  address: A_USDC, abi: erc20Abi, functionName: "transfer",
  args: [ADAPTER, toTransfer], chain: deployer.chain,
});
logTx("Yield Accrual (aUSDC injected)", transferHash);
await waitForTx(transferHash);

const totalAUsdc = await publicClient.readContract({
  address: A_USDC, abi: erc20Abi, functionName: "balanceOf", args: [ADAPTER],
});
const estimatedYield = totalAUsdc - aUsdcAfterFund;
console.log(`  Adapter aUSDC: ${formatUnits(totalAUsdc, 6)} (principal + yield)`);
console.log(`  Estimated yield: ${formatUnits(estimatedYield, 6)} USDC\n`);

// ─── SCENE 4: Settlement via v4 Hook ─────────────────────────────
console.log("━━━ SCENE 4: Deal settles — Uniswap v4 hook swaps yield ━━━━━━");
console.log(`  Principal (${formatUnits(DEAL_AMOUNT, 6)} USDC) → counterparty directly`);
console.log(`  Yield (~${formatUnits(estimatedYield, 6)} USDC) → v4 hook → swap to WETH → counterparty`);
console.log();

// Snapshot counterparty balances before
const cpUsdcBefore = await publicClient.readContract({
  address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [counterparty],
});
const cpWethBefore = await publicClient.readContract({
  address: WETH, abi: erc20Abi, functionName: "balanceOf", args: [counterparty],
});

const settleHash = await deployer.writeContract({
  address: ESCROW, abi: escrowAbi, functionName: "settleDealWithHook",
  args: [dealId, WETH],
  chain: deployer.chain,
});
logTx("Settle via v4 Hook", settleHash);
await waitForTx(settleHash);

// ─── SCENE 5: Results ────────────────────────────────────────────
const cpUsdcAfter = await publicClient.readContract({
  address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [counterparty],
});
const cpWethAfter = await publicClient.readContract({
  address: WETH, abi: erc20Abi, functionName: "balanceOf", args: [counterparty],
});

const usdcReceived = cpUsdcAfter - cpUsdcBefore;
const wethReceived = cpWethAfter - cpWethBefore;

const deal = await publicClient.readContract({
  address: ESCROW, abi: escrowAbi, functionName: "getDeal", args: [dealId],
});
const statusMap = ["Created", "Funded", "Settled", "Disputed", "TimedOut", "Cancelled"];

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                    SETTLEMENT RESULTS                            ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Deal #${String(dealId).padEnd(5)}  Status: ${(statusMap[deal.status] ?? "?").padEnd(10)}                         ║
║                                                                  ║
║  Counterparty received:                                          ║
║    USDC (principal): +${formatUnits(usdcReceived, 6).padEnd(15)} (direct transfer)      ║
║    WETH (yield):     +${formatEther(wethReceived).slice(0, 15).padEnd(15)} (swapped via v4 hook)  ║
║                                                                  ║
║  Flow:                                                           ║
║    Aave withdraw → ${formatUnits(BigInt(DEAL_AMOUNT) + estimatedYield, 6).padEnd(8)} USDC                           ║
║    Principal     → ${formatUnits(DEAL_AMOUNT, 6).padEnd(8)} USDC → counterparty              ║
║    Yield         → ~${formatUnits(estimatedYield, 6).padEnd(7)} USDC → v4 hook → WETH         ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);

// ─── Transaction Log ─────────────────────────────────────────────
console.log("━━━ TRANSACTION LOG ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
for (const tx of txLog) {
  console.log(`  [${tx.step}]`);
  console.log(`    ${tx.explorer}`);
}

console.log(`
━━━ KEY CONTRACTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Escrow:     ${ESCROW}
  Adapter:    ${ADAPTER} (Aave V3 yield)
  Settlement: ${SETTLEMENT}
  v4 Hook:    ${HOOK} (Uniswap v4 swap)
  v4 Pool:    WETH/USDC, 0.3% fee, hook-enabled
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

if (wethReceived > 0n) {
  console.log("  ✅ SUCCESS — v4 hook swapped yield to WETH and delivered to counterparty!");
} else {
  console.log("  ⚠ WARNING — WETH yield is 0. The v4 swap may not have triggered.");
  console.log("    This happens if yield injection failed or pool has insufficient liquidity.");
}
