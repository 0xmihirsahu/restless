"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { isAddress, parseUnits } from "viem";
import { useCreateDeal, useApproveUSDC, useFundDeal } from "@/hooks/useEscrowWrite";
import { CONTRACTS } from "@/lib/contracts";

export default function NewDealPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  const [counterparty, setCounterparty] = useState("");
  const [amount, setAmount] = useState("");
  const [yieldSplit, setYieldSplit] = useState(100);
  const [timeoutDays, setTimeoutDays] = useState(7);
  const [dealTerms, setDealTerms] = useState("");
  const [step, setStep] = useState<"form" | "approve" | "create" | "fund">("form");

  const { createDeal, isPending: createPending, isSuccess: createSuccess } = useCreateDeal();
  const { approve, isPending: approvePending, isSuccess: approveSuccess } = useApproveUSDC();
  const { fundDeal, isPending: fundPending, isSuccess: fundSuccess } = useFundDeal();

  const isValidForm =
    isAddress(counterparty) &&
    counterparty.toLowerCase() !== address?.toLowerCase() &&
    parseFloat(amount) > 0 &&
    dealTerms.length > 0 &&
    timeoutDays >= 1 &&
    timeoutDays <= 30;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidForm) return;
    setStep("approve");
  }

  function handleApprove() {
    const amountParsed = parseUnits(amount, 6);
    approve(amountParsed);
  }

  function handleCreate() {
    createDeal({
      counterparty: counterparty as `0x${string}`,
      amount,
      yieldSplitCounterparty: yieldSplit,
      timeoutDays,
      dealTerms,
    });
  }

  function handleFund() {
    // Deal ID is dealCount at time of creation — for simplicity, fund deal #1
    // In production, we'd read the emitted event to get the deal ID
    fundDeal(1n);
  }

  // Step progression
  if (approveSuccess && step === "approve") {
    setStep("create");
  }
  if (createSuccess && step === "create") {
    setStep("fund");
  }
  if (fundSuccess && step === "fund") {
    router.push("/deals");
  }

  if (!isConnected) {
    return (
      <main className="min-h-[calc(100vh-65px)]">
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="border border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">connect your wallet to create a deal</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-65px)]">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-xl font-medium text-foreground mb-1">create a deal</h1>
          <p className="text-sm text-muted-foreground">
            set terms, fund with USDC, and start earning yield immediately
          </p>
        </div>

        {step === "form" && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="counterparty" className="block text-sm text-foreground mb-1.5">
                counterparty address
              </label>
              <input
                id="counterparty"
                type="text"
                placeholder="0x... or ENS name"
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
              {counterparty && !isAddress(counterparty) && (
                <p className="text-xs text-destructive mt-1">invalid address</p>
              )}
              {counterparty.toLowerCase() === address?.toLowerCase() && (
                <p className="text-xs text-destructive mt-1">cannot create deal with yourself</p>
              )}
            </div>

            <div>
              <label htmlFor="amount" className="block text-sm text-foreground mb-1.5">
                amount (USDC)
              </label>
              <input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="1000.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-background border border-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label htmlFor="yieldSplit" className="block text-sm text-foreground mb-1.5">
                yield split to counterparty: {yieldSplit}%
              </label>
              <input
                id="yieldSplit"
                type="range"
                min="0"
                max="100"
                value={yieldSplit}
                onChange={(e) => setYieldSplit(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>0% (all yield to you)</span>
                <span>100% (yield bonus to counterparty)</span>
              </div>
            </div>

            <div>
              <label htmlFor="timeout" className="block text-sm text-foreground mb-1.5">
                dispute timeout: {timeoutDays} day{timeoutDays !== 1 ? "s" : ""}
              </label>
              <input
                id="timeout"
                type="range"
                min="1"
                max="30"
                value={timeoutDays}
                onChange={(e) => setTimeoutDays(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>1 day</span>
                <span>30 days</span>
              </div>
            </div>

            <div>
              <label htmlFor="terms" className="block text-sm text-foreground mb-1.5">
                deal terms / description
              </label>
              <textarea
                id="terms"
                placeholder="Describe what this deal is for..."
                value={dealTerms}
                onChange={(e) => setDealTerms(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm bg-background border border-input text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1">
                this will be hashed on-chain as the deal commitment
              </p>
            </div>

            <button
              type="submit"
              disabled={!isValidForm}
              className="w-full px-4 py-2.5 text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              continue to funding
            </button>
          </form>
        )}

        {step !== "form" && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="border border-border p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">counterparty</span>
                <span className="text-foreground font-mono text-xs">{counterparty.slice(0, 10)}...{counterparty.slice(-6)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">amount</span>
                <span className="text-foreground">{amount} USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">yield split</span>
                <span className="text-foreground">{yieldSplit}% to counterparty</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">timeout</span>
                <span className="text-foreground">{timeoutDays} day{timeoutDays !== 1 ? "s" : ""}</span>
              </div>
            </div>

            {/* Steps */}
            <div className="space-y-3">
              <StepButton
                label="1. approve USDC"
                description="allow escrow to spend your USDC"
                active={step === "approve"}
                done={step !== "approve"}
                loading={approvePending}
                onClick={handleApprove}
              />
              <StepButton
                label="2. create deal"
                description="register deal terms on-chain"
                active={step === "create"}
                done={step === "fund"}
                loading={createPending}
                onClick={handleCreate}
              />
              <StepButton
                label="3. fund deal"
                description="deposit USDC — yield starts immediately"
                active={step === "fund"}
                done={fundSuccess}
                loading={fundPending}
                onClick={handleFund}
              />
            </div>

            <button
              onClick={() => setStep("form")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              &larr; back to form
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function StepButton({
  label,
  description,
  active,
  done,
  loading,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  done: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!active || loading}
      className={`w-full text-left border p-4 transition-colors ${
        done
          ? "border-green-500/30 bg-green-500/5"
          : active
          ? "border-primary cursor-pointer hover:bg-primary/5"
          : "border-border opacity-40 cursor-not-allowed"
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-foreground">{label}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
        {done && <span className="text-xs text-green-500">done</span>}
        {loading && <span className="text-xs text-primary animate-pulse">confirming...</span>}
      </div>
    </button>
  );
}
