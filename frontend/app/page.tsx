import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <main className="min-h-[calc(100vh-65px)] flex flex-col">
      <div className="flex-1 max-w-5xl w-full mx-auto px-6 py-16 md:py-24">
        {/* Hero */}
        <div className="mb-20 flex flex-col md:flex-row items-start md:items-center gap-8 md:gap-16">
          <div className="flex-1 animate-fade-up">
            <p className="text-sm font-medium text-accent mb-4 tracking-widest uppercase">
              your escrow, never idle
            </p>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-[1.1] tracking-tight font-display">
              P2P escrow where locked{" "}
              <span className="text-gradient-brand">funds earn yield</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-lg mb-10 leading-relaxed">
              Lock USDC in escrow for any deal. While you wait, your capital earns yield
              automatically via Aave. Settle on your terms.
            </p>
            <div className="flex items-center gap-4">
              <Link
                href="/deals/new"
                className="px-7 py-3 text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                create a deal
              </Link>
              <Link
                href="/deals"
                className="px-7 py-3 text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              >
                view deals
              </Link>
            </div>
          </div>
          <div className="hidden md:block shrink-0 animate-fade-up" style={{ animationDelay: "0.15s" }}>
            <Image
              src="/brand/restless-owl-mascot.svg"
              alt="Restless owl mascot"
              width={220}
              height={220}
              priority
            />
          </div>
        </div>

        {/* How it works */}
        <div className="grid md:grid-cols-3 gap-6 mb-20">
          {[
            {
              num: "01",
              title: "create + fund",
              desc: "Set deal terms, counterparty, and yield split. Fund with USDC \u2014 tokens go straight into Aave and start earning.",
              delay: "0.1s",
            },
            {
              num: "02",
              title: "negotiate off-chain",
              desc: "Track milestones via Yellow state channels (gasless). Both parties sign approvals off-chain while capital keeps earning.",
              delay: "0.2s",
            },
            {
              num: "03",
              title: "settle + earn",
              desc: "Submit final state on-chain. Principal + yield split per deal terms. Cross-chain delivery via LI.FI or v4 hook swap optional.",
              delay: "0.3s",
            },
          ].map((step) => (
            <div
              key={step.num}
              className="border border-border p-6 hover:border-primary/30 transition-colors animate-fade-up"
              style={{ animationDelay: step.delay }}
            >
              <div className="text-xs font-mono text-accent mb-3 tracking-wider">{step.num}</div>
              <h3 className="text-base font-bold text-foreground mb-2 font-display">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {step.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Integration bar */}
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-8 border-t border-border pt-10 animate-fade-up"
          style={{ animationDelay: "0.4s" }}
        >
          {[
            { label: "yield source", value: "Aave V3" },
            { label: "settlement", value: "same-chain + LI.FI" },
            { label: "negotiation", value: "Yellow state channels" },
            { label: "identity", value: "ENS supported" },
          ].map((item) => (
            <div key={item.label}>
              <div className="text-xs text-muted-foreground mb-1.5 tracking-wide">{item.label}</div>
              <div className="text-sm font-medium text-foreground">{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <footer className="border-t border-border py-6">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between text-xs text-muted-foreground">
          <span>restless &mdash; hackmoney 2026</span>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            view source
          </a>
        </div>
      </footer>
    </main>
  );
}
