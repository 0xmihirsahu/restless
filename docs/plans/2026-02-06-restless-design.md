# Restless — Architecture & Design Document

**Your Escrow, Never Idle**

> P2P escrow where locked funds earn yield in Aave while waiting for deal completion — because capital should never sleep.

**Date:** 2026-02-06
**Scope:** Full hackathon build — all integrations (Aave, Yellow/Nitrolite, LI.FI, ENS, Uniswap v4)
**Framework:** Hardhat 3 + Next.js 16 + Tailwind v4

---

## Table of Contents

1. [System Overview & Contract Architecture](#1-system-overview--contract-architecture)
2. [Deal Lifecycle & State Machine](#2-deal-lifecycle--state-machine)
3. [Aave Yield Adapter](#3-aave-yield-adapter)
4. [State Channels — Yellow/Nitrolite](#4-state-channels--yellowlednitrolite)
5. [Settlement & Cross-Chain — LI.FI](#5-settlement--cross-chain--lifi)
6. [ENS Integration & Uniswap v4 Hook](#6-ens-integration--uniswap-v4-hook)
7. [Frontend Architecture & Data Flow](#7-frontend-architecture--data-flow)
8. [Deployment, Testing Strategy & File Structure](#8-deployment-testing-strategy--file-structure)

---

## 1. System Overview & Contract Architecture

Restless has three layers: **on-chain contracts**, **off-chain state channels**, and a **frontend**.

### On-chain (Solidity on Sepolia + Arbitrum Sepolia)

```
┌─────────────────────────────────────────────────┐
│              RestlessEscrow.sol                  │
│  (Core state machine: create → fund → settle)   │
│                                                  │
│  Deal { id, depositor, counterparty, amount,     │
│         yieldSplit, status, timeout, dealHash }   │
│                                                  │
│  States: Created → Funded → Settled | Disputed   │
│                    → TimedOut                     │
└──────────┬──────────────────┬────────────────────┘
           │                  │
   ┌───────▼──────┐   ┌──────▼───────────┐
   │ AaveAdapter  │   │  Settlement.sol   │
   │              │   │                   │
   │ deposit()    │   │ settle()          │
   │ withdraw()   │   │ yieldSplit()      │
   │ getYield()   │   │ crossChainSend()  │
   │              │   │ (via LI.FI)       │
   │ USDC→aUSDC   │   │                   │
   └──────────────┘   └───────────────────┘
```

The escrow contract is the entry point. It holds deal state but **never holds tokens directly** — it immediately routes funded USDC into Aave via the adapter. Settlement.sol handles the payout math (principal + yield split) and optionally routes to another chain via LI.FI.

**Key design decision:** The adapter pattern keeps Aave integration isolated. If you wanted to swap to Morpho or another yield source later, you'd only change the adapter — the escrow logic doesn't care where yield comes from.

---

## 2. Deal Lifecycle & State Machine

Every deal follows a strict state machine. Invalid transitions revert.

```
                    ┌──────────┐
                    │ Created  │  Party A calls createDeal()
                    └────┬─────┘  (no funds yet, just metadata)
                         │
                    fundDeal()
                    Party A deposits USDC
                         │
                    ┌────▼─────┐
                    │  Funded  │  USDC → AaveAdapter → aUSDC
                    └──┬───┬───┘  Yield starts accruing
                       │   │
          ┌────────────┘   └────────────┐
          │                             │
   settleDeal()                  disputeDeal()
   (state channel final           either party
    state submitted)              calls on-chain
          │                             │
   ┌──────▼──────┐              ┌───────▼───────┐
   │   Settled   │              │   Disputed    │
   │             │              │               │
   │ aUSDC→USDC  │              │ timeout clock │
   │ principal   │              │ starts (X days)│
   │ + yield     │              │               │
   │ split &     │              └───────┬───────┘
   │ sent        │                      │
   └─────────────┘               timeout expires,
                                 no resolution
                                        │
                                ┌───────▼───────┐
                                │  Timed Out    │
                                │               │
                                │ Full refund   │
                                │ to depositor  │
                                │ (principal +  │
                                │  all yield)   │
                                └───────────────┘
```

### Transition Rules

| Transition | Who Can Call | Condition |
|---|---|---|
| `createDeal()` | Anyone (becomes depositor) | Valid counterparty, amount > 0 |
| `fundDeal()` | Depositor only | Deal in `Created` state, USDC approved |
| `settleDeal()` | Escrow contract (triggered by valid state channel proof) | Deal in `Funded` state, valid signatures from both parties |
| `disputeDeal()` | Either party | Deal in `Funded` state |
| `claimTimeout()` | Depositor only | Deal in `Disputed` state, timeout elapsed |

### Security Notes

- Every state transition uses the **Checks-Effects-Interactions** pattern — state updates before any external call (Aave withdraw, LI.FI bridge)
- `ReentrancyGuard` on `settleDeal()` and `claimTimeout()` since both trigger external token transfers
- `dealHash` stores a hash of the deal terms agreed off-chain, verified on settlement to prevent tampering

---

## 3. Aave Yield Adapter

The adapter is a thin wrapper around Aave V3's Pool contract. It has one job: deposit USDC, track per-deal yield, and withdraw principal + yield on settlement.

### State

```solidity
struct DepositRecord {
    uint256 principal;         // original USDC amount
    uint256 aTokenBalance;     // aUSDC received at deposit time
    uint256 depositTimestamp;   // for yield calculation
}

mapping(uint256 => DepositRecord) public deposits; // dealId → record
```

### Interface

```solidity
interface IYieldAdapter {
    /// @notice Deposit USDC into yield source for a deal
    function deposit(uint256 dealId, uint256 amount) external;

    /// @notice Withdraw full balance (principal + yield) for a deal
    function withdraw(uint256 dealId) external returns (uint256 total);

    /// @notice View current yield accrued for a deal (no state change)
    function getAccruedYield(uint256 dealId) external view returns (uint256);
}
```

### How It Works

1. **Deposit flow:** Escrow calls `adapter.deposit(dealId, amount)`. Adapter calls `USDC.approve(aavePool, amount)` then `aavePool.supply(usdc, amount, address(this), 0)`. Records the principal and aUSDC balance received.

2. **Yield tracking:** aUSDC is a rebasing token — its balance grows automatically. Yield = current aUSDC balance proportional to the deal's share minus the original principal. For the hackathon, since deals don't overlap heavily, we track per-deal aToken shares by recording the aUSDC balance at deposit time.

3. **Withdraw flow:** Escrow calls `adapter.withdraw(dealId)`. Adapter calls `aavePool.withdraw(usdc, type(uint256).max, address(this))` for that deal's share, returns total USDC to escrow for splitting.

### Why the Interface Pattern

If you later want Morpho, Compound, or even a mock adapter for testing, you implement `IYieldAdapter` and swap it in. The escrow contract only knows the interface.

**Testnet note:** Aave V3 is deployed on Sepolia with test USDC. Use their faucet to get test tokens.

---

## 4. State Channels — Yellow/Nitrolite

The state channel handles all the back-and-forth between parties **off-chain** — only the final agreed state hits the chain.

### Off-chain Flow

```
┌──────────────────────────────────────────────────────────┐
│                    Off-Chain (State Channel)              │
│                                                          │
│  Party A (depositor)          Party B (counterparty)     │
│       │                              │                   │
│       │── propose milestones ───────>│                   │
│       │<──── counter-propose ────────│                   │
│       │── accept ───────────────────>│                   │
│       │                              │                   │
│       │  (work happens off-chain)    │                   │
│       │                              │                   │
│       │<── milestone 1 complete ─────│                   │
│       │── approve milestone 1 ──────>│                   │
│       │<── milestone 2 complete ─────│                   │
│       │── approve milestone 2 ──────>│                   │
│       │                              │                   │
│       │── sign final state ─────────>│                   │
│       │<──── co-sign final state ────│                   │
│                                                          │
│  Every message is a signed state update:                 │
│  { dealId, milestones[], approvals[], nonce, sigs[] }    │
└──────────────────────┬───────────────────────────────────┘
                       │
                 submitFinalState()
                 (both signatures)
                       │
┌──────────────────────▼───────────────────────────────────┐
│                    On-Chain (Escrow)                      │
│                                                          │
│  verifySignatures(stateHash, sigA, sigB)                 │
│  require(stateHash matches deal terms)                   │
│  → triggers settleDeal()                                 │
└──────────────────────────────────────────────────────────┘
```

### Channel State Structure (ERC-7824 Pattern)

```typescript
type ChannelState = {
  dealId: uint256;
  milestones: {
    description: string;
    amount: uint256;       // portion of escrow for this milestone
    status: "pending" | "delivered" | "approved";
  }[];
  nonce: uint256;          // monotonically increasing, latest state wins
  yieldSplit: {
    depositor: uint8;      // percentage (0-100)
    counterparty: uint8;
  };
};
```

### How Yellow/Nitrolite Fits

- Yellow SDK provides the transport layer — signed messages between two parties over WebSocket
- Nitrolite handles the state channel lifecycle: open, update, close
- Each state update is signed by the sender. Both parties hold the latest co-signed state
- On settlement, either party submits the latest co-signed state to the escrow contract, which verifies both signatures and executes

### Fallback Path

The escrow contract still works with simple on-chain `approveMilestone()` calls. The state channel is an optimization layer, not a hard dependency. For the hackathon, wire up Yellow for the demo flow but keep the on-chain approval path as a safety net.

### Dispute Path

If parties disagree, either can call `disputeDeal()` on-chain with their latest co-signed state. The contract uses the highest-nonce valid state. After the timeout, funds return to depositor.

---

## 5. Settlement & Cross-Chain — LI.FI

Settlement is where everything converges — Aave withdrawal, yield splitting, and optional cross-chain delivery.

### Settlement Flow

```
┌─────────────────────────────────────────────────────┐
│                 Settlement.sol                       │
│                                                      │
│  settleDeal(dealId, finalState, sigA, sigB)          │
│                                                      │
│  1. Verify signatures (both parties signed)          │
│  2. Verify finalState.dealId matches on-chain deal   │
│  3. Call adapter.withdraw(dealId) → total USDC       │
│  4. Calculate split:                                 │
│     ├─ principal → counterparty                      │
│     ├─ yield × counterpartyShare% → counterparty     │
│     └─ yield × depositorShare% → depositor           │
│  5. Route payments (same-chain or cross-chain)       │
└─────────────────────────────────────────────────────┘
```

### Yield Split Logic

```solidity
uint256 total = adapter.withdraw(dealId);
uint256 yield = total - deal.principal;

uint256 counterpartyYield = (yield * deal.yieldSplitCounterparty) / 100;
uint256 depositorYield = yield - counterpartyYield; // avoids rounding dust

uint256 counterpartyPayout = deal.principal + counterpartyYield;
uint256 depositorPayout = depositorYield;
```

Default yield split is **100% to counterparty** (the "yield bonus" narrative — seller gets principal + all yield). Configurable per deal at creation time.

### Cross-Chain Routing via LI.FI

```
Same chain?
  ├─ YES → USDC.transfer(counterparty, payout)
  └─ NO  → LI.FI SDK bridge
           │
           ├─ Settlement.sol calls LI.FI diamond contract
           │  with encoded swap/bridge data
           │
           ├─ USDC on Sepolia → bridge → USDC on Arb Sepolia
           │
           └─ Counterparty receives on destination chain
```

### Implementation Approach

- The frontend generates the LI.FI route quote (using their SDK) — which chain, which bridge, estimated fees
- The quote is encoded as `bytes calldata lifiData` and passed to `settleDeal()`
- Settlement.sol approves USDC to LI.FI's diamond contract and calls it with the encoded route
- If `lifiData` is empty, it does a simple same-chain transfer

### Security Considerations

- LI.FI calldata is generated client-side, so the contract validates that the input token/amount matches the deal payout (prevents malicious route encoding)
- Cross-chain settlement is **optional** — if LI.FI is flaky on testnet, same-chain settlement always works
- `ReentrancyGuard` on the settlement function since it makes external calls to both Aave and LI.FI

---

## 6. ENS Integration & Uniswap v4 Hook

### ENS Integration

ENS is purely a **resolution layer**. The contracts always work with addresses internally. ENS adds human readability at two points:

```
┌─────────────────────────────────────────────────┐
│  Frontend (ENS resolution)                      │
│                                                  │
│  1. Deal creation:                               │
│     User types "bob.eth" → frontend resolves     │
│     via ENS.js → passes address to contract      │
│                                                  │
│  2. Deal display:                                │
│     Contract returns address → frontend does     │
│     reverse resolution → shows "bob.eth"         │
│                                                  │
│  3. Deal preferences (bonus for prize track):    │
│     Read ENS text records for a user:            │
│     - "restless.preferredChain" → "arbitrum"     │
│     - "restless.yieldSplit" → "50"               │
│     Auto-fill deal creation form from ENS        │
└─────────────────────────────────────────────────┘
```

No contract changes needed for basic ENS — it's all frontend. The text record feature is a creative touch for the ENS prize: users store their deal preferences on their ENS name, and the app reads them automatically.

### Uniswap v4 Hook

The v4 hook sits at the **settlement exit** — after Aave withdrawal, before delivery to counterparty. Its job: auto-swap the yield portion to the recipient's preferred token.

```
Settlement flow WITH v4 hook:

  adapter.withdraw() → 5018.40 USDC
       │
       ├─ principal (5000 USDC) → counterparty (untouched)
       │
       └─ yield (18.40 USDC) → v4 hook
              │
              ▼
       ┌──────────────────────────┐
       │  RestlessSettlementHook  │
       │  (Uniswap v4 hook)      │
       │                          │
       │  1. Takes yield USDC     │
       │  2. Swaps to preferred   │
       │     token (e.g. WETH)    │
       │  3. Sends to recipient   │
       └──────────────────────────┘
```

**Hook design:**

```solidity
contract RestlessSettlementHook is BaseHook {
    function settleWithSwap(
        address recipient,
        uint256 yieldAmount,
        PoolKey calldata poolKey  // USDC/preferredToken pool
    ) external {
        // Perform swap through v4 pool manager
        poolManager.swap(poolKey, swapParams, "");
        // Transfer swapped tokens to recipient
    }
}
```

**Pragmatic note:** The v4 hook is the riskiest integration — v4 testnet deployments can be unstable. The design keeps it **completely optional**. Settlement.sol checks: if a v4 hook address is set on the deal AND the recipient specified a preferred token, route yield through the hook. Otherwise, just send USDC directly.

---

## 7. Frontend Architecture & Data Flow

Next.js 16 app with four core pages and a real-time yield tracker as the centerpiece UX element.

### Pages

```
┌─────────────────────────────────────────────────────┐
│  Next.js 16 App (App Router)                        │
│                                                      │
│  /                    Landing + "Create Deal" CTA    │
│  /deals/new           Deal creation wizard           │
│  /deals/[id]          Deal detail + live yield       │
│  /deals               Dashboard (my deals)           │
└─────────────────────────────────────────────────────┘
```

### Tech Stack

```
Next.js 16 (App Router)
├── wagmi + viem         — wallet connection, contract reads/writes
├── RainbowKit           — wallet modal (MetaMask, WalletConnect)
├── @ensdomains/ensjs    — ENS resolution + text records
├── @lifi/sdk            — cross-chain route quoting
├── Yellow SDK            — state channel messaging
└── Tailwind CSS v4      — styling (CSS-based @theme config)
```

### Key Data Flows

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Create Deal │     │  Negotiate   │     │   Settle     │
│              │     │              │     │              │
│ 1. Resolve   │     │ 1. Open      │     │ 1. Both sign │
│    ENS name  │     │    Yellow    │     │    final     │
│ 2. Set terms │     │    channel   │     │    state     │
│    + yield   │     │ 2. Exchange  │     │ 2. Submit    │
│    split     │     │    milestone │     │    to chain  │
│ 3. Approve   │     │    updates   │     │ 3. Get LI.FI│
│    USDC      │     │ 3. Sign      │     │    quote     │
│ 4. Call      │     │    approvals │     │ 4. Settle tx │
│    createDeal│     │    (gasless) │     │              │
│    + fundDeal│     │              │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
```

### Yield Ticker (Hero UX Element)

```typescript
// Reads aUSDC balance for the deal's share, polls every ~12s (block time)
function useYieldTracker(dealId: bigint) {
  const { data: accrued } = useContractRead({
    address: ADAPTER_ADDRESS,
    abi: aaveAdapterAbi,
    functionName: "getAccruedYield",
    args: [dealId],
    watch: true,  // re-fetches on new blocks
  });

  // Interpolate between blocks for smooth animation
  // aUSDC accrues continuously, so we estimate per-second yield
  // and animate between on-chain reads
  return useAnimatedCounter(accrued);
}
```

This is the thing people remember from the demo — a dollar amount ticking upward in real time. Even if it's $0.003/hour, the visual of "your money is working" is the entire pitch.

### Deal Status Timeline

A vertical timeline component showing each state transition with timestamps:

- Deal created (on-chain tx)
- Funded → yield started (on-chain tx)
- Milestone 1 delivered (off-chain, state channel)
- Milestone 1 approved (off-chain, state channel)
- Settled → $X yield earned (on-chain tx)

Off-chain events come from Yellow channel state; on-chain events from contract event logs.

---

## 8. Deployment, Testing Strategy & File Structure

### Monorepo Structure

```
hackmoney/
├── packages/
│   ├── contracts/                 # Hardhat 3 project
│   │   ├── contracts/
│   │   │   ├── RestlessEscrow.sol
│   │   │   ├── AaveYieldAdapter.sol
│   │   │   ├── Settlement.sol
│   │   │   ├── RestlessSettlementHook.sol  # v4 hook
│   │   │   └── interfaces/
│   │   │       ├── IYieldAdapter.sol
│   │   │       └── ISettlement.sol
│   │   ├── test/
│   │   │   ├── solidity/                   # Foundry-compatible .t.sol
│   │   │   │   ├── RestlessEscrow.t.sol
│   │   │   │   ├── AaveYieldAdapter.t.sol
│   │   │   │   └── Settlement.t.sol
│   │   │   └── typescript/                 # TS integration tests
│   │   │       ├── integration.test.ts     # Full flow with SDK calls
│   │   │       └── lifi-settlement.test.ts # Cross-chain tests
│   │   ├── ignition/
│   │   │   └── modules/
│   │   │       └── RestlessModule.ts       # Hardhat Ignition deploy
│   │   └── hardhat.config.ts
│   │
│   └── web/                       # Next.js 16 app
│       ├── app/
│       │   ├── page.tsx           # Landing
│       │   ├── deals/
│       │   │   ├── page.tsx       # Dashboard
│       │   │   ├── new/
│       │   │   │   └── page.tsx   # Create deal wizard
│       │   │   └── [id]/
│       │   │       └── page.tsx   # Deal detail + yield ticker
│       │   └── layout.tsx
│       ├── components/
│       │   ├── YieldTicker.tsx
│       │   ├── DealTimeline.tsx
│       │   ├── MilestoneChat.tsx  # State channel UI
│       │   └── WalletProvider.tsx
│       ├── hooks/
│       │   ├── useYieldTracker.ts
│       │   ├── useStateChannel.ts
│       │   └── useDeal.ts
│       ├── lib/
│       │   ├── contracts.ts       # ABIs + addresses
│       │   ├── ens.ts             # ENS resolution helpers
│       │   └── lifi.ts            # LI.FI quote helpers
│       ├── app.css                # Tailwind v4 (CSS-based @theme config)
│       ├── next.config.ts
│       └── package.json
│
├── docs/
│   └── plans/
│       └── 2026-02-06-restless-design.md   # This document
├── package.json                   # Workspace root
└── README.md
```

### Testing Strategy (Hardhat 3)

Hardhat 3 supports both Solidity and TypeScript tests natively. We use both:

| Layer | Language | What | How |
|---|---|---|---|
| Unit tests | Solidity (.t.sol) | Each contract in isolation | Mock Aave pool, mock USDC, test every state transition |
| Integration | TypeScript | Full flow: create → fund → settle | Fork Sepolia with Aave V3, use real aUSDC |
| SDK integration | TypeScript | Yellow SDK + LI.FI SDK in test flow | Call JS SDKs directly in test scripts |
| Edge cases | Solidity | Dispute + timeout, double-settle, zero yield | Warp block timestamps with cheatcodes |
| Fuzz | Solidity | Random amounts, random yield splits | Foundry-compatible fuzz tests in Hardhat 3 |
| Coverage | Both | Full coverage report | `npx hardhat test --coverage` |

**Why both languages:** Solidity tests for fast unit/fuzz testing of contract logic. TypeScript tests for integration flows that need to call Yellow SDK, LI.FI SDK, and ENS.js — impossible in pure Solidity.

### Deployment Targets

```
Sepolia          — Escrow, Adapter, Settlement (primary)
Arbitrum Sepolia — For cross-chain demo (LI.FI destination)
```

### Deploy Sequence (Hardhat Ignition)

```typescript
// ignition/modules/RestlessModule.ts
import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("Restless", (m) => {
  const adapter = m.contract("AaveYieldAdapter", [AAVE_POOL, USDC]);
  const settlement = m.contract("Settlement", [LIFI_DIAMOND]);
  const escrow = m.contract("RestlessEscrow", [adapter, settlement]);

  return { adapter, settlement, escrow };
});
```

### Hardhat 3 Config

```typescript
// hardhat.config.ts
import { HardhatUserConfig } from "hardhat/config";

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
    },
    arbitrumSepolia: {
      url: process.env.ARB_SEPOLIA_RPC_URL,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
    },
  },
};

export default config;
```

---

## Appendix: Prize Track Mapping

| Sponsor | Integration Point | Contract/Component |
|---|---|---|
| **Yellow** | State channels for gasless deal negotiation | State channel layer + MilestoneChat.tsx |
| **Uniswap v4** | Settlement hook — swap yield to preferred token | RestlessSettlementHook.sol |
| **LI.FI** | Cross-chain settlement routing | Settlement.sol + lifi.ts |
| **ENS** | Human-readable deal parties + text record preferences | Frontend resolution + ENS text records |
| **Arc** | USDC escrow across chains | RestlessEscrow.sol + Settlement.sol |

## Appendix: Security Checklist

- [ ] ReentrancyGuard on all external-call functions (settle, claimTimeout)
- [ ] Checks-Effects-Interactions pattern on every state transition
- [ ] Input validation: zero address, zero amount, invalid state transitions
- [ ] Signature verification: EIP-712 typed data for state channel messages
- [ ] LI.FI calldata validation: verify token/amount matches deal payout
- [ ] Pausable emergency stop on escrow contract
- [ ] No `tx.origin` usage — `msg.sender` only
- [ ] Events emitted for every state change
- [ ] Timeout cannot be set to zero or unreasonably short
- [ ] Deal cannot be funded twice
- [ ] Settlement cannot be called twice for the same deal

## Appendix: Risk Mitigations

| Risk | Mitigation |
|---|---|
| Yellow SDK hard to integrate | On-chain approval fallback path always works |
| LI.FI flaky on testnet | Same-chain transfer as default, cross-chain optional |
| v4 hook unstable | Completely optional — settlement works without it |
| Aave testnet yield too low to demo | Pre-fund with large amount + show projected yield UI |
| State channel signature mismatch | EIP-712 typed data ensures both parties sign identical structures |
