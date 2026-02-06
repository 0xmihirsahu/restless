"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ThemeToggle } from "./ThemeToggle";

const WalletButton = dynamic(
  () => import("./WalletButton").then((m) => m.WalletButton),
  { ssr: false, loading: () => <div className="w-32 h-9" /> }
);

const Header = () => {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm font-semibold text-foreground tracking-tight">restless</span>
          </Link>

          <nav className="hidden sm:flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/deals" className="hover:text-foreground transition-colors">
              deals
            </Link>
            <Link href="/deals/new" className="hover:text-foreground transition-colors">
              new deal
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <WalletButton />
        </div>
      </div>
    </header>
  );
};

export { Header };
