/**
 * Configure a PoolKey on the RestlessSettlementHook for a preferred output token.
 *
 * Usage:
 *   HOOK_ADDRESS=0x... PREFERRED_TOKEN=0x... POOL_FEE=3000 TICK_SPACING=60 \
 *     npx hardhat run scripts/set-pool-key.ts --network sepolia
 *
 * Required env vars:
 *   HOOK_ADDRESS       — deployed RestlessSettlementHook
 *   PREFERRED_TOKEN    — output token (e.g. WETH)
 *   USDC_ADDRESS       — USDC address on this chain (currency in the pool)
 *   POOL_FEE           — pool fee tier (e.g. 3000 = 0.3%)
 *   TICK_SPACING       — pool tick spacing (e.g. 60 for 0.3% pools)
 *
 * The PoolKey is constructed with (currency0, currency1, fee, tickSpacing, hookAddress).
 * currency0/currency1 are sorted by address (lower address = currency0).
 */

import { network } from "hardhat";
import { getAddress } from "viem";

const { viem } = await network.connect();

const hookAddress = getAddress(process.env.HOOK_ADDRESS!);
const preferredToken = getAddress(process.env.PREFERRED_TOKEN!);
const usdcAddress = getAddress(process.env.USDC_ADDRESS!);
const poolFee = Number(process.env.POOL_FEE ?? "3000");
const tickSpacing = Number(process.env.TICK_SPACING ?? "60");

const [deployer] = await viem.getWalletClients();
console.log("Deployer:", deployer.account.address);

// Sort currencies — v4 requires currency0 < currency1
const sorted = [usdcAddress, preferredToken].sort((a, b) =>
  a.toLowerCase() < b.toLowerCase() ? -1 : 1
);
const currency0 = sorted[0];
const currency1 = sorted[1];

console.log("Setting pool key for:", preferredToken);
console.log("  currency0:", currency0);
console.log("  currency1:", currency1);
console.log("  fee:", poolFee);
console.log("  tickSpacing:", tickSpacing);
console.log("  hooks:", hookAddress);

const hook = await viem.getContractAt(
  "RestlessSettlementHook",
  hookAddress,
  { client: { wallet: deployer } }
);

const poolKey = {
  currency0,
  currency1,
  fee: poolFee,
  tickSpacing,
  hooks: hookAddress,
};

const tx = await hook.write.setPoolKey([preferredToken, poolKey]);
console.log("setPoolKey tx:", tx);
console.log("Done! Pool configured for", preferredToken);
