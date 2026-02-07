# Restless — Your Escrow, Never Idle

P2P escrow where locked funds earn yield in Aave while waiting for deal completion. Gasless negotiation via state channels. Cross-chain settlement. Human-readable identities.

**Because capital should never sleep.**

## The Problem

Every time funds are locked in escrow — OTC deals, freelancer payments, cross-chain settlements — that capital sits completely idle. Globally, billions of dollars sit in escrow doing nothing.

## The Solution

Restless auto-deposits escrowed USDC into Aave V3 to earn yield while parties negotiate. When the deal settles, both parties get their expected outcome **plus** the yield earned during the escrow period.

> Client locked $5,000 USDC. While they waited 2 weeks, it earned $23 in Aave. Deal completed. Seller got $5,023. Zero trust needed. Zero idle capital.

## How It Works

```
1. Create Deal     → depositor sets terms, counterparty, amount
2. Fund Deal       → USDC deposited → auto-routed to Aave → yield starts immediately
3. Negotiate       → off-chain via Yellow state channels (gasless)
4. Settle          → withdraw from Aave → principal + yield split → optional cross-chain via LI.FI
```

```
┌─────────────────────────────────────────────────┐
│              RestlessEscrow.sol                  │
│  (State machine: create → fund → settle)        │
└──────────┬──────────────────┬────────────────────┘
           │                  │
   ┌───────▼──────┐   ┌──────▼───────────┐
   │ AaveAdapter  │   │  Settlement.sol   │
   │ USDC → aUSDC │   │  yield split      │
   │ yield accrual│   │  LI.FI bridge     │
   └──────────────┘   │  v4 hook swap     │
                      └───────────────────┘
```

## Prize Track Integrations

### Yellow Network — State Channels ($15k track)

Off-chain deal negotiation via Nitrolite SDK. Both parties connect to ClearNode via WebSocket, exchange gasless messages (confirmations, milestones, chat), and close the session to trigger on-chain settlement.

- `@erc7824/nitrolite` SDK for WebSocket connection + auth
- App session creation with `RPCAppDefinition` (participants, weights, quorum)
- Instant deal messages — no gas, no waiting
- Session close signals settlement readiness

**Files:** `frontend/lib/yellow.ts`, `frontend/hooks/useYellow.ts`, `frontend/components/StateChannelPanel.tsx`

### Uniswap v4 — Settlement Hook ($5k-$10k track)

Real v4 `BaseHook` that auto-swaps yield to the recipient's preferred token on settlement. Uses the `unlock → swap → settle/take` pattern.

- Inherits `BaseHook` from v4-periphery
- `afterSwap` callback tracks yield swaps
- `settleWithSwap()` executes via `poolManager.unlock()`
- CREATE2 deployment (address encodes `AFTER_SWAP_FLAG`)
- 11 Solidity tests with PoolManager, HookMiner, liquidity provision

**Files:** `contracts/contracts/RestlessSettlementHook.sol`, `contracts/test/solidity/RestlessSettlementHook.t.sol`

### LI.FI — Cross-Chain Settlement ($2.5k-$6k track)

Deposit on one chain, counterparty receives on another. LI.FI SDK fetches optimal bridge routes; Settlement.sol calls the LI.FI Diamond with the quoted calldata.

- `@lifi/sdk` for cross-chain quote fetching
- UI: chain selector, route preview (bridge, fees, estimated time)
- Settlement.sol validates LI.FI calldata execution on-chain
- Supports Ethereum, Base, Arbitrum, Optimism, Polygon

**Files:** `frontend/lib/lifi.ts`, `frontend/hooks/useLifiQuote.ts`, `frontend/components/CrossChainSettle.tsx`, `contracts/contracts/Settlement.sol`

### ENS — Identity & Preferences ($3.5k-$5k track)

Human-readable names throughout the app. ENS text records as a deal preference layer — counterparties advertise their preferred yield split, timeout, chain, and token via ENS records.

- Address → ENS name resolution with avatar display
- ENS name input: type `vitalik.eth` instead of `0x...`
- **Creative:** ENS text records auto-fill deal preferences:
  - `com.restless.yield-split` — preferred yield split %
  - `com.restless.chain` — preferred settlement chain ID
  - `com.restless.token` — preferred payout token
  - `com.restless.timeout` — preferred dispute timeout in days

**Files:** `frontend/components/EnsName.tsx`, `frontend/components/EnsAddressInput.tsx`, `frontend/hooks/useEnsPreferences.ts`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.26, Hardhat 3, Foundry |
| Yield Source | Aave V3 (aUSDC) |
| State Channels | Yellow Network / Nitrolite (ERC-7824) |
| Cross-Chain | LI.FI SDK + Diamond Proxy |
| Settlement Hook | Uniswap v4 BaseHook |
| Identity | ENS (names, avatars, text records) |
| Frontend | Next.js 16, Tailwind v4, wagmi v2, RainbowKit v2 |
| Testing | 134 tests (63 Solidity + 71 TypeScript) |

## Project Structure

