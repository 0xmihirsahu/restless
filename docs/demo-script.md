# Restless — Demo Script

**3 Sponsor Tracks: Yellow ($15k) · Uniswap v4 ($5k) · LI.FI ($2.5k)**

| Sponsor | Prize Track | Our Integration | Amount |
|---|---|---|---|
| **Yellow** | Integrate Yellow SDK: Trading/Marketplaces | Full Nitrolite state channel for deal negotiation | **$15,000** |
| **Uniswap v4** | Agentic Finance | v4 hook auto-swaps yield to preferred token at settlement | **$5,000** |
| **LI.FI** | Best Composer Use in DeFi | Cross-chain settlement routing via LI.FI Diamond | **$2,500** |

**Total potential: $22,500**

---

## Prep

- Two browser windows or two wallets (Wallet A = depositor, Wallet B = counterparty)
- Both on Base Sepolia with testnet ETH for gas
- Wallet A needs testnet USDC (mint from Aave faucet `0xD9145b5F45Ad4519c7ACcD6E0A4A82e83bB8A6Dc`)
- Frontend running at `localhost:3000`

---

## 1. Landing + Problem Statement (30s)

Open `localhost:3000`. Connect wallet.

> "Restless is P2P escrow where locked funds earn yield in Aave. But the key insight is what happens *during* and *after* the escrow — that's where Yellow, Uniswap v4, and LI.FI come in."

Point out the three-step flow on the homepage and the integration bar at the bottom (Aave V3, LI.FI, Yellow state channels, ENS).

---

## 2. Create + Fund a Deal (60s)

Go to `/deals/new`.

- Enter counterparty address, 10 USDC, 100% yield to counterparty, 1 day timeout
- Write deal terms: "Freelance design work — deliver homepage mockup"
- Walk through the 3-step wizard: **Approve → Create → Fund**

> "The moment USDC is deposited, it goes straight to Aave V3 and starts earning. The escrow contract never holds idle tokens."

Navigate to the deal detail page. Show the **YieldTicker** accruing in real-time.

---

## 3. Yellow Network — Off-Chain Negotiation (90s) — $15,000 prize

**This is the biggest prize track. Spend the most time here.**

On the deal detail page, the `StateChannelPanel` appears:

### 3a. Connect to ClearNode

- Click **"connect to clearnode"** → wallet signs EIP-712 auth
- Status badge goes green: "connected"

> "We connect to Yellow's ClearNode via WebSocket. Authentication uses EIP-712 structured signatures — the same standard Yellow's Nitrolite protocol requires."

### 3b. Open a deal session

- Click **"open deal session"**
- Session ID appears

> "This creates a Nitrolite app session between the two parties. Both participants are defined, with 50/50 weights and quorum=100 — meaning both must agree to close."

### 3c. Exchange gasless messages

- Click **"milestone"** → sends a milestone message
- Type in chat: "Design delivered, please review" → send
- Click **"confirm"** → sends a confirmation

> "All of this is gasless. Messages are cryptographically signed with a session key and routed through ClearNode. No gas fees, instant delivery. This is the core Yellow SDK integration — real-time off-chain deal negotiation."

### 3d. Close session

> "When both parties agree the deal is done, closing the session signals readiness for on-chain settlement. The final allocation flips — counterparty gets the funds."

### Key points for Yellow judges

- Full `@erc7824/nitrolite` SDK usage (not just a wrapper)
- EIP-712 auth + ECDSA session keys
- App session with `RPCProtocolVersion.NitroRPC_0_2`
- 4 message types: confirm, reject, milestone, chat
- State channels are the optimization layer, on-chain fallback exists (dispute/timeout)
- Code: `frontend/lib/yellow.ts` and `frontend/components/StateChannelPanel.tsx`

---

## 4. Settlement Options — Three Tabs (60s)

After Yellow negotiation, show the `CrossChainSettle` component with its 3 modes:

### Tab 1: Same-chain settle (5s)

> "Simplest path — USDC + yield paid directly on Base Sepolia."

### Tab 2: Cross-chain via LI.FI (30s) — $2,500 prize

- Select **"Arbitrum"** as destination chain
- LI.FI quote loads: bridge name, receive amount, estimated time, gas cost

