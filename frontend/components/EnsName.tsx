"use client";

import { useEnsName, useEnsAvatar } from "wagmi";
import { mainnet } from "wagmi/chains";
import type { Address } from "viem";

type EnsNameProps = {
  address: Address;
  className?: string;
  showAvatar?: boolean;
};

/**
 * Resolves an Ethereum address to its ENS name.
 * Falls back to truncated address if no ENS name is found.
 */
export function EnsName({ address, className, showAvatar = false }: EnsNameProps) {
  const { data: ensName } = useEnsName({
    address,
    chainId: mainnet.id,
  });

  const { data: avatarUrl } = useEnsAvatar({
    name: ensName ?? undefined,
    chainId: mainnet.id,
    query: { enabled: !!ensName && showAvatar },
  });

  const display = ensName ?? `${address.slice(0, 6)}...${address.slice(-4)}`;

  return (
    <span className={className}>
      {showAvatar && avatarUrl && (
        <img
          src={avatarUrl}
          alt={ensName ?? address}
          className="inline-block w-4 h-4 mr-1.5 align-text-bottom"
        />
      )}
      {display}
    </span>
  );
}
