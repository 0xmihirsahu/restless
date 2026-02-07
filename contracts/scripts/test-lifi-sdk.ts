/**
 * Test LI.FI SDK quote fetching to verify the integration works.
 */
import { network } from "hardhat";
import { getAddress, parseAbi, formatUnits } from "viem";

const { viem } = await network.connect();
const pc = await viem.getPublicClient();

const SETTLEMENT = getAddress("0x2ED54fB830F51C5519AAfF5698dab4DAC71163b2");

// Check what lifiDiamond is set in the deployed Settlement
const settlementAbi = parseAbi([
  "function lifiDiamond() view returns (address)",
  "function token() view returns (address)",
  "function hook() view returns (address)",
  "function owner() view returns (address)",
]);

const lifiDiamond = await pc.readContract({ address: SETTLEMENT, abi: settlementAbi, functionName: "lifiDiamond" });
const token = await pc.readContract({ address: SETTLEMENT, abi: settlementAbi, functionName: "token" });
const hook = await pc.readContract({ address: SETTLEMENT, abi: settlementAbi, functionName: "hook" });
const owner = await pc.readContract({ address: SETTLEMENT, abi: settlementAbi, functionName: "owner" });

console.log("Settlement contract state:");
console.log(`  lifiDiamond: ${lifiDiamond}`);
console.log(`  token (USDC): ${token}`);
console.log(`  hook: ${hook}`);
console.log(`  owner: ${owner}`);
console.log(`  lifiDiamond is zero: ${lifiDiamond === "0x0000000000000000000000000000000000000000"}`);

// Now test LI.FI SDK
console.log("\n--- Testing LI.FI SDK ---");
try {
  const { createConfig, getQuote } = await import("@lifi/sdk");

  createConfig({ integrator: "restless-escrow" });

  // Fetch a real quote: Base USDC → Arbitrum USDC
  const quote = await getQuote({
    fromChain: 8453,    // Base
    toChain: 42161,     // Arbitrum
    fromToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base USDC
    toToken: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",   // Arbitrum USDC
    fromAmount: "10000000", // 10 USDC
    fromAddress: "0x2ED54fB830F51C5519AAfF5698dab4DAC71163b2", // Settlement
    toAddress: "0x000000000000000000000000000000000000dEaD",
  } as any);

  console.log("  Quote received!");
  console.log(`  Tool: ${quote.tool}`);
  console.log(`  To amount: ${formatUnits(BigInt(quote.estimate?.toAmount ?? "0"), 6)} USDC`);
  console.log(`  To amount min: ${formatUnits(BigInt(quote.estimate?.toAmountMin ?? "0"), 6)} USDC`);
  console.log(`  Execution duration: ${(quote.estimate as any)?.executionDuration ?? "?"}s`);

  const txRequest = (quote as any).transactionRequest;
  if (txRequest?.data) {
    console.log(`  Has calldata: YES (${txRequest.data.length} chars)`);
    console.log(`  Target: ${txRequest.to}`);
  } else {
    console.log("  Has calldata: NO — transactionRequest missing");
  }
} catch (err: any) {
  console.error("  LI.FI SDK error:", err.message?.slice(0, 300));
}
