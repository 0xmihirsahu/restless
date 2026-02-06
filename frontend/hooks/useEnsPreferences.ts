"use client";

import { useEnsName, useEnsText } from "wagmi";
import { mainnet } from "wagmi/chains";
import type { Address } from "viem";

/**
 * ENS text record keys used by Restless for deal preferences.
 *
 * Counterparties can set these text records on their ENS name to
 * advertise their default deal preferences. When creating a deal,
 * the depositor's form auto-fills from the counterparty's ENS records.
 *
 * Records:
 * - com.restless.yield-split   → preferred yield split % (e.g. "80")
 * - com.restless.chain         → preferred settlement chain ID (e.g. "42161" for Arbitrum)
 * - com.restless.token         → preferred payout token symbol (e.g. "WETH")
 * - com.restless.timeout       → preferred dispute timeout in days (e.g. "14")
 */
export const ENS_RECORD_KEYS = {
  yieldSplit: "com.restless.yield-split",
  chain: "com.restless.chain",
  token: "com.restless.token",
  timeout: "com.restless.timeout",
} as const;

export type EnsPreferences = {
  yieldSplit: number | null;
  chain: number | null;
  token: string | null;
  timeout: number | null;
  ensName: string | null;
  hasPreferences: boolean;
};

/**
 * Read deal preferences from a counterparty's ENS text records.
 * Returns null values for any records that aren't set.
 */
export function useEnsPreferences(address: Address | undefined): EnsPreferences {
  const { data: ensName } = useEnsName({
    address,
    chainId: mainnet.id,
    query: { enabled: !!address },
  });

  const { data: yieldSplitRaw } = useEnsText({
    name: ensName ?? undefined,
    key: ENS_RECORD_KEYS.yieldSplit,
    chainId: mainnet.id,
    query: { enabled: !!ensName },
  });

  const { data: chainRaw } = useEnsText({
    name: ensName ?? undefined,
    key: ENS_RECORD_KEYS.chain,
    chainId: mainnet.id,
    query: { enabled: !!ensName },
  });

  const { data: token } = useEnsText({
    name: ensName ?? undefined,
    key: ENS_RECORD_KEYS.token,
    chainId: mainnet.id,
    query: { enabled: !!ensName },
  });

  const { data: timeoutRaw } = useEnsText({
    name: ensName ?? undefined,
    key: ENS_RECORD_KEYS.timeout,
    chainId: mainnet.id,
    query: { enabled: !!ensName },
  });

  const yieldSplit = yieldSplitRaw ? parseInt(yieldSplitRaw, 10) : null;
  const chain = chainRaw ? parseInt(chainRaw, 10) : null;
  const timeout = timeoutRaw ? parseInt(timeoutRaw, 10) : null;

  const hasPreferences = !!(yieldSplitRaw || chainRaw || token || timeoutRaw);

  return {
    yieldSplit: yieldSplit !== null && !isNaN(yieldSplit) ? yieldSplit : null,
    chain: chain !== null && !isNaN(chain) ? chain : null,
    token: token ?? null,
    timeout: timeout !== null && !isNaN(timeout) ? timeout : null,
    ensName: ensName ?? null,
    hasPreferences,
  };
}
