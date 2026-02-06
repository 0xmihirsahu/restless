import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-[calc(100vh-65px)] flex flex-col">
      <div className="flex-1 max-w-5xl w-full mx-auto px-6 py-16 md:py-24">
        {/* Hero */}
        <div className="mb-16">
          <p className="text-sm text-primary mb-3 tracking-wide">your escrow, never idle</p>
          <h1 className="text-3xl md:text-4xl font-semibold text-foreground mb-4 leading-tight">
            P2P escrow where locked<br />
            funds earn yield in Aave
          </h1>
          <p className="text-muted-foreground max-w-lg mb-8">
            Lock USDC in escrow for any deal. While you wait, your capital earns yield
            automatically. Settle on your terms, get your principal + yield bonus.
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="/deals/new"
              className="px-6 py-2.5 text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              create a deal
            </Link>
            <Link
              href="/deals"
              className="px-6 py-2.5 text-sm border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
            >
              view deals
            </Link>
          </div>
        </div>

        {/* How it works */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="border border-border p-6">
            <div className="text-xs text-muted-foreground mb-2">01</div>
            <h3 className="text-sm font-medium text-foreground mb-2">create + fund</h3>
            <p className="text-sm text-muted-foreground">
              Set deal terms, counterparty, and yield split. Fund with USDC &mdash;
              tokens go straight into Aave and start earning.
            </p>
          </div>
          <div className="border border-border p-6">
            <div className="text-xs text-muted-foreground mb-2">02</div>
            <h3 className="text-sm font-medium text-foreground mb-2">negotiate off-chain</h3>
            <p className="text-sm text-muted-foreground">
              Track milestones via state channels (gasless). Both parties sign approvals
              off-chain. Capital keeps earning while you work.
            </p>
          </div>
          <div className="border border-border p-6">
            <div className="text-xs text-muted-foreground mb-2">03</div>
            <h3 className="text-sm font-medium text-foreground mb-2">settle + earn</h3>
            <p className="text-sm text-muted-foreground">
              Submit final state on-chain. Principal + yield gets split per deal terms.
              Cross-chain delivery via LI.FI optional.
            </p>
          </div>
        </div>

        {/* Stats / features */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 border-t border-border pt-8">
          <div>
            <div className="text-xs text-muted-foreground mb-1">yield source</div>
            <div className="text-sm font-medium text-foreground">Aave V3</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">settlement</div>
            <div className="text-sm font-medium text-foreground">same-chain + LI.FI</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">negotiation</div>
            <div className="text-sm font-medium text-foreground">Yellow state channels</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">identity</div>
            <div className="text-sm font-medium text-foreground">ENS supported</div>
          </div>
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
