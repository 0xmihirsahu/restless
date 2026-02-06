"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export function WalletButton() {
  const [hasProvider, setHasProvider] = useState(false);

  useEffect(() => {
    setHasProvider(!!process.env.NEXT_PUBLIC_RAINBOWKIT_PROJECT_ID);
  }, []);

  if (!hasProvider) {
    return (
      <span className="text-xs text-muted-foreground">
        no wallet provider
      </span>
    );
  }

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: {
                opacity: 0,
                pointerEvents: "none" as const,
                userSelect: "none" as const,
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    className="px-4 py-2 text-sm border border-primary text-primary hover:bg-primary hover:text-black transition-colors"
                  >
                    connect wallet
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    className="px-4 py-2 text-sm border border-destructive text-destructive hover:bg-destructive hover:text-white transition-colors"
                  >
                    wrong network
                  </button>
                );
              }

              return (
                <div className="flex items-center gap-3 text-sm">
                  <button
                    onClick={openChainModal}
                    className="px-3 py-1.5 border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
                  >
                    {chain.name?.toLowerCase()}
                  </button>
                  <button
                    onClick={openAccountModal}
                    className="px-3 py-1.5 border border-primary/50 text-primary hover:border-primary transition-colors"
                  >
                    {account.displayName}
                  </button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
