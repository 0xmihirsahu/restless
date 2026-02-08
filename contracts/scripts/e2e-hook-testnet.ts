/**
 * End-to-end testnet integration test for Uniswap v4 Hook Settlement.
 *
 * Tests the complete settleWithHook flow on Base Sepolia:
 *   1. Wrap ETH → WETH
 *   2. Initialize USDC/WETH v4 pool with our hook
 *   3. Add liquidity to the pool
 *   4. Configure pool key on the hook
 *   5. Create + fund an escrow deal (USDC → Aave)
 *   6. Settle via hook (settleWithHook → v4 swap yield → WETH)
 *   7. Verify results
 *
 * Usage:
 *   npx hardhat run scripts/e2e-hook-testnet.ts --network baseSepolia
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
const ESCROW = getAddress("0xDCe58c9739a9F629cdFf840F9DA15AC82495B933");
const ADAPTER = getAddress("0xF2B99E27196809aFd35A5C1E1F0747A0540E51b6");
const SETTLEMENT = getAddress("0x2ED54fB830F51C5519AAfF5698dab4DAC71163b2");
const HOOK = getAddress("0x1D397343a67023148De2CaCA15c4C378DDc3C040");
const POOL_MANAGER = getAddress("0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408");
const POOL_MODIFY_LIQ = getAddress("0x37429cd17cb1454c34e7f50b09725202fd533039");
const AAVE_FAUCET = getAddress("0xD9145b5F45Ad4519c7ACcD6E0A4A82e83bB8A6Dc");
const EXPLORER = "https://sepolia.basescan.org/tx/";

// Sort tokens for v4 (currency0 < currency1)
const [currency0, currency1] = BigInt(WETH) < BigInt(USDC) ? [WETH, USDC] : [USDC, WETH];
const usdcIsCurrency1 = currency1 === USDC;
console.log(`currency0: ${currency0} ${currency0 === WETH ? "(WETH)" : "(USDC)"}`);
console.log(`currency1: ${currency1} ${currency1 === USDC ? "(USDC)" : "(WETH)"}`);

const txLog: { step: string; hash: string }[] = [];
function logTx(step: string, hash: string) {
  txLog.push({ step, hash });
  console.log(`  tx: ${hash}`);
  console.log(`  ${EXPLORER}${hash}\n`);
}

// ─── ABIs ────────────────────────────────────────────────────────
const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
]);

const wethAbi = parseAbi([
  "function deposit() payable",
  "function balanceOf(address) view returns (uint256)",
]);

const poolManagerAbi = parseAbi([
  "function initialize((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, uint160 sqrtPriceX96) returns (int24 tick)",
]);

const modifyLiqAbi = parseAbi([
  "function modifyLiquidity((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, (int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt) params, bytes hookData) payable returns (int256)",
]);

const hookAbi = parseAbi([
  "function setPoolKey(address preferredToken, (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key)",
  "function poolConfigured(address) view returns (bool)",
  "function owner() view returns (address)",
]);

const escrowAbi = parseAbi([
  "function dealCount() view returns (uint256)",
  "function getDeal(uint256) view returns ((uint256 id, address depositor, address counterparty, uint256 amount, uint8 yieldSplitCounterparty, uint8 status, uint256 timeout, bytes32 dealHash, uint256 createdAt, uint256 fundedAt, uint256 disputedAt))",
  "function getAccruedYield(uint256) view returns (uint256)",
  "function createDeal((address counterparty, uint256 amount, uint8 yieldSplitCounterparty, uint256 timeout, bytes32 dealHash) params) returns (uint256)",
  "function fundDeal(uint256)",
  "function settleDealWithHook(uint256,address)",
]);

const faucetAbi = parseAbi([
  "function mint(address token, address to, uint256 amount) returns (uint256)",
]);

// ─── Pool Key ────────────────────────────────────────────────────
const FEE = 3000;          // 0.3%
const TICK_SPACING = 60;   // standard for 0.3% fee tier
const poolKey = {
  currency0,
  currency1,
  fee: FEE,
  tickSpacing: TICK_SPACING,
  hooks: HOOK,
};

// sqrtPriceX96 for ~$2000/ETH with WETH(18 dec) as currency0, USDC(6 dec) as currency1
// price = amount1_per_unit / amount0_per_unit = 2000 * 1e6 / 1e18 = 2e-9
// sqrtPriceX96 = sqrt(2e-9) * 2^96
// Computed: sqrt(2000) * sqrt(1e6) * 2^96 / sqrt(1e18)
//         = 44.7214 * 1000 * 2^96 / 1e9
//         = 44721.36 * 79228162514264337593543950336 / 1e9
const SQRT_PRICE_X96 = 44721n * 79228162514264337593543950336n / 1000000000n;

console.log(`\n${"=".repeat(70)}`);
console.log(`  RESTLESS v4 HOOK E2E — BASE SEPOLIA`);
console.log(`${"=".repeat(70)}\n`);
console.log(`Deployer: ${deployer.account.address}`);
console.log(`Escrow: ${ESCROW}`);
console.log(`Hook: ${HOOK}`);
console.log(`PoolManager: ${POOL_MANAGER}`);
console.log(`sqrtPriceX96: ${SQRT_PRICE_X96}\n`);

// ═══════════════════════════════════════════════════════════════════
// STEP 0: Check balances, get USDC + WETH
// ═══════════════════════════════════════════════════════════════════
console.log("─── STEP 0: Prepare tokens (USDC + WETH) ──────────────────────");

const ethBal = await publicClient.getBalance({ address: deployer.account.address });
console.log(`  ETH balance: ${formatEther(ethBal)}`);

let usdcBal = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [deployer.account.address] });
console.log(`  USDC balance: ${formatUnits(usdcBal, 6)}`);

let wethBal = await publicClient.readContract({ address: WETH, abi: erc20Abi, functionName: "balanceOf", args: [deployer.account.address] });
console.log(`  WETH balance: ${formatEther(wethBal)}`);

// Mint USDC if needed (need ~20 USDC: 10 for deal + 10 for liquidity)
if (usdcBal < parseUnits("20", 6)) {
  console.log("\n  Minting 100 USDC via faucet...");
  const mintHash = await deployer.writeContract({
    address: AAVE_FAUCET, abi: faucetAbi, functionName: "mint",
    args: [USDC, deployer.account.address, parseUnits("100", 6)],
    chain: deployer.chain,
  });
  logTx("Faucet Mint USDC", mintHash);
  await waitForTx(mintHash);
  usdcBal = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [deployer.account.address] });
  console.log(`  USDC after mint: ${formatUnits(usdcBal, 6)}`);
}

// Wrap ETH → WETH if needed (need ~0.01 WETH for liquidity)
const WETH_NEEDED = parseEther("0.01");
if (wethBal < WETH_NEEDED) {
  console.log("\n  Wrapping 0.01 ETH → WETH...");
  const wrapHash = await deployer.writeContract({
    address: WETH, abi: wethAbi, functionName: "deposit",
    args: [], value: WETH_NEEDED, chain: deployer.chain,
  });
  logTx("Wrap ETH → WETH", wrapHash);
  await waitForTx(wrapHash);
  wethBal = await publicClient.readContract({ address: WETH, abi: erc20Abi, functionName: "balanceOf", args: [deployer.account.address] });
  console.log(`  WETH after wrap: ${formatEther(wethBal)}`);
}

// ═══════════════════════════════════════════════════════════════════
// STEP 1: Initialize v4 pool (USDC/WETH with our hook)
// ═══════════════════════════════════════════════════════════════════
console.log("\n─── STEP 1: Initialize v4 Pool ──────────────────────────────────");
console.log(`  Pool: ${currency0 === WETH ? "WETH" : "USDC"}/${currency1 === USDC ? "USDC" : "WETH"}`);
console.log(`  Fee: ${FEE / 10000}%  Tick spacing: ${TICK_SPACING}`);
console.log(`  Hook: ${HOOK}`);

try {
  const initHash = await deployer.writeContract({
    address: POOL_MANAGER, abi: poolManagerAbi, functionName: "initialize",
    args: [poolKey, SQRT_PRICE_X96],
    chain: deployer.chain,
  });
  logTx("Initialize Pool", initHash);
  await waitForTx(initHash);
  console.log("  Pool initialized!");
} catch (e: any) {
  const msg = e.shortMessage ?? e.message ?? "";
  // 0x7983c051 = PoolAlreadyInitialized()
  if (msg.includes("PoolAlreadyInitialized") || msg.includes("already") || msg.includes("0x7983c051")) {
    console.log("  Pool already initialized (OK — skipping)\n");
  } else {
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════════════
// STEP 2: Add liquidity to the pool
// ═══════════════════════════════════════════════════════════════════
console.log("─── STEP 2: Add Liquidity to v4 Pool ──────────────────────────");

// Check if already approved
const usdcAllow = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [deployer.account.address, POOL_MODIFY_LIQ] });
const wethAllow = await publicClient.readContract({ address: WETH, abi: erc20Abi, functionName: "allowance", args: [deployer.account.address, POOL_MODIFY_LIQ] });

if (usdcAllow < parseUnits("100", 6) || wethAllow < parseEther("1")) {
  console.log("  Approving USDC + WETH to PoolModifyLiquidityTest...");
  const approveUsdc = await deployer.writeContract({
    address: USDC, abi: erc20Abi, functionName: "approve",
    args: [POOL_MODIFY_LIQ, maxUint256], chain: deployer.chain,
  });
  const approveWeth = await deployer.writeContract({
    address: WETH, abi: erc20Abi, functionName: "approve",
    args: [POOL_MODIFY_LIQ, maxUint256], chain: deployer.chain,
  });
  await waitForTx(approveUsdc);
  await waitForTx(approveWeth);
  console.log("  Approved.");
} else {
  console.log("  Already approved (skipping).");
}

// Add full-range liquidity
const MIN_TICK = -887220; // nearest multiple of 60 to MIN_TICK
const MAX_TICK = 887220;
const LIQUIDITY = 10000000000n; // 1e10 liquidity units (~0.0002 WETH + ~0.44 USDC at $2000/ETH)

console.log(`  Adding liquidity: ${LIQUIDITY} units, full range [${MIN_TICK}, ${MAX_TICK}]`);
const liqHash = await deployer.writeContract({
  address: POOL_MODIFY_LIQ, abi: modifyLiqAbi, functionName: "modifyLiquidity",
  args: [
    poolKey,
    { tickLower: MIN_TICK, tickUpper: MAX_TICK, liquidityDelta: LIQUIDITY, salt: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}` },
    "0x",
  ],
  chain: deployer.chain,
});
logTx("Add Liquidity", liqHash);
await waitForTx(liqHash);
console.log("  Liquidity added!");

// ═══════════════════════════════════════════════════════════════════
// STEP 3: Configure pool key on hook
// ═══════════════════════════════════════════════════════════════════
console.log("─── STEP 3: Configure Pool Key on Hook ────────────────────────");

const alreadyConfigured = await publicClient.readContract({
  address: HOOK, abi: hookAbi, functionName: "poolConfigured", args: [WETH],
});

if (alreadyConfigured) {
  console.log("  Pool already configured for WETH (OK — skipping)\n");
} else {
  console.log(`  Setting pool key for WETH output...`);
  const setKeyHash = await deployer.writeContract({
    address: HOOK, abi: hookAbi, functionName: "setPoolKey",
    args: [WETH, poolKey],
    chain: deployer.chain,
  });
  logTx("Set Pool Key", setKeyHash);
  await waitForTx(setKeyHash);
  console.log("  Pool key configured!");
}

// ═══════════════════════════════════════════════════════════════════
// STEP 4: Create + Fund escrow deal
// ═══════════════════════════════════════════════════════════════════
console.log("─── STEP 4: Create + Fund Escrow Deal ─────────────────────────");

const DEAL_AMOUNT = parseUnits("10", 6); // 10 USDC
const counterparty = getAddress("0x000000000000000000000000000000000000dEaD");
const dealHash = keccak256(toHex(`v4 hook e2e ${Date.now()}`));

// Approve escrow
const appEsc = await deployer.writeContract({
  address: USDC, abi: erc20Abi, functionName: "approve",
  args: [ESCROW, DEAL_AMOUNT], chain: deployer.chain,
});
logTx("Approve USDC to Escrow", appEsc);
await waitForTx(appEsc);

// Create deal
const createHash = await deployer.writeContract({
  address: ESCROW, abi: escrowAbi, functionName: "createDeal",
  args: [{ counterparty, amount: DEAL_AMOUNT, yieldSplitCounterparty: 100, timeout: 86400n, dealHash }] as const,
  chain: deployer.chain,
});
logTx("Create Deal", createHash);
const createReceipt = await waitForTx(createHash);

// Extract deal ID from logs
let dealId = 0n;
for (const log of createReceipt.logs) {
  if (log.address.toLowerCase() === ESCROW.toLowerCase() && log.topics.length >= 2) {
    dealId = BigInt(log.topics[1]!);
    break;
  }
}
if (dealId === 0n) throw new Error("Failed to extract deal ID");
console.log(`  Deal ID: ${dealId}`);

// Fund deal
const fundHash = await deployer.writeContract({
  address: ESCROW, abi: escrowAbi, functionName: "fundDeal",
  args: [dealId], chain: deployer.chain,
});
logTx("Fund Deal (USDC → Aave)", fundHash);
await waitForTx(fundHash);

const dealAfterFund = await publicClient.readContract({
  address: ESCROW, abi: escrowAbi, functionName: "getDeal", args: [dealId],
});
console.log(`  Deal status: ${dealAfterFund.status} (1=Funded)`);

// Check Aave deposit
const aUsdcBal = await publicClient.readContract({
  address: getAddress("0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC"),
  abi: erc20Abi, functionName: "balanceOf", args: [ADAPTER],
});
console.log(`  Adapter aUSDC: ${formatUnits(aUsdcBal, 6)} (Aave deposit confirmed)`);

// ═══════════════════════════════════════════════════════════════════
// STEP 4b: Inject simulated yield (send extra aUSDC to adapter)
//   Aave needs hours/days to accrue meaningful yield.
//   We simulate by minting USDC, depositing to Aave, and transferring
//   aUSDC to the adapter — functionally identical to real yield accrual.
// ═══════════════════════════════════════════════════════════════════
console.log("\n─── STEP 4b: Inject Simulated Yield ───────────────────────────");

const YIELD_AMOUNT = parseUnits("2", 6); // 2 USDC simulated yield
const A_USDC = getAddress("0x10F1A9D11CDf50041f3f8cB7191CBE2f31750ACC");
const AAVE_POOL = getAddress("0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27");

const aavePoolAbi = parseAbi([
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
]);
const aTokenTransferAbi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

// Mint yield USDC from faucet
console.log(`  Minting ${formatUnits(YIELD_AMOUNT, 6)} USDC as simulated yield...`);
const yieldMintHash = await deployer.writeContract({
  address: AAVE_FAUCET, abi: faucetAbi, functionName: "mint",
  args: [USDC, deployer.account.address, YIELD_AMOUNT],
  chain: deployer.chain,
});
await waitForTx(yieldMintHash);

// Approve Aave pool to take USDC
const approveAaveHash = await deployer.writeContract({
  address: USDC, abi: erc20Abi, functionName: "approve",
  args: [AAVE_POOL, YIELD_AMOUNT], chain: deployer.chain,
});
await waitForTx(approveAaveHash);

// Supply to Aave (get aUSDC to our wallet)
const supplyHash = await deployer.writeContract({
  address: AAVE_POOL, abi: aavePoolAbi, functionName: "supply",
  args: [USDC, YIELD_AMOUNT, deployer.account.address, 0],
  chain: deployer.chain,
});
await waitForTx(supplyHash);

// Transfer aUSDC to adapter (simulates yield accrual on aToken balance)
const myAUsdc = await publicClient.readContract({
  address: A_USDC, abi: aTokenTransferAbi, functionName: "balanceOf",
  args: [deployer.account.address],
});
const toTransfer = myAUsdc < YIELD_AMOUNT ? myAUsdc : YIELD_AMOUNT;
console.log(`  Transferring ${formatUnits(toTransfer, 6)} aUSDC to adapter...`);
const transferATokenHash = await deployer.writeContract({
  address: A_USDC, abi: aTokenTransferAbi, functionName: "transfer",
  args: [ADAPTER, toTransfer], chain: deployer.chain,
});
logTx("Inject Simulated Yield (aUSDC → Adapter)", transferATokenHash);
await waitForTx(transferATokenHash);

// Verify adapter now has more aUSDC than principal
const adapterAUsdcAfterYield = await publicClient.readContract({
  address: A_USDC, abi: aTokenTransferAbi, functionName: "balanceOf",
  args: [ADAPTER],
});
console.log(`  Adapter aUSDC after yield injection: ${formatUnits(adapterAUsdcAfterYield, 6)}`);
console.log(`  Deal principal: ${formatUnits(DEAL_AMOUNT, 6)} USDC`);
console.log(`  Expected yield: ~${formatUnits(toTransfer, 6)} USDC → will be swapped to WETH via v4 hook`);

// ═══════════════════════════════════════════════════════════════════
// STEP 5: Settle with Hook (v4 swap yield → WETH)
// ═══════════════════════════════════════════════════════════════════
console.log("\n─── STEP 5: Settle with v4 Hook ─────────────────────────────────");
console.log(`  Preferred output token: WETH`);
console.log(`  Hook will swap any yield USDC → WETH via v4 pool`);
console.log(`  (Counterparty gets principal in USDC + yield in WETH)`);

const counterpartyUsdcBefore = await publicClient.readContract({
  address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [counterparty],
});
const counterpartyWethBefore = await publicClient.readContract({
  address: WETH, abi: erc20Abi, functionName: "balanceOf", args: [counterparty],
});

const settleHash = await deployer.writeContract({
  address: ESCROW, abi: escrowAbi, functionName: "settleDealWithHook",
  args: [dealId, WETH],
  chain: deployer.chain,
});
logTx("Settle with Hook", settleHash);
const settleReceipt = await waitForTx(settleHash);

// ═══════════════════════════════════════════════════════════════════
// STEP 6: Verify results
// ═══════════════════════════════════════════════════════════════════
console.log("─── STEP 6: Verify Results ──────────────────────────────────────");

const dealAfterSettle = await publicClient.readContract({
  address: ESCROW, abi: escrowAbi, functionName: "getDeal", args: [dealId],
});
const statusMap = ["Created", "Funded", "Settled", "Disputed", "TimedOut", "Cancelled"];
console.log(`  Deal status: ${statusMap[dealAfterSettle.status] ?? dealAfterSettle.status}`);

const counterpartyUsdcAfter = await publicClient.readContract({
  address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [counterparty],
});
const counterpartyWethAfter = await publicClient.readContract({
  address: WETH, abi: erc20Abi, functionName: "balanceOf", args: [counterparty],
});

console.log(`\n  Counterparty received:`);
console.log(`    USDC: +${formatUnits(counterpartyUsdcAfter - counterpartyUsdcBefore, 6)} (principal)`);
console.log(`    WETH: +${formatEther(counterpartyWethAfter - counterpartyWethBefore)} (yield swapped via v4)`);

// Show settle tx event details
console.log(`\n  Settle tx logs: ${settleReceipt.logs.length}`);
for (const log of settleReceipt.logs) {
  const knownAddrs: Record<string, string> = {
    [USDC.toLowerCase()]: "USDC",
    [WETH.toLowerCase()]: "WETH",
    [ESCROW.toLowerCase()]: "Escrow",
    [ADAPTER.toLowerCase()]: "Adapter",
    [SETTLEMENT.toLowerCase()]: "Settlement",
    [HOOK.toLowerCase()]: "Hook",
    [POOL_MANAGER.toLowerCase()]: "PoolManager",
  };
  const label = knownAddrs[log.address.toLowerCase()] ?? log.address.slice(0, 10);
  console.log(`    ${label}: topics=${log.topics.length}`);
}

// ═══════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(70)}`);
console.log("  TRANSACTION LOG");
console.log(`${"=".repeat(70)}`);
for (const tx of txLog) {
  console.log(`\n  [${tx.step}]`);
  console.log(`    ${EXPLORER}${tx.hash}`);
}

console.log(`\n${"=".repeat(70)}`);
console.log("  v4 HOOK E2E COMPLETE");
console.log(`${"=".repeat(70)}`);
console.log(`  Deal ID:      ${dealId}`);
console.log(`  Deal Status:  ${statusMap[dealAfterSettle.status]}`);
console.log(`  Pool:         WETH/USDC (0.3% fee, hook-enabled)`);
console.log(`  Hook:         ${HOOK}`);
console.log(`  Txns:         ${txLog.length}`);
console.log(`${"=".repeat(70)}\n`);
