"use client";

import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { toast } from "sonner";
import { restlessEscrowAbi, CONTRACTS } from "@/lib/contracts";
import { type Address, keccak256, toHex, parseUnits } from "viem";

export function useCreateDeal() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  function createDeal(params: {
    counterparty: Address;
    amount: string; // human-readable USDC amount
    yieldSplitCounterparty: number;
    timeoutDays: number;
    dealTerms: string;
  }) {
    const amountParsed = parseUnits(params.amount, 6);
    const timeout = BigInt(params.timeoutDays * 86400);
    const dealHash = keccak256(toHex(params.dealTerms));

    writeContract({
      address: CONTRACTS.escrow,
      abi: restlessEscrowAbi,
      functionName: "createDeal",
      args: [params.counterparty, amountParsed, params.yieldSplitCounterparty, timeout, dealHash],
    }, {
      onSuccess: () => toast.success("Deal created! Now fund it to start earning yield."),
      onError: (err) => toast.error(err.message.slice(0, 100)),
    });
  }

  return { createDeal, hash, isPending, isConfirming, isSuccess, error };
}

export function useFundDeal() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  function fundDeal(dealId: bigint) {
    writeContract({
      address: CONTRACTS.escrow,
      abi: restlessEscrowAbi,
      functionName: "fundDeal",
      args: [dealId],
    }, {
      onSuccess: () => toast.success("Deal funded! Yield is now accruing in Aave."),
      onError: (err) => toast.error(err.message.slice(0, 100)),
    });
  }

  return { fundDeal, hash, isPending, isConfirming, isSuccess, error };
}

export function useSettleDeal() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  function settleDeal(dealId: bigint) {
    writeContract({
      address: CONTRACTS.escrow,
      abi: restlessEscrowAbi,
      functionName: "settleDeal",
      args: [dealId, "0x"],
    }, {
      onSuccess: () => toast.success("Deal settled! Funds distributed."),
      onError: (err) => toast.error(err.message.slice(0, 100)),
    });
  }

  return { settleDeal, hash, isPending, isConfirming, isSuccess, error };
}

export function useDisputeDeal() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  function disputeDeal(dealId: bigint) {
    writeContract({
      address: CONTRACTS.escrow,
      abi: restlessEscrowAbi,
      functionName: "disputeDeal",
      args: [dealId],
    }, {
      onSuccess: () => toast("Deal disputed. Timeout period started."),
      onError: (err) => toast.error(err.message.slice(0, 100)),
    });
  }

  return { disputeDeal, hash, isPending, isConfirming, isSuccess, error };
}

export function useCancelDeal() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  function cancelDeal(dealId: bigint) {
    writeContract({
      address: CONTRACTS.escrow,
      abi: restlessEscrowAbi,
      functionName: "cancelDeal",
      args: [dealId],
    }, {
      onSuccess: () => toast("Deal cancelled."),
      onError: (err) => toast.error(err.message.slice(0, 100)),
    });
  }

  return { cancelDeal, hash, isPending, isConfirming, isSuccess, error };
}

export function useClaimTimeout() {
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  function claimTimeout(dealId: bigint) {
    writeContract({
      address: CONTRACTS.escrow,
      abi: restlessEscrowAbi,
      functionName: "claimTimeout",
      args: [dealId],
    }, {
      onSuccess: () => toast.success("Timeout claimed. Funds refunded."),
      onError: (err) => toast.error(err.message.slice(0, 100)),
    });
  }

  return { claimTimeout, hash, isPending, isConfirming, isSuccess, error };
}

export function useApproveUSDC() {
  const erc20Abi = [
    {
      name: "approve",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        { name: "spender", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      outputs: [{ type: "bool" }],
    },
  ] as const;

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  function approve(amount: bigint) {
    writeContract({
      address: CONTRACTS.usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [CONTRACTS.escrow, amount],
    }, {
      onSuccess: () => toast.success("USDC approved."),
      onError: (err) => toast.error(err.message.slice(0, 100)),
    });
  }

  return { approve, hash, isPending, isConfirming, isSuccess, error };
}
