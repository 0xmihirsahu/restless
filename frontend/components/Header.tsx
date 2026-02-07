"use client";

import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { ThemeToggle } from "./ThemeToggle";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

const WalletButton = dynamic(
  () => import("./WalletButton").then((m) => m.WalletButton),
  { ssr: false, loading: () => <div className="w-32 h-9" /> }
);

const Header = () => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  useEffect(() => setMounted(true), []);

  const logoSrc = mounted && resolvedTheme === "light"
    ? "/brand/navbar-logo-light.svg"
    : "/brand/navbar-logo-dark.svg";

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
            <Image src={logoSrc} alt="Restless" width={140} height={24} priority />
          </Link>

          <nav className="hidden sm:flex items-center gap-5 text-sm">
            <Link
              href="/deals"
              className={`transition-colors ${
                pathname === "/deals"
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              deals
            </Link>
            <Link
              href="/deals/new"
              className={`transition-colors ${
                pathname === "/deals/new"
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
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
