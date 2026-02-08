"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { useTheme } from "next-themes";
import { useDealCount, useDeals } from "@/hooks/useDeal";
import { getDealStatusLabel, getDealStatusColor } from "@/lib/contracts";
import { EnsName } from "@/components/EnsName";

export default function DealsPage() {
  const { address } = useAccount();
  const { dealCount, isLoading: countLoading } = useDealCount();
  const count = dealCount ? Number(dealCount) : 0;
  const { deals, isLoading: dealsLoading } = useDeals(count);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isLight = mounted && resolvedTheme === "light";
  const isLoading = countLoading || dealsLoading;

  const myDeals = deals?.filter(
    (d) =>
      d.depositor.toLowerCase() === address?.toLowerCase() ||
      d.counterparty.toLowerCase() === address?.toLowerCase()
  );

  return (
    <main className="min-h-[calc(100vh-65px)]">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-10 animate-fade-up">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1 font-display tracking-tight">my deals</h1>
            <p className="text-sm text-muted-foreground">
              {address ? "deals where you are depositor or counterparty" : "connect wallet to see your deals"}
            </p>
          </div>
          <Link
            href="/deals/new"
            className="px-5 py-2.5 text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            new deal
          </Link>
        </div>

        {!address && (
          <div className="border border-border p-8 text-center animate-fade-up">
            <p className="text-sm text-muted-foreground">connect your wallet to view deals</p>
          </div>
        )}

        {address && isLoading && (
          <div className="border border-border p-12 text-center flex flex-col items-center animate-fade-up">
            <Image src={isLight ? "/brand/loading-spinner-light.svg" : "/brand/loading-spinner.svg"} alt="" width={48} height={48} className="mb-4 animate-spin" />
            <p className="text-sm text-muted-foreground">loading deals...</p>
          </div>
        )}

        {address && !isLoading && (!myDeals || myDeals.length === 0) && (
          <div className="border border-border p-10 text-center flex flex-col items-center animate-fade-up">
            <Image src={isLight ? "/brand/empty-state-light.svg" : "/brand/empty-state.svg"} alt="No deals" width={200} height={175} className="mb-6 opacity-80" />
            <p className="text-sm text-muted-foreground mb-4">no deals yet</p>
            <Link
              href="/deals/new"
              className="text-sm font-medium text-primary hover:underline"
            >
              create your first deal
            </Link>
          </div>
        )}

        {myDeals && myDeals.length > 0 && (
          <div className="space-y-3">
            {myDeals.map((deal, i) => {
              const isDepositor = deal.depositor.toLowerCase() === address?.toLowerCase();
              return (
                <Link
                  key={deal.id.toString()}
                  href={`/deals/${deal.id.toString()}`}
                  className="block border border-border p-5 hover:border-primary/30 transition-colors animate-fade-up group"
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-muted-foreground">#{deal.id.toString()}</span>
                      <span className={`text-xs font-medium ${getDealStatusColor(deal.status)}`}>
                        {getDealStatusLabel(deal.status).toLowerCase()}
                      </span>
                    </div>
                    <span className="text-sm font-bold font-mono text-foreground">
                      {formatUnits(deal.amount, 6)} <span className="text-muted-foreground font-normal">USDC</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      {isDepositor ? "you" : (
                        <EnsName address={deal.depositor as `0x${string}`} />
                      )} &rarr;{" "}
                      {!isDepositor ? "you" : (
                        <EnsName address={deal.counterparty as `0x${string}`} />
                      )}
                    </span>
                    <span className="text-accent">yield: {deal.yieldSplitCounterparty}% to counterparty</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
