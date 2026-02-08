"use client";

import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { ThemeToggle } from "./ThemeToggle";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

const WalletButton = dynamic(
  () => import("./WalletButton").then((m) => m.WalletButton),
  { ssr: false, loading: () => <div className="w-32 h-9" /> }
);

const NAV_LINKS = [
  { href: "/deals", label: "deals" },
  { href: "/deals/new", label: "new deal" },
];

const Header = () => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setMounted(true), []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`transition-colors ${
                  pathname === link.href
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <WalletButton />

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="sm:hidden flex flex-col justify-center items-center w-9 h-9 gap-[5px] group"
            aria-label="Toggle menu"
          >
            <motion.span
              animate={mobileOpen ? { rotate: 45, y: 7 } : { rotate: 0, y: 0 }}
              className="block w-5 h-[2px] bg-foreground origin-center"
            />
            <motion.span
              animate={mobileOpen ? { opacity: 0 } : { opacity: 1 }}
              className="block w-5 h-[2px] bg-foreground"
            />
            <motion.span
              animate={mobileOpen ? { rotate: -45, y: -7 } : { rotate: 0, y: 0 }}
              className="block w-5 h-[2px] bg-foreground origin-center"
            />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="sm:hidden overflow-hidden border-t border-border"
          >
            <nav className="px-6 py-4 flex flex-col gap-3">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm py-2 transition-colors ${
                    pathname === link.href
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export { Header };
