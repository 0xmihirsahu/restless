"use client";

import { useState } from "react";
import { formatUnits } from "viem";
import { useChainId } from "wagmi";
import { useLifiQuote } from "@/hooks/useLifiQuote";
import { CROSS_CHAIN_TARGETS } from "@/lib/lifi";

const HOOK_TOKEN_PRESETS: { label: string; address: `0x${string}` }[] = [
  { label: "WETH", address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" },
  { label: "DAI", address: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357" },
];

type CrossChainSettleProps = {
  dealId: bigint;
  counterparty: string;
  amount: bigint; // principal in USDC (6 decimals)
  onSettle: (lifiData?: `0x${string}`) => void;
  onSettleWithHook?: (preferredToken: `0x${string}`) => void;
  isPending: boolean;
};

export function CrossChainSettle({
  dealId,
  counterparty,
  amount,
  onSettle,
  onSettleWithHook,
  isPending,
}: CrossChainSettleProps) {
  const chainId = useChainId();
  const [mode, setMode] = useState<"same-chain" | "cross-chain" | "hook">("same-chain");
  const [destChainId, setDestChainId] = useState<number>(0);
  const [preferredToken, setPreferredToken] = useState<string>("");
  const { quote, isLoading: quoteLoading, error: quoteError, fetchQuote, clearQuote } = useLifiQuote();

  const handleModeChange = (newMode: "same-chain" | "cross-chain" | "hook") => {
    setMode(newMode);
    clearQuote();
    setDestChainId(0);
  };

  const handleChainSelect = async (selectedChainId: number) => {
    setDestChainId(selectedChainId);
    clearQuote();

    if (selectedChainId === 0) return;

    // For testnet chains, use mainnet equivalents for LI.FI quotes
    // LI.FI doesn't support testnets, so we map:
    // Sepolia (11155111) -> Ethereum (1)
    // Base Sepolia (84532) -> Base (8453)
    const sourceMainnet = mapToMainnet(chainId);

    if (sourceMainnet === selectedChainId) {
      // Same chain, no need for cross-chain
      return;
    }

    await fetchQuote({
      sourceChainId: sourceMainnet,
      destChainId: selectedChainId,
      amount: amount.toString(),
      toAddress: counterparty,
    });
  };

  const handleSettle = () => {
    if (mode === "cross-chain" && quote) {
      onSettle(quote.calldata);
    } else {
      onSettle();
    }
  };

  const handleSettleWithHook = () => {
    if (!onSettleWithHook) return;
    const token = preferredToken.trim();
    if (!token.match(/^0x[a-fA-F0-9]{40}$/)) return;
    onSettleWithHook(token as `0x${string}`);
  };

  const isValidTokenAddress = preferredToken.trim().match(/^0x[a-fA-F0-9]{40}$/);

  return (
    <div className="border border-border p-4 space-y-4">
      <div className="text-xs text-muted-foreground tracking-wide">
        settlement options
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => handleModeChange("same-chain")}
          className={`flex-1 px-3 py-2 text-xs transition-colors ${
            mode === "same-chain"
              ? "bg-primary text-primary-foreground"
              : "border border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          same chain
        </button>
        <button
          onClick={() => handleModeChange("cross-chain")}
          className={`flex-1 px-3 py-2 text-xs transition-colors ${
            mode === "cross-chain"
              ? "bg-primary text-primary-foreground"
              : "border border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          cross-chain (LI.FI)
        </button>
        <button
          onClick={() => handleModeChange("hook")}
          className={`flex-1 px-3 py-2 text-xs transition-colors ${
            mode === "hook"
              ? "bg-primary text-primary-foreground"
              : "border border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          yield swap (v4 hook)
        </button>
      </div>

      {/* Cross-Chain Options */}
      {mode === "cross-chain" && (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            send counterparty payout to another chain via LI.FI
          </div>

          {/* Chain Selector */}
          <div className="grid grid-cols-2 gap-2">
            {CROSS_CHAIN_TARGETS.filter((c) => c.chainId !== mapToMainnet(chainId)).map(
              (chain) => (
                <button
                  key={chain.chainId}
                  onClick={() => handleChainSelect(chain.chainId)}
                  className={`px-3 py-2 text-xs text-left transition-colors ${
                    destChainId === chain.chainId
                      ? "border-2 border-primary text-foreground"
                      : "border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                  }`}
                >
                  {chain.name}
                </button>
              )
            )}
          </div>

          {/* Quote Loading */}
          {quoteLoading && (
            <div className="text-xs text-muted-foreground animate-pulse">
              fetching cross-chain route...
            </div>
          )}

          {/* Quote Error */}
          {quoteError && (
            <div className="text-xs text-destructive">
              {quoteError}
            </div>
          )}

          {/* Quote Result */}
          {quote && (
            <div className="border border-border p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">bridge</span>
                <span className="text-foreground">{quote.toolName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">receive</span>
                <span className="text-foreground">
                  ~{formatUnits(BigInt(quote.toAmount), 6)} USDC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">minimum</span>
                <span className="text-foreground">
                  {formatUnits(BigInt(quote.toAmountMin), 6)} USDC
                </span>
              </div>
              {quote.estimatedTime > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">est. time</span>
                  <span className="text-foreground">
                    ~{Math.ceil(quote.estimatedTime / 60)} min
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">gas cost</span>
                <span className="text-foreground">${quote.gasCostUSD}</span>
              </div>
              {Number(quote.feeCostUSD) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">bridge fee</span>
                  <span className="text-foreground">${quote.feeCostUSD}</span>
                </div>
              )}
              <div className="pt-1 border-t border-border mt-1">
                <span className="text-muted-foreground">
                  powered by LI.FI
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hook / Yield Swap Options */}
      {mode === "hook" && (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            swap yield portion to a preferred token via uniswap v4 hook
          </div>

          {/* Token Presets */}
          <div className="grid grid-cols-2 gap-2">
            {HOOK_TOKEN_PRESETS.map((preset) => (
              <button
                key={preset.address}
                onClick={() => setPreferredToken(preset.address)}
                className={`px-3 py-2 text-xs text-left transition-colors ${
                  preferredToken.toLowerCase() === preset.address.toLowerCase()
                    ? "border-2 border-primary text-foreground"
                    : "border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom Token Input */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              preferred token address
            </label>
            <input
              type="text"
              value={preferredToken}
              onChange={(e) => setPreferredToken(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2 text-xs bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
            {preferredToken && !isValidTokenAddress && (
              <p className="text-xs text-destructive">
                enter a valid token address (0x + 40 hex chars)
              </p>
            )}
          </div>

          {/* Hook Info */}
          {isValidTokenAddress && (
            <div className="border border-border p-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">settlement</span>
                <span className="text-foreground">uniswap v4 hook</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">preferred token</span>
                <span className="text-foreground font-mono">
                  {HOOK_TOKEN_PRESETS.find(
                    (p) => p.address.toLowerCase() === preferredToken.trim().toLowerCase()
                  )?.label ?? `${preferredToken.slice(0, 6)}...${preferredToken.slice(-4)}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">yield portion</span>
                <span className="text-foreground">
                  swapped to preferred token on-chain
                </span>
              </div>
              <div className="pt-1 border-t border-border mt-1">
                <span className="text-muted-foreground">
                  powered by uniswap v4
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Same-Chain Info */}
      {mode === "same-chain" && (
        <div className="text-xs text-muted-foreground">
          settle on current chain — counterparty receives{" "}
          {formatUnits(amount, 6)} USDC + yield directly
        </div>
      )}

      {/* Settle Button */}
      {mode !== "hook" && (
        <button
          onClick={handleSettle}
          disabled={
            isPending ||
            (mode === "cross-chain" && !quote) ||
            quoteLoading
          }
          className="w-full px-4 py-2.5 text-sm bg-green-600 text-white hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {isPending
            ? "confirming..."
            : mode === "cross-chain"
              ? `settle + bridge to ${CROSS_CHAIN_TARGETS.find((c) => c.chainId === destChainId)?.name ?? "..."}`
              : "settle deal"}
        </button>
      )}

      {/* Hook Settle Button */}
      {mode === "hook" && (
        <button
          onClick={handleSettleWithHook}
          disabled={isPending || !isValidTokenAddress || !onSettleWithHook}
          className="w-full px-4 py-2.5 text-sm bg-green-600 text-white hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {isPending
            ? "confirming..."
            : `settle + swap yield to ${
                HOOK_TOKEN_PRESETS.find(
                  (p) => p.address.toLowerCase() === preferredToken.trim().toLowerCase()
                )?.label ?? "token"
              }`}
        </button>
      )}
    </div>
  );
}

/** Map testnet chain IDs to their mainnet equivalents for LI.FI */
function mapToMainnet(chainId: number): number {
  switch (chainId) {
    case 11155111: return 1;   // Sepolia -> Ethereum
    case 84532: return 8453;   // Base Sepolia -> Base
    default: return chainId;
  }
}