> "LI.FI finds the optimal bridge route. The counterparty can receive their payout on any chain. This isn't just frontend — our Settlement contract integrates the LI.FI Diamond directly: it approves tokens, forwards calldata, and verifies the bridge consumed the expected amount. If it doesn't, the tx reverts."

- Show the quote panel: "powered by LI.FI"

#### Key points for LI.FI judges

- **Contract-level** integration (Settlement.sol calls LI.FI Diamond, not just frontend SDK)
- Approval safety: approve → bridge → verify consumed → reset approval
- Amount verification: `LiFiAmountMismatch` custom error if bridge doesn't consume tokens
- Frontend quote UI with routing display
- Code: `contracts/contracts/Settlement.sol` and `frontend/components/CrossChainSettle.tsx`

### Tab 3: Yield swap via Uniswap v4 hook (30s) — $5,000 prize

- Select **"WETH"** as preferred token
- Info panel shows: "powered by uniswap v4"
- Click **"settle + swap yield to WETH"**

> "This is our custom v4 hook. When the deal settles, the yield portion is swapped to the counterparty's preferred token through Uniswap v4's PoolManager. The hook inherits BaseHook, implements afterSwap, and executes real swaps via the unlock → swap → settle/take pattern. It's deployed via CREATE2 with mined address bits for the AFTER_SWAP permission flag."

#### Key points for Uniswap v4 judges

- Real `BaseHook` contract — inherits from v4-periphery
- `afterSwap` hook permission, CREATE2 deployed with salt-mined address
- `settleWithSwap()` → `poolManager.unlock()` → `unlockCallback()` → `poolManager.swap()` → settle/take
- The hook is **"agentic"** — it automatically decides to swap yield based on the deal's preferred token config, no manual intervention
- 11 Solidity tests, full integration test (create→fund→settleWithHook)
- Code: `contracts/contracts/RestlessSettlementHook.sol` and `test/solidity/RestlessSettlementHook.t.sol`

---

## 5. Architecture Recap (15s)

```
Depositor → Escrow → Aave V3 (yield accrues)
                        ↓
              Settlement ──→ same-chain USDC payout
                         ──→ LI.FI Diamond (cross-chain bridge)
                         ──→ v4 Hook (yield → preferred token swap)

              Yellow ClearNode (gasless off-chain negotiation)
```

> "Three sponsor integrations, each solving a different part of the escrow lifecycle: Yellow for negotiation, v4 for yield optimization, LI.FI for cross-chain delivery. 134 passing tests. All contracts verified on Basescan."

---

## Judge Q&A Cheat Sheet

### If a Yellow judge asks questions

- "We use the full Nitrolite stack — EIP-712 auth, ECDSA session keys, app sessions, application messages. State channels are the negotiation layer; on-chain is the fallback."
- Show `frontend/lib/yellow.ts` — all imports from `@erc7824/nitrolite`
- Show `frontend/components/StateChannelPanel.tsx` — the full UI

### If a Uniswap judge asks questions

- "The hook is a novel use case — settling escrowed yield into the counterparty's preferred token. It's a real BaseHook with afterSwap, deployed at a CREATE2-mined address."
- Show `contracts/contracts/RestlessSettlementHook.sol` — the full hook
- Show the 11 Solidity tests in `test/solidity/RestlessSettlementHook.t.sol`
- "134 total tests, including fuzz tests for escrow and settlement"

### If a LI.FI judge asks questions

- "The integration is at the contract level, not just frontend. Settlement.sol approves the LI.FI Diamond, forwards calldata, and verifies the bridge consumed tokens. If it doesn't, it reverts with LiFiAmountMismatch."
- Show `contracts/contracts/Settlement.sol` — the `_sendViaLifi` function
- Show `frontend/components/CrossChainSettle.tsx` — quote fetching and routing display

---

## Deployed Contracts (Base Sepolia)

| Contract | Address |
|---|---|
| RestlessEscrow | `0x33e63071b9E6412CEB39F18903cAb56478Ec3f4E` |
| AaveYieldAdapter | `0x283A90fc1255ec7d134Ca8056d83ECA2f4978A2f` |
| Settlement | `0x03DAE4F0964A83889fD243bc24b9eF9A5fb5C358` |
| MockSettlementHook | `0x7185b6c205Cb9Daa53166Db5225b80F7A68c65a7` |
| USDC (Aave) | `0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f` |

All verified on [Basescan](https://sepolia.basescan.org).

---

## Total Demo Time: ~5 minutes