```
restless/
├── contracts/                 # Hardhat 3 + Foundry
│   ├── contracts/
│   │   ├── RestlessEscrow.sol           # Core escrow state machine
│   │   ├── AaveYieldAdapter.sol         # Aave V3 deposit/withdraw
│   │   ├── Settlement.sol               # Payout + LI.FI + yield split
│   │   ├── RestlessSettlementHook.sol   # Uniswap v4 BaseHook
│   │   └── interfaces/                  # IYieldAdapter, ISettlement, IRestlessSettlementHook
│   └── test/
│       ├── solidity/                    # Forge tests (escrow, settlement, v4 hook, fuzz)
│       └── typescript/                  # Hardhat tests (escrow, adapter, settlement, integration)
│
├── frontend/                  # Next.js 16
│   ├── app/
│   │   ├── page.tsx                     # Landing page
│   │   └── deals/
│   │       ├── page.tsx                 # Deal list with ENS names
│   │       ├── new/page.tsx             # Deal creation with ENS input + preferences
│   │       └── [id]/page.tsx            # Deal detail: yield ticker, state channel, settlement
│   ├── components/
│   │   ├── CrossChainSettle.tsx         # LI.FI cross-chain settlement UI
│   │   ├── StateChannelPanel.tsx        # Yellow state channel session UI
│   │   ├── EnsName.tsx                  # ENS name resolution display
│   │   ├── EnsAddressInput.tsx          # ENS-aware address input
│   │   └── YieldTicker.tsx              # Real-time yield accrual display
│   ├── hooks/
│   │   ├── useYellow.ts                 # Yellow connection + deal session hooks
│   │   ├── useLifiQuote.ts             # LI.FI quote fetching hook
│   │   ├── useEnsPreferences.ts        # ENS text record preferences
│   │   ├── useDeal.ts                  # Deal reading hooks
│   │   └── useEscrowWrite.ts           # Deal write operations
│   └── lib/
│       ├── yellow.ts                    # Yellow/Nitrolite service layer
│       ├── lifi.ts                      # LI.FI SDK configuration
│       └── contracts.ts                 # Contract addresses + ABIs
│
└── docs/plans/                # Design document
```

## Deployed Contracts

### Sepolia

| Contract | Address |
|----------|---------|
| RestlessEscrow | `0xc6b1316438d1597035B6D97BA22a610745685284` |
| AaveYieldAdapter | `0xC6A101B9a376d3b6aB7d4092658E66d718738600` |
| Settlement | `0x913997E266B5732Db47eD856Fe75F99983C471A8` |
| RestlessSettlementHook | `0x3a562c291539Cc0031E899271987d3cb51980040` |

### Base Sepolia

| Contract | Address |
|----------|---------|
| RestlessEscrow | `0x52Bd9308B7c5f2f6362449C750BC35f57294D630` |
| AaveYieldAdapter | `0x984342567Cc5980AcB7e51EED6A189e53A49DB30` |
| Settlement | `0x2ED54fB830F51C5519AAfF5698dab4DAC71163b2` |
| RestlessSettlementHook | `0xD2AB30E2911fA3ca0575661F726e0b28EC8c8040` |

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 9+
- A wallet with Sepolia ETH + testnet USDC

### Setup

```bash
# Clone and install
git clone https://github.com/your-username/restless.git
cd restless
pnpm install

# Set environment variables
cp frontend/.env.example frontend/.env.local
# Add your contract addresses and RainbowKit project ID

# Run frontend
pnpm dev

# Run contract tests
pnpm test              # TypeScript tests (Hardhat)
cd contracts && forge test -vv  # Solidity tests (Foundry)
```

### Environment Variables

```env
# Frontend (.env.local)
NEXT_PUBLIC_ESCROW_ADDRESS=0x...
NEXT_PUBLIC_SETTLEMENT_ADDRESS=0x...
NEXT_PUBLIC_ADAPTER_ADDRESS=0x...
NEXT_PUBLIC_HOOK_ADDRESS=0x...
NEXT_PUBLIC_USDC_ADDRESS=0x...
NEXT_PUBLIC_RAINBOWKIT_PROJECT_ID=your_project_id

# Contracts (.env)
SEPOLIA_PRIVATE_KEY=0x...
ETHERSCAN_API_KEY=your_key
```

## Testing

```bash
# All 134 tests
pnpm test                     # 71 TypeScript tests
cd contracts && forge test    # 63 Solidity tests (including v4 hook + fuzz tests)
```

Test coverage:
- **RestlessEscrow**: Full lifecycle (create, fund, settle, dispute, timeout, cancel)
- **AaveYieldAdapter**: Deposit, withdraw, yield accrual
- **Settlement**: Yield splitting, LI.FI cross-chain, hook integration
- **RestlessSettlementHook**: v4 swap execution, afterSwap events, access control
- **Integration**: End-to-end escrow → Aave → settlement → hook flow
- **Fuzz tests**: Settlement amounts, escrow parameters

## Architecture Decisions

- **Adapter pattern** for yield source — swap Aave for Morpho without touching escrow logic
- **State channels are optional** — on-chain settlement works without Yellow connection
- **LI.FI cross-chain is optional** — same-chain settlement is the default
- **v4 hook is optional** — yield paid in USDC by default, hook swaps to preferred token
- **ENS preferences are read-only** — counterparties opt in by setting text records
- **Escrow never holds tokens** — funds route to Aave immediately on funding

## License

MIT

## Author

Mihir Sahu
