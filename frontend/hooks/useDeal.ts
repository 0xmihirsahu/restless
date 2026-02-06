"use client";

import { type Abi } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { restlessEscrowAbi, CONTRACTS } from "@/lib/contracts";

const escrowAbi = restlessEscrowAbi as Abi;

export type Deal = {
  id: bigint;
  depositor: `0x${string}`;
  counterparty: `0x${string}`;
  amount: bigint;
  yieldSplitCounterparty: number;
  status: number;
  timeout: bigint;
  dealHash: `0x${string}`;
  createdAt: bigint;
  fundedAt: bigint;
  disputedAt: bigint;
};

export function useDeal(dealId: bigint | undefined) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: CONTRACTS.escrow,
    abi: restlessEscrowAbi,
    functionName: "getDeal",
    args: dealId !== undefined ? [dealId] : undefined,
    query: {
      enabled: dealId !== undefined && CONTRACTS.escrow !== "0x",
    },
  });

  return {
    deal: data as Deal | undefined,
    isLoading,
    error,
    refetch,
  };
}

export function useDealCount() {
  const { data, isLoading, error } = useReadContract({
    address: CONTRACTS.escrow,
    abi: restlessEscrowAbi,
    functionName: "dealCount",
    query: {
      enabled: CONTRACTS.escrow !== "0x",
    },
  });

  return {
    dealCount: data as bigint | undefined,
    isLoading,
    error,
  };
}

export function useAccruedYield(dealId: bigint | undefined) {
  const { data, isLoading, error } = useReadContract({
    address: CONTRACTS.escrow,
    abi: restlessEscrowAbi,
    functionName: "getAccruedYield",
    args: dealId !== undefined ? [dealId] : undefined,
    query: {
      enabled: dealId !== undefined && CONTRACTS.escrow !== "0x",
      refetchInterval: 12_000, // refetch every block (~12s)
    },
  });

  return {
    accruedYield: data as bigint | undefined,
    isLoading,
    error,
  };
}

export function useDeals(count: number) {
  const contracts = Array.from({ length: count }, (_, i) => ({
    address: CONTRACTS.escrow,
    abi: escrowAbi,
    functionName: "getDeal" as const,
    args: [BigInt(i + 1)] as const,
  }));

  const { data, isLoading, error } = useReadContracts({
    contracts,
    query: {
      enabled: count > 0 && CONTRACTS.escrow !== "0x",
    },
  });

  const deals = data
    ?.map((result) => (result.status === "success" ? (result.result as Deal) : null))
    .filter((d): d is Deal => d !== null && d.id !== 0n);

  return { deals, isLoading, error };
}
