"use client";

export const dynamic = "force-dynamic";

import { use, useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useDeal } from "@/hooks/useDeal";
import { useSettleDeal, useSettleDealWithHook, useDisputeDeal, useCancelDeal, useClaimTimeout, useFundDeal, useApproveUSDC } from "@/hooks/useEscrowWrite";
import { getDealStatusLabel, getDealStatusColor } from "@/lib/contracts";
import { YieldTicker } from "@/components/YieldTicker";
import { CrossChainSettle } from "@/components/CrossChainSettle";
import { StateChannelPanel } from "@/components/StateChannelPanel";
import { EnsName } from "@/components/EnsName";
import { PageTransition } from "@/components/PageTransition";
import { DealDetailSkeleton } from "@/components/Skeleton";
import { ConfirmModal } from "@/components/ConfirmModal";

function formatTimestamp(ts: bigint) {
  if (ts === 0n) return "\u2014";
  return new Date(Number(ts) * 1000).toLocaleString();
}

export default function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const dealId = BigInt(id);
  const { address } = useAccount();
  const { deal, isLoading, refetch } = useDeal(dealId);
  const { resolvedTheme } = useTheme();
  const [themeMounted, setThemeMounted] = useState(false);
  useEffect(() => setThemeMounted(true), []);
  const isLight = themeMounted && resolvedTheme === "light";

  const { settleDeal, isPending: settlePending, isSuccess: settleSuccess } = useSettleDeal();
  const { settleDealWithHook, isPending: hookPending, isSuccess: hookSuccess } = useSettleDealWithHook();
  const { disputeDeal, isPending: disputePending, isSuccess: disputeSuccess } = useDisputeDeal();
  const { cancelDeal, isPending: cancelPending, isSuccess: cancelSuccess } = useCancelDeal();
  const { claimTimeout, isPending: claimPending, isSuccess: claimSuccess } = useClaimTimeout();
  const { fundDeal, isPending: fundPending, isSuccess: fundSuccessFlag } = useFundDeal();
  const { approve, isPending: approvePending, isSuccess: approveSuccess } = useApproveUSDC();
  const [approvedForFund, setApprovedForFund] = useState(false);

  // Confirmation modals
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  useEffect(() => {
    if (approveSuccess) setApprovedForFund(true);
  }, [approveSuccess]);

  // Auto-refetch after successful actions with delay for RPC lag
  const delayedRefetch = useCallback(() => {
    setTimeout(() => refetch(), 2000);
  }, [refetch]);

  useEffect(() => {
    if (settleSuccess) { toast.success("deal settled"); delayedRefetch(); }
  }, [settleSuccess, delayedRefetch]);

  useEffect(() => {
    if (hookSuccess) { toast.success("deal settled with yield swap"); delayedRefetch(); }
  }, [hookSuccess, delayedRefetch]);

  useEffect(() => {
    if (disputeSuccess) { toast.success("deal disputed"); delayedRefetch(); }
  }, [disputeSuccess, delayedRefetch]);

  useEffect(() => {
    if (cancelSuccess) { toast.success("deal cancelled"); delayedRefetch(); }
  }, [cancelSuccess, delayedRefetch]);

  useEffect(() => {
    if (claimSuccess) { toast.success("timeout claimed — funds returned"); delayedRefetch(); }
  }, [claimSuccess, delayedRefetch]);

  useEffect(() => {
    if (fundSuccessFlag) { toast.success("deal funded — yield starts now"); delayedRefetch(); }
  }, [fundSuccessFlag, delayedRefetch]);

  if (isLoading) {
    return (
      <main className="min-h-[calc(100vh-65px)]">
        <PageTransition>
          <div className="max-w-3xl mx-auto px-6 py-12">
            <DealDetailSkeleton />
          </div>
        </PageTransition>
      </main>
    );
  }

  if (!deal || deal.id === 0n) {
    return (
      <main className="min-h-[calc(100vh-65px)]">
        <PageTransition>
          <div className="max-w-3xl mx-auto px-6 py-16 flex flex-col items-center justify-center">
            <Image src={isLight ? "/brand/error-state-light.svg" : "/brand/error-state.svg"} alt="Not found" width={160} height={140} className="mb-4 opacity-80" />
            <p className="text-sm text-muted-foreground">deal #{id} not found</p>
          </div>
        </PageTransition>
      </main>
    );
  }

  const isDepositor = address?.toLowerCase() === deal.depositor.toLowerCase();
  const isCounterparty = address?.toLowerCase() === deal.counterparty.toLowerCase();
  const isParty = isDepositor || isCounterparty;

  const canFund = deal.status === 0 && isDepositor;
  const canCancel = deal.status === 0 && isParty;
  const canSettle = deal.status === 1 && isParty;
  const canDispute = deal.status === 1 && isParty;
  const canClaimTimeout = deal.status === 3 && isDepositor;

  return (
    <main className="min-h-[calc(100vh-65px)]">
      <PageTransition>
        <div className="max-w-3xl mx-auto px-6 py-12">
          {/* Header */}
          <motion.div
            className="flex items-center justify-between mb-10"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-foreground font-display tracking-tight">deal #{deal.id.toString()}</h1>
                <span className={`text-xs font-medium px-2 py-0.5 border ${getDealStatusColor(deal.status)}`}>
                  {getDealStatusLabel(deal.status).toLowerCase()}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-mono">{formatUnits(deal.amount, 6)}</span> USDC escrow
              </p>
            </div>
          </motion.div>

          {/* Yield Ticker */}
          {(deal.status === 1 || deal.status === 3) && (
            <motion.div
              className="mb-8"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <YieldTicker dealId={dealId} principal={deal.amount} />
            </motion.div>
          )}

          {/* Deal Details */}
          <motion.div
            className="border border-border p-5 space-y-3 text-sm mb-8"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex justify-between">
              <span className="text-muted-foreground">depositor</span>
              <span className="text-foreground font-mono text-xs">
                {isDepositor ? "you" : (
                  <EnsName address={deal.depositor as `0x${string}`} showAvatar />
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">counterparty</span>
              <span className="text-foreground font-mono text-xs">
                {isCounterparty ? "you" : (
                  <EnsName address={deal.counterparty as `0x${string}`} showAvatar />
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">amount</span>
              <span className="text-foreground font-mono">{formatUnits(deal.amount, 6)} USDC</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">yield split</span>
              <span className="text-accent font-medium">{deal.yieldSplitCounterparty}% to counterparty</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">dispute timeout</span>
              <span className="text-foreground">{Number(deal.timeout) / 86400} day(s)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">deal hash</span>
              <span className="text-foreground font-mono text-xs">{deal.dealHash.slice(0, 14)}...</span>
            </div>
          </motion.div>

          {/* Timeline */}
          <motion.div
            className="border border-border p-5 space-y-3 text-sm mb-8"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <div className="text-xs text-muted-foreground mb-2 tracking-widest uppercase font-medium">timeline</div>
            <TimelineItem label="created" timestamp={deal.createdAt} />
            <TimelineItem label="funded" timestamp={deal.fundedAt} />
            {deal.disputedAt > 0n && (
              <TimelineItem label="disputed" timestamp={deal.disputedAt} />
            )}
            {deal.status === 2 && (
              <div className="flex items-center gap-2">
                <Image src={isLight ? "/brand/success-state-light.svg" : "/brand/success-state.svg"} alt="" width={20} height={20} />
                <span className="text-emerald font-medium">settled</span>
              </div>
            )}
            {deal.status === 4 && (
              <div className="flex items-center gap-2">
                <Image src={isLight ? "/brand/error-state-light.svg" : "/brand/error-state.svg"} alt="" width={20} height={20} />
                <span className="text-destructive">timed out — refunded to depositor</span>
              </div>
            )}
            {deal.status === 5 && (
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                <span className="text-muted-foreground">cancelled</span>
              </div>
            )}
          </motion.div>

          {/* State Channel (Yellow Network) */}
          {deal.status === 1 && isParty && (
            <motion.div
              className="mb-8"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <StateChannelPanel
                dealId={id}
                counterparty={deal.counterparty as `0x${string}`}
                depositor={deal.depositor as `0x${string}`}
                amount={formatUnits(deal.amount, 6)}
                isDepositor={isDepositor}
              />
            </motion.div>
          )}

          {/* Actions */}
          {isParty && (
            <motion.div
              className="space-y-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              {canFund && !approvedForFund && (
                <button
                  onClick={() => { approve(deal.amount); }}
                  disabled={approvePending}
                  className="w-full px-4 py-3 text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {approvePending ? "confirming..." : "approve USDC"}
                </button>
              )}
              {canFund && approvedForFund && (
                <button
                  onClick={() => { fundDeal(dealId); }}
                  disabled={fundPending}
                  className="w-full px-4 py-3 text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {fundPending ? "confirming..." : "fund deal"}
                </button>
              )}
              {canSettle && (
                <CrossChainSettle
                  dealId={dealId}
                  counterparty={deal.counterparty}
                  amount={deal.amount}
                  onSettle={(lifiData) => {
                    settleDeal(dealId, lifiData);
                  }}
                  onSettleWithHook={(preferredToken) => {
                    settleDealWithHook(dealId, preferredToken);
                  }}
                  isPending={settlePending || hookPending}
                />
              )}
              {canDispute && (
                <>
                  <button
                    onClick={() => setDisputeModalOpen(true)}
                    disabled={disputePending}
                    className="w-full px-4 py-3 text-sm font-medium border border-accent text-accent hover:bg-accent/10 transition-colors disabled:opacity-40"
                  >
                    {disputePending ? "confirming..." : "dispute deal"}
                  </button>
                  <ConfirmModal
                    open={disputeModalOpen}
                    onClose={() => setDisputeModalOpen(false)}
                    onConfirm={() => disputeDeal(dealId)}
                    title="dispute this deal?"
                    description="This starts the dispute timeout clock. After the timeout period, the depositor can reclaim funds if no resolution is reached."
                    confirmLabel="dispute"
                    confirmClassName="bg-accent text-accent-foreground"
                  />
                </>
              )}
              {canCancel && (
                <>
                  <button
                    onClick={() => setCancelModalOpen(true)}
                    disabled={cancelPending}
                    className="w-full px-4 py-3 text-sm border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors disabled:opacity-40"
                  >
                    {cancelPending ? "confirming..." : "cancel deal"}
                  </button>
                  <ConfirmModal
                    open={cancelModalOpen}
                    onClose={() => setCancelModalOpen(false)}
                    onConfirm={() => cancelDeal(dealId)}
                    title="cancel this deal?"
                    description="Funds will be returned to the depositor. This action cannot be undone."
                    confirmLabel="cancel deal"
                  />
                </>
              )}
              {canClaimTimeout && (
                <button
                  onClick={() => { claimTimeout(dealId); }}
                  disabled={claimPending}
                  className="w-full px-4 py-3 text-sm font-medium bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {claimPending ? "confirming..." : "claim timeout refund"}
                </button>
              )}
            </motion.div>
          )}
        </div>
      </PageTransition>
    </main>
  );
}

function TimelineItem({ label, timestamp }: { label: string; timestamp: bigint }) {
  if (timestamp === 0n) return null;
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
        <span className="text-foreground">{label}</span>
      </div>
      <span className="text-xs text-muted-foreground font-mono">{formatTimestamp(timestamp)}</span>
    </div>
  );
}
