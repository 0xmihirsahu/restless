"use client";

import { useState, useEffect } from "react";
import { useEnsAddress, useEnsName } from "wagmi";
import { mainnet } from "wagmi/chains";
import { isAddress } from "viem";

type EnsAddressInputProps = {
  value: string;
  onChange: (address: string) => void;
  selfAddress?: string;
};

/**
 * Input that accepts both raw Ethereum addresses and ENS names.
 * When an ENS name is entered (e.g. "vitalik.eth"), it resolves to the
 * underlying address. When a raw address is entered, it reverse-resolves
 * to show the ENS name if one exists.
 */
export function EnsAddressInput({ value, onChange, selfAddress }: EnsAddressInputProps) {
  const [input, setInput] = useState(value);
  const isEnsInput = input.includes(".") && !isAddress(input);
  const isRawAddress = isAddress(input);

  // Forward resolve: ENS name → address
  const { data: resolvedAddress, isLoading: isResolving } = useEnsAddress({
    name: isEnsInput ? input : undefined,
    chainId: mainnet.id,
    query: { enabled: isEnsInput },
  });

  // Reverse resolve: address → ENS name (for display)
  const { data: reverseName } = useEnsName({
    address: isRawAddress ? (input as `0x${string}`) : undefined,
    chainId: mainnet.id,
    query: { enabled: isRawAddress },
  });

  // Push resolved address to parent
  useEffect(() => {
    if (isEnsInput && resolvedAddress) {
      onChange(resolvedAddress);
    } else if (isRawAddress) {
      onChange(input);
    } else if (!isEnsInput && !isRawAddress) {
      onChange("");
    }
  }, [isEnsInput, isRawAddress, resolvedAddress, input, onChange]);

  const isSelf = value && selfAddress && value.toLowerCase() === selfAddress.toLowerCase();

  return (
    <div>
      <label htmlFor="counterparty" className="block text-sm text-foreground mb-1.5">
        counterparty address
      </label>
      <input
        id="counterparty"
        type="text"
        placeholder="vitalik.eth or 0x..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        className="w-full px-3 py-2 text-sm bg-background border border-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
      />

      {/* Resolution feedback */}
      <div className="mt-1 min-h-5">
        {isEnsInput && isResolving && (
          <p className="text-xs text-muted-foreground animate-pulse">resolving {input}...</p>
        )}
        {isEnsInput && !isResolving && resolvedAddress && (
          <p className="text-xs text-green-500">
            {input} → {resolvedAddress.slice(0, 6)}...{resolvedAddress.slice(-4)}
          </p>
        )}
        {isEnsInput && !isResolving && !resolvedAddress && input.length > 3 && (
          <p className="text-xs text-destructive">could not resolve {input}</p>
        )}
        {isRawAddress && reverseName && (
          <p className="text-xs text-green-500">{reverseName}</p>
        )}
        {input && !isEnsInput && !isRawAddress && (
          <p className="text-xs text-destructive">enter a valid address or ENS name</p>
        )}
        {isSelf && (
          <p className="text-xs text-destructive">cannot create deal with yourself</p>
        )}
      </div>
    </div>
  );
}
