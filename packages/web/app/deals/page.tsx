"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { useDealCount, useDeals } from "@/hooks/useDeal";
import { getDealStatusLabel, getDealStatusColor } from "@/lib/contracts";

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function DealsPage() {
  const { address } = useAccount();
  const { dealCount, isLoading: countLoading } = useDealCount();
  const count = dealCount ? Number(dealCount) : 0;
  const { deals, isLoading: dealsLoading } = useDeals(count);

  const isLoading = countLoading || dealsLoading;

  // Filter to deals involving connected wallet
  const myDeals = deals?.filter(
    (d) =>
      d.depositor.toLowerCase() === address?.toLowerCase() ||
      d.counterparty.toLowerCase() === address?.toLowerCase()
  );

  return (
    <main className="min-h-[calc(100vh-65px)]">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-medium text-foreground mb-1">my deals</h1>
            <p className="text-sm text-muted-foreground">
              {address ? "deals where you are depositor or counterparty" : "connect wallet to see your deals"}
            </p>
          </div>
          <Link
            href="/deals/new"
            className="px-4 py-2 text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            new deal
          </Link>
        </div>

        {!address && (
          <div className="border border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">connect your wallet to view deals</p>
          </div>
        )}

        {address && isLoading && (
          <div className="border border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">loading deals...</p>
          </div>
        )}

        {address && !isLoading && (!myDeals || myDeals.length === 0) && (
          <div className="border border-border p-8 text-center">
            <p className="text-sm text-muted-foreground mb-4">no deals yet</p>
            <Link
              href="/deals/new"
              className="text-sm text-primary hover:underline"
            >
              create your first deal
            </Link>
          </div>
        )}

        {myDeals && myDeals.length > 0 && (
          <div className="space-y-3">
            {myDeals.map((deal) => {
              const isDepositor = deal.depositor.toLowerCase() === address?.toLowerCase();
              return (
                <Link
                  key={deal.id.toString()}
                  href={`/deals/${deal.id.toString()}`}
                  className="block border border-border p-4 hover:border-muted-foreground transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">#{deal.id.toString()}</span>
                      <span className={`text-xs font-medium ${getDealStatusColor(deal.status)}`}>
                        {getDealStatusLabel(deal.status).toLowerCase()}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {formatUnits(deal.amount, 6)} USDC
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      {isDepositor ? "you" : truncateAddress(deal.depositor)} &rarr;{" "}
                      {!isDepositor ? "you" : truncateAddress(deal.counterparty)}
                    </span>
                    <span>yield split: {deal.yieldSplitCounterparty}% to counterparty</span>
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
