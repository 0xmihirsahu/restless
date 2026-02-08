/**
 * Initialize a v4 pool and add liquidity for the real RestlessSettlementHook.
 * Then configure the pool key on the hook.
 *
 * Usage:
 *   npx hardhat run scripts/setup-pool-for-hook.ts --network baseSepolia
 */

import { network } from "hardhat";
import {
  parseUnits,
  formatUnits,
  getAddress,
  parseAbi,
  maxUint256,
  formatEther,
  parseEther,
} from "viem";

const { viem } = await network.connect();
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForTx(hash: `0x${string}`) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === "reverted") throw new Error(`Transaction reverted: ${hash}`);
  await sleep(5000);
  return receipt;
}

// ─── Addresses (Base Sepolia — v4 deployment 2026-02-08) ─────────
const USDC = getAddress("0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f");
const WETH = getAddress("0x4200000000000000000000000000000000000006");
const HOOK = getAddress("0x2786cD509cF54Ca4BfAB4a900B7d094dAf04C040");
const POOL_MANAGER = getAddress("0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408");
const POOL_MODIFY_LIQ = getAddress("0x37429cd17cb1454c34e7f50b09725202fd533039");
const AAVE_FAUCET = getAddress("0xD9145b5F45Ad4519c7ACcD6E0A4A82e83bB8A6Dc");

// Sort tokens for v4 (currency0 < currency1)
const [currency0, currency1] = BigInt(WETH) < BigInt(USDC) ? [WETH, USDC] : [USDC, WETH];
console.log(`currency0: ${currency0} ${currency0 === WETH ? "(WETH)" : "(USDC)"}`);
console.log(`currency1: ${currency1} ${currency1 === USDC ? "(USDC)" : "(WETH)"}`);

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
  "function owner() view returns (address)",
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

// sqrtPriceX96 for ~$2000/ETH with WETH as currency0, USDC as currency1
const SQRT_PRICE_X96 = 44721n * 79228162514264337593543950336n / 1000000000n;

console.log(`\nDeployer: ${deployer.account.address}`);
console.log(`Hook: ${HOOK}`);
console.log(`PoolManager: ${POOL_MANAGER}`);
console.log(`sqrtPriceX96: ${SQRT_PRICE_X96}\n`);

// ═══ STEP 1: Ensure tokens ═══════════════════════════════════════
console.log("─── STEP 1: Ensure tokens ──────────────────────────────────────");

let usdcBal = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [deployer.account.address] });
let wethBal = await publicClient.readContract({ address: WETH, abi: erc20Abi, functionName: "balanceOf", args: [deployer.account.address] });
console.log(`  USDC: ${formatUnits(usdcBal, 6)} | WETH: ${formatEther(wethBal)}`);

if (usdcBal < parseUnits("20", 6)) {
  console.log("  Minting 100 USDC...");
  const h = await deployer.writeContract({ address: AAVE_FAUCET, abi: faucetAbi, functionName: "mint", args: [USDC, deployer.account.address, parseUnits("100", 6)], chain: deployer.chain });
  await waitForTx(h);
}

if (wethBal < parseEther("0.01")) {
  console.log("  Wrapping 0.01 ETH → WETH...");
  const h = await deployer.writeContract({ address: WETH, abi: wethAbi, functionName: "deposit", args: [], value: parseEther("0.01"), chain: deployer.chain });
  await waitForTx(h);
}

// ═══ STEP 2: Initialize pool ═════════════════════════════════════
console.log("\n─── STEP 2: Initialize v4 Pool ─────────────────────────────────");
try {
  const h = await deployer.writeContract({ address: POOL_MANAGER, abi: poolManagerAbi, functionName: "initialize", args: [poolKey, SQRT_PRICE_X96], chain: deployer.chain });
  console.log(`  tx: ${h}`);
  await waitForTx(h);
  console.log("  Pool initialized!");
} catch (e: any) {
  const msg = e.shortMessage ?? e.message ?? "";
  if (msg.includes("PoolAlreadyInitialized") || msg.includes("0x7983c051")) {
    console.log("  Pool already initialized (OK)");
  } else {
    throw e;
  }
}

// ═══ STEP 3: Add liquidity ═══════════════════════════════════════
console.log("\n─── STEP 3: Add Liquidity ──────────────────────────────────────");

const usdcAllow = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [deployer.account.address, POOL_MODIFY_LIQ] });
const wethAllow = await publicClient.readContract({ address: WETH, abi: erc20Abi, functionName: "allowance", args: [deployer.account.address, POOL_MODIFY_LIQ] });

if (usdcAllow < parseUnits("100", 6) || wethAllow < parseEther("1")) {
  console.log("  Approving tokens...");
  const a1 = await deployer.writeContract({ address: USDC, abi: erc20Abi, functionName: "approve", args: [POOL_MODIFY_LIQ, maxUint256], chain: deployer.chain });
  const a2 = await deployer.writeContract({ address: WETH, abi: erc20Abi, functionName: "approve", args: [POOL_MODIFY_LIQ, maxUint256], chain: deployer.chain });
  await waitForTx(a1);
  await waitForTx(a2);
}

const MIN_TICK = -887220;
const MAX_TICK = 887220;
const LIQUIDITY = 10000000000n;

console.log(`  Adding ${LIQUIDITY} liquidity units...`);
const liqHash = await deployer.writeContract({
  address: POOL_MODIFY_LIQ, abi: modifyLiqAbi, functionName: "modifyLiquidity",
  args: [
    poolKey,
    { tickLower: MIN_TICK, tickUpper: MAX_TICK, liquidityDelta: LIQUIDITY, salt: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}` },
    "0x",
  ],
  chain: deployer.chain,
});
console.log(`  tx: ${liqHash}`);
await waitForTx(liqHash);
console.log("  Liquidity added!");

// ═══ STEP 4: Set pool key on hook ════════════════════════════════
console.log("\n─── STEP 4: Set Pool Key on Hook ───────────────────────────────");

const owner = await publicClient.readContract({ address: HOOK, abi: hookAbi, functionName: "owner" });
console.log(`  Hook owner: ${owner}`);
console.log(`  Deployer:   ${deployer.account.address}`);

const setKeyHash = await deployer.writeContract({
  address: HOOK, abi: hookAbi, functionName: "setPoolKey",
  args: [WETH, poolKey],
  chain: deployer.chain,
});
console.log(`  tx: ${setKeyHash}`);
await waitForTx(setKeyHash);
console.log("  Pool key configured for WETH!");

console.log("\n═══ DONE ═══════════════════════════════════════════════════════");
console.log(`  Hook: ${HOOK}`);
console.log(`  Pool: WETH/USDC (0.3% fee, hook-enabled)`);
console.log(`  Ready for settleWithHook!`);
