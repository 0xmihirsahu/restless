"use client";

import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useAccruedYield } from "@/hooks/useDeal";

export function YieldTicker({ dealId, principal }: { dealId: bigint; principal: bigint }) {
  const { accruedYield } = useAccruedYield(dealId);
  const [displayYield, setDisplayYield] = useState("0.000000");

  // Animate between on-chain reads by interpolating
  useEffect(() => {
    if (accruedYield === undefined) return;

    const yieldNum = parseFloat(formatUnits(accruedYield, 6));
    const principalNum = parseFloat(formatUnits(principal, 6));

    // Estimate APY-based per-second yield for smooth animation
    // Aave USDC is ~3-5% APY, use 4% as estimate
    const estimatedApy = 0.04;
    const perSecondYield = (principalNum * estimatedApy) / (365 * 24 * 3600);

    let currentYield = yieldNum;
    setDisplayYield(currentYield.toFixed(6));

    const interval = setInterval(() => {
      currentYield += perSecondYield;
      setDisplayYield(currentYield.toFixed(6));
    }, 100); // update 10x per second for smooth animation

    return () => clearInterval(interval);
  }, [accruedYield, principal]);

  return (
    <div className="border border-primary/30 bg-primary/5 p-6">
      <div className="text-xs text-primary mb-2 tracking-wide">yield accrued</div>
      <div className="text-2xl md:text-3xl font-semibold text-foreground tabular-nums">
        ${displayYield}
        <span className="text-sm text-muted-foreground ml-1">USDC</span>
      </div>
      <div className="text-xs text-muted-foreground mt-2">
        earning via Aave V3 &mdash; updates every block
      </div>
    </div>
  );
}
