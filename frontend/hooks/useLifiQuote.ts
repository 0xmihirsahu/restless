"use client";

import { useState, useCallback } from "react";
import {
  getLifiQuote,
  type LifiQuoteResult,
  USDC_ADDRESSES,
} from "@/lib/lifi";
import { CONTRACTS } from "@/lib/contracts";

export function useLifiQuote() {
  const [quote, setQuote] = useState<LifiQuoteResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuote = useCallback(
    async (params: {
      sourceChainId: number;
      destChainId: number;
      amount: string; // raw amount in token decimals (e.g., "1000000" for 1 USDC)
      toAddress: string; // counterparty address on destination chain
    }) => {
      setIsLoading(true);
      setError(null);
      setQuote(null);

      const fromToken = USDC_ADDRESSES[params.sourceChainId];
      const toToken = USDC_ADDRESSES[params.destChainId];

      if (!fromToken || !toToken) {
        setError(
          `USDC not configured for chain ${!fromToken ? params.sourceChainId : params.destChainId}`
        );
        setIsLoading(false);
        return null;
      }

      try {
        const result = await getLifiQuote({
          fromChainId: params.sourceChainId,
          toChainId: params.destChainId,
          fromToken,
          toToken,
          fromAmount: params.amount,
          fromAddress: CONTRACTS.settlement, // Settlement holds the tokens
          toAddress: params.toAddress,
        });

        setQuote(result);
        return result;
      } catch (err: any) {
        const message =
          err?.message?.slice(0, 200) ?? "Failed to get cross-chain quote";
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const clearQuote = useCallback(() => {
    setQuote(null);
    setError(null);
  }, []);

  return { quote, isLoading, error, fetchQuote, clearQuote };
}
