/**
 * Debug v4 pool liquidity addition
 */
import { network } from "hardhat";
import { parseAbi, getAddress, maxUint256, formatUnits, formatEther } from "viem";

const { viem } = await network.connect();
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();

const USDC = getAddress("0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f");
const WETH = getAddress("0x4200000000000000000000000000000000000006");
const HOOK = getAddress("0x1D397343a67023148De2CaCA15c4C378DDc3C040");
const POOL_MODIFY_LIQ = getAddress("0x37429cD17Cb1454C34E7F50b09725202Fd533039");
const POOL_MANAGER = getAddress("0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408");

const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);

// Check approvals
const usdcAllowance = await publicClient.readContract({
  address: USDC, abi: erc20Abi, functionName: "allowance",
  args: [deployer.account.address, POOL_MODIFY_LIQ],
});
const wethAllowance = await publicClient.readContract({
  address: WETH, abi: erc20Abi, functionName: "allowance",
  args: [deployer.account.address, POOL_MODIFY_LIQ],
});
console.log("USDC allowance to PoolModifyLiq:", formatUnits(usdcAllowance, 6));
console.log("WETH allowance to PoolModifyLiq:", formatEther(wethAllowance));

// Check balances
const usdcBal = await publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [deployer.account.address] });
const wethBal = await publicClient.readContract({ address: WETH, abi: erc20Abi, functionName: "balanceOf", args: [deployer.account.address] });
console.log("USDC balance:", formatUnits(usdcBal, 6));
console.log("WETH balance:", formatEther(wethBal));

// Check if pool exists via StateView
const stateViewAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128)",
]);
const STATE_VIEW = getAddress("0x571291b572ed32ce6751a2cb2486ebee8defb9b4");

// Compute pool ID = keccak256(abi.encode(PoolKey))
const { keccak256, encodeAbiParameters, parseAbiParameters } = await import("viem");
const poolId = keccak256(encodeAbiParameters(
  parseAbiParameters("address, address, uint24, int24, address"),
  [WETH, USDC, 3000, 60, HOOK]
));
console.log("\nPool ID:", poolId);

try {
  const slot0 = await publicClient.readContract({
    address: STATE_VIEW, abi: stateViewAbi, functionName: "getSlot0", args: [poolId],
  });
  console.log("Pool sqrtPriceX96:", slot0[0].toString());
  console.log("Pool tick:", slot0[1]);
  console.log("Pool protocolFee:", slot0[2]);
  console.log("Pool lpFee:", slot0[3]);
} catch (e: any) {
  console.log("getSlot0 error:", e.shortMessage?.slice(0, 100));
}

try {
  const liq = await publicClient.readContract({
    address: STATE_VIEW, abi: stateViewAbi, functionName: "getLiquidity", args: [poolId],
  });
  console.log("Pool liquidity:", liq.toString());
} catch (e: any) {
  console.log("getLiquidity error:", e.shortMessage?.slice(0, 100));
}

// Try modifyLiquidity with simulate
console.log("\n--- Simulating modifyLiquidity ---");
const modifyLiqAbi = parseAbi([
  "function modifyLiquidity((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, (int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt) params, bytes hookData) payable returns (int256)",
]);

const poolKey = {
  currency0: WETH,
  currency1: USDC,
  fee: 3000,
  tickSpacing: 60,
  hooks: HOOK,
};

// Try tiny liquidity
const LIQUIDITY = 1000000n; // 1e6

try {
  const result = await publicClient.simulateContract({
    address: POOL_MODIFY_LIQ,
    abi: modifyLiqAbi,
    functionName: "modifyLiquidity",
    args: [
      poolKey,
      {
        tickLower: -887220,
        tickUpper: 887220,
        liquidityDelta: LIQUIDITY,
        salt: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
      },
      "0x",
    ],
    account: deployer.account.address,
  });
  console.log("Simulation SUCCESS! Result:", result.result?.toString());
} catch (e: any) {
  console.log("Simulation FAILED:", e.shortMessage?.slice(0, 200) ?? e.message?.slice(0, 200));
  // Try to decode the revert data
  if (e.cause?.data?.raw) {
    console.log("Raw revert data:", e.cause.data.raw);
  }
  if (e.cause?.raw) {
    console.log("Raw data:", e.cause.raw);
  }
}

// Also try with the 5-arg version of modifyLiquidity
console.log("\n--- Trying 5-arg modifyLiquidity ---");
const modifyLiq5Abi = parseAbi([
  "function modifyLiquidity((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, (int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt) params, bytes hookData, bool settleUsingBurn, bool takeClaims) payable returns (int256)",
]);

try {
  const result = await publicClient.simulateContract({
    address: POOL_MODIFY_LIQ,
    abi: modifyLiq5Abi,
    functionName: "modifyLiquidity",
    args: [
      poolKey,
      {
        tickLower: -887220,
        tickUpper: 887220,
        liquidityDelta: LIQUIDITY,
        salt: "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
      },
      "0x",
      false,
      false,
    ],
    account: deployer.account.address,
  });
  console.log("5-arg simulation SUCCESS! Result:", result.result?.toString());
} catch (e: any) {
  console.log("5-arg simulation FAILED:", e.shortMessage?.slice(0, 200) ?? e.message?.slice(0, 200));
}
