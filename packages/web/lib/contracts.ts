import { type Address } from "viem";

// Contract ABIs — exported from packages/contracts via `pnpm run export-abis`
export { restlessEscrowAbi } from "@/src/contracts";
export { settlementAbi } from "@/src/contracts";
export { aaveYieldAdapterAbi } from "@/src/contracts";
export { restlessSettlementHookAbi } from "@/src/contracts";

// Contract addresses — set after deployment
// For local dev, these can be overridden via .env.local
export const CONTRACTS = {
  escrow: (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? "0x") as Address,
  settlement: (process.env.NEXT_PUBLIC_SETTLEMENT_ADDRESS ?? "0x") as Address,
  yieldAdapter: (process.env.NEXT_PUBLIC_ADAPTER_ADDRESS ?? "0x") as Address,
  hook: (process.env.NEXT_PUBLIC_HOOK_ADDRESS ?? "0x") as Address,
  usdc: (process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "0x") as Address,
} as const;

// Deal status enum matches Solidity
export const DEAL_STATUS = {
  0: "Created",
  1: "Funded",
  2: "Settled",
  3: "Disputed",
  4: "TimedOut",
  5: "Cancelled",
} as const;

export type DealStatusCode = keyof typeof DEAL_STATUS;
export type DealStatusLabel = (typeof DEAL_STATUS)[DealStatusCode];

export function getDealStatusLabel(status: number): DealStatusLabel {
  return DEAL_STATUS[status as DealStatusCode] ?? "Unknown";
}

export function getDealStatusColor(status: number): string {
  switch (status) {
    case 0: return "text-muted-foreground"; // Created
    case 1: return "text-primary";           // Funded (active)
    case 2: return "text-green-500";         // Settled
    case 3: return "text-yellow-500";        // Disputed
    case 4: return "text-destructive";       // TimedOut
    case 5: return "text-muted-foreground";  // Cancelled
    default: return "text-muted-foreground";
  }
}
