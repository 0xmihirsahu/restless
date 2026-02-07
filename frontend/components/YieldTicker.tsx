"use client";

import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useAccruedYield } from "@/hooks/useDeal";

export function YieldTicker({ dealId, principal }: { dealId: bigint; principal: bigint }) {
  const { accruedYield } = useAccruedYield(dealId);
  const [displayYield, setDisplayYield] = useState("0.000000");

  useEffect(() => {
    if (accruedYield === undefined) return;

    const yieldNum = parseFloat(formatUnits(accruedYield, 6));
    const principalNum = parseFloat(formatUnits(principal, 6));

    const estimatedApy = 0.04;
    const perSecondYield = (principalNum * estimatedApy) / (365 * 24 * 3600);

    let currentYield = yieldNum;
    setDisplayYield(currentYield.toFixed(6));

    const interval = setInterval(() => {
      currentYield += perSecondYield;
      setDisplayYield(currentYield.toFixed(6));
    }, 100);

    return () => clearInterval(interval);
  }, [accruedYield, principal]);

  return (
    <div className="border border-accent/30 bg-accent/5 p-6 glow-amber animate-pulse-glow">
      <div className="text-xs text-accent font-medium mb-2 tracking-widest uppercase">yield accrued</div>
      <div className="text-2xl md:text-3xl font-bold text-foreground tabular-nums font-mono">
        ${displayYield}
        <span className="text-sm text-muted-foreground ml-2 font-body font-normal">USDC</span>
      </div>
      <div className="text-xs text-muted-foreground mt-3">
        earning via Aave V3 &mdash; updates every block
      </div>
    </div>
  );
}
