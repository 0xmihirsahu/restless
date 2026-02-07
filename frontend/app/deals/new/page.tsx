"use client";

export const dynamic = "force-dynamic";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { isAddress, parseUnits } from "viem";
import { useCreateDeal, useApproveUSDC, useFundDeal } from "@/hooks/useEscrowWrite";
import { EnsAddressInput } from "@/components/EnsAddressInput";
import { EnsName } from "@/components/EnsName";
import { useEnsPreferences } from "@/hooks/useEnsPreferences";

export default function NewDealPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  const [counterparty, setCounterparty] = useState("");
  const [amount, setAmount] = useState("");
  const [yieldSplit, setYieldSplit] = useState(100);
  const [timeoutDays, setTimeoutDays] = useState(7);
  const [dealTerms, setDealTerms] = useState("");
  const [step, setStep] = useState<"form" | "approve" | "create" | "fund">("form");

  const { createDeal, isPending: createPending, isSuccess: createSuccess, createdDealId } = useCreateDeal();
  const { approve, isPending: approvePending, isSuccess: approveSuccess } = useApproveUSDC();
  const { fundDeal, isPending: fundPending, isSuccess: fundSuccess } = useFundDeal();

  const counterpartyAddr = isAddress(counterparty) ? counterparty as `0x${string}` : undefined;
  const prefs = useEnsPreferences(counterpartyAddr);
  const appliedPrefsFor = useRef<string | null>(null);

  useEffect(() => {
    if (!prefs.hasPreferences || !counterpartyAddr) return;
    if (appliedPrefsFor.current === counterpartyAddr) return;
    appliedPrefsFor.current = counterpartyAddr;

    if (prefs.yieldSplit !== null) setYieldSplit(prefs.yieldSplit);
    if (prefs.timeout !== null) setTimeoutDays(prefs.timeout);
  }, [prefs, counterpartyAddr]);

  const handleCounterpartyChange = useCallback((addr: string) => {
    setCounterparty(addr);
  }, []);

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
    if (createdDealId === null) return;
    fundDeal(createdDealId);
  }

  useEffect(() => {
    if (approveSuccess && step === "approve") {
      setStep("create");
    }
  }, [approveSuccess, step]);

  useEffect(() => {
    if (createSuccess && createdDealId !== null && step === "create") {
      setStep("fund");
    }
  }, [createSuccess, createdDealId, step]);

  useEffect(() => {
    if (fundSuccess && step === "fund") {
      router.push("/deals");
    }
  }, [fundSuccess, step, router]);

  if (!isConnected) {
    return (
      <main className="min-h-[calc(100vh-65px)]">
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="border border-border p-8 text-center animate-fade-up">
            <p className="text-sm text-muted-foreground">connect your wallet to create a deal</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-65px)]">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-10 animate-fade-up">
          <h1 className="text-2xl font-bold text-foreground mb-1 font-display tracking-tight">create a deal</h1>
          <p className="text-sm text-muted-foreground">
            set terms, fund with USDC, and start earning yield immediately
          </p>
        </div>

        {step === "form" && (
          <form onSubmit={handleSubmit} className="space-y-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
            <EnsAddressInput
              value={counterparty}
              onChange={handleCounterpartyChange}
              selfAddress={address}
            />

            {prefs.hasPreferences && prefs.ensName && (
              <div className="border border-emerald/30 bg-emerald/5 p-3 space-y-1">
                <div className="text-xs text-emerald font-medium">
                  deal preferences loaded from {prefs.ensName}
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {prefs.yieldSplit !== null && (
                    <div>preferred yield split: {prefs.yieldSplit}%</div>
                  )}
                  {prefs.timeout !== null && (
                    <div>preferred timeout: {prefs.timeout} days</div>
                  )}
                  {prefs.chain !== null && (
                    <div>preferred chain: {prefs.chain}</div>
                  )}
                  {prefs.token && (
                    <div>preferred token: {prefs.token}</div>
                  )}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-foreground mb-1.5">
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
                className="w-full px-3 py-2.5 text-sm bg-background border border-input text-foreground placeholder:text-muted-foreground font-mono"
              />
            </div>

            <div>
              <label htmlFor="yieldSplit" className="block text-sm font-medium text-foreground mb-1.5">
                yield split to counterparty: <span className="text-accent font-bold">{yieldSplit}%</span>
              </label>
              <input
                id="yieldSplit"
                type="range"
                min="0"
                max="100"
                value={yieldSplit}
                onChange={(e) => setYieldSplit(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>0% (all yield to you)</span>
                <span>100% (yield bonus to counterparty)</span>
              </div>
            </div>

            <div>
              <label htmlFor="timeout" className="block text-sm font-medium text-foreground mb-1.5">
                dispute timeout: <span className="font-bold">{timeoutDays} day{timeoutDays !== 1 ? "s" : ""}</span>
              </label>
              <input
                id="timeout"
                type="range"
                min="1"
                max="30"
                value={timeoutDays}
                onChange={(e) => setTimeoutDays(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>1 day</span>
                <span>30 days</span>
              </div>
            </div>

            <div>
              <label htmlFor="terms" className="block text-sm font-medium text-foreground mb-1.5">
                deal terms / description
              </label>
              <textarea
                id="terms"
                placeholder="Describe what this deal is for..."
                value={dealTerms}
                onChange={(e) => setDealTerms(e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 text-sm bg-background border border-input text-foreground placeholder:text-muted-foreground resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1">
                this will be hashed on-chain as the deal commitment
              </p>
            </div>

            <button
              type="submit"
              disabled={!isValidForm}
              className="w-full px-4 py-3 text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              continue to funding
            </button>
          </form>
        )}

        {step !== "form" && (
          <div className="space-y-4 animate-fade-up">
            <div className="border border-border p-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">counterparty</span>
                <span className="text-foreground font-mono text-xs">
                  {isAddress(counterparty) ? (
                    <EnsName address={counterparty as `0x${string}`} />
                  ) : (
                    `${counterparty.slice(0, 10)}...${counterparty.slice(-6)}`
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">amount</span>
                <span className="text-foreground font-mono">{amount} USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">yield split</span>
                <span className="text-accent font-medium">{yieldSplit}% to counterparty</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">timeout</span>
                <span className="text-foreground">{timeoutDays} day{timeoutDays !== 1 ? "s" : ""}</span>
              </div>
            </div>

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
          ? "border-emerald/30 bg-emerald/5"
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
        {done && <span className="text-xs font-medium text-emerald">done</span>}
        {loading && <span className="text-xs text-primary animate-pulse">confirming...</span>}
      </div>
    </button>
  );
}
