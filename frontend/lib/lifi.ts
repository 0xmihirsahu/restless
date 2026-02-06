import { createConfig, getQuote } from "@lifi/sdk";
import type { QuoteRequest as LifiQuoteRequest } from "@lifi/sdk";

// Initialize LI.FI SDK
createConfig({
  integrator: "restless-escrow",
});

// LI.FI Diamond address (same on all supported EVM chains)
export const LIFI_DIAMOND = "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE";

// Supported destination chains for cross-chain settlement
export const CROSS_CHAIN_TARGETS = [
  { chainId: 8453, name: "Base", icon: "/chains/base.svg" },
  { chainId: 42161, name: "Arbitrum", icon: "/chains/arbitrum.svg" },
  { chainId: 10, name: "Optimism", icon: "/chains/optimism.svg" },
  { chainId: 137, name: "Polygon", icon: "/chains/polygon.svg" },
  { chainId: 1, name: "Ethereum", icon: "/chains/ethereum.svg" },
] as const;

// USDC addresses per chain (mainnet)
export const USDC_ADDRESSES: Record<number, string> = {
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // Ethereum
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base
  42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // Arbitrum
  10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", // Optimism
  137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // Polygon
};

export type LifiQuoteResult = {
  calldata: `0x${string}`;
  toAmount: string;
  toAmountMin: string;
  estimatedTime: number;
  toolName: string;
  gasCostUSD: string;
  feeCostUSD: string;
};

/**
 * Get a LI.FI cross-chain quote for bridging tokens.
 *
 * The `fromAddress` should be the Settlement contract address since it
 * holds the tokens and calls the LI.FI Diamond directly.
 */
export async function getLifiQuote(params: {
  fromChainId: number;
  toChainId: number;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromAddress: string; // Settlement contract address
  toAddress: string; // Counterparty address on destination chain
}): Promise<LifiQuoteResult> {
  const quote = await getQuote({
    fromChain: params.fromChainId,
    toChain: params.toChainId,
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: params.fromAmount,
    fromAddress: params.fromAddress,
    toAddress: params.toAddress,
  } as LifiQuoteRequest & { fromAmount: string });

  // Extract transaction calldata from the quote
  // The transactionRequest contains the encoded call to the LI.FI Diamond
  const txRequest = (quote as any).transactionRequest;
  if (!txRequest?.data) {
    throw new Error("No transaction data in LI.FI quote response");
  }

  // Sum up gas costs and fee costs in USD
  const gasCostUSD = quote.estimate?.gasCosts
    ?.reduce((sum: number, c: any) => sum + Number(c.amountUSD || 0), 0)
    .toFixed(2) ?? "0.00";

  const feeCostUSD = quote.estimate?.feeCosts
    ?.reduce((sum: number, c: any) => sum + Number(c.amountUSD || 0), 0)
    .toFixed(2) ?? "0.00";

  return {
    calldata: txRequest.data as `0x${string}`,
    toAmount: quote.estimate?.toAmount ?? "0",
    toAmountMin: quote.estimate?.toAmountMin ?? "0",
    estimatedTime:
      (quote.estimate as any)?.executionDuration ?? 0,
    toolName: quote.tool ?? "unknown",
    gasCostUSD,
    feeCostUSD,
  };
}
