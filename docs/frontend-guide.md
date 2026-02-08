# Restless: Complete Project Guide

End-to-end guide covering project setup, smart contract compilation/testing/deployment, frontend setup, and full usage instructions.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Repository Setup](#repository-setup)
3. [Smart Contracts](#smart-contracts)
   - [Project Structure](#contract-project-structure)
   - [Configuration](#contract-configuration)
   - [Compiling](#compiling-contracts)
   - [Testing](#running-tests)
   - [Deploying](#deploying-contracts)
   - [Verifying](#verifying-contracts)
   - [Uniswap v4 Hook Deployment](#uniswap-v4-hook-deployment)
   - [Exporting ABIs to Frontend](#exporting-abis-to-frontend)
4. [Frontend](#frontend)
   - [Configuration](#frontend-configuration)
   - [Running](#running-the-frontend)
   - [Building](#building-for-production)
5. [Wallet & Testnet Setup](#wallet--testnet-setup)
6. [Using the Application](#using-the-application)
   - [Creating a Deal](#creating-a-deal)
   - [Viewing Deals](#viewing-your-deals)
   - [Deal Detail Page](#deal-detail-page)
   - [Settling a Deal](#settling-a-deal)
   - [Disputing a Deal](#disputing-a-deal)
   - [Cancelling a Deal](#cancelling-a-deal)
7. [Integration Features](#integration-features)
   - [State Channels (Yellow Network)](#state-channels-yellow-network)
   - [Cross-Chain Settlement (LI.FI)](#cross-chain-settlement-lifi)
   - [Yield Swap (Uniswap v4 Hook)](#yield-swap-uniswap-v4-hook)
   - [ENS Identity](#ens-integration)
8. [Architecture Overview](#architecture-overview)
9. [Deployed Contract Addresses](#deployed-contract-addresses)
10. [Tech Stack](#tech-stack)
11. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Node.js** v18+ (v20 recommended)
- **pnpm** v8+ (package manager — `npm install -g pnpm`)
- **Foundry** (for Solidity tests — `curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- **MetaMask** or any WalletConnect-compatible browser wallet
- **Base Sepolia testnet ETH** for gas
- **Testnet USDC** for creating deals

---

## Repository Setup

This is a **pnpm monorepo** with two packages:

```
hackmoney/
├── contracts/     # Hardhat 3 + Foundry smart contracts
├── frontend/      # Next.js 16 frontend
├── docs/          # Design docs, plans, guides
├── brand/         # Brand assets (logos, SVGs)
├── pnpm-workspace.yaml
└── package.json
```

### Install all dependencies

```bash
git clone <repo-url>
cd hackmoney
pnpm install
```

This installs dependencies for both `contracts/` and `frontend/`. The contracts package has a `postinstall` script that cleans up Uniswap v4 bundled dependencies to prevent conflicts with Hardhat.

---

## Smart Contracts

### Contract Project Structure

```
contracts/
├── contracts/              # Solidity source files
│   ├── RestlessEscrow.sol          # Core escrow with Aave yield
│   ├── AaveYieldAdapter.sol        # IYieldAdapter implementation for Aave V3
│   ├── Settlement.sol              # Settlement logic (LI.FI + hook routing)
│   ├── RestlessSettlementHook.sol  # Real Uniswap v4 hook (BaseHook)
│   ├── interfaces/                 # IYieldAdapter, ISettlement, IRestlessSettlementHook
│   └── mocks/                      # MockRestlessSettlementHook (for TS tests)
├── test/
│   ├── solidity/           # Forge tests (.t.sol)
│   └── typescript/         # Hardhat 3 TypeScript tests
├── scripts/                # Deployment & utility scripts
├── ignition/
│   ├── modules/            # Hardhat Ignition deployment modules
│   └── parameters/         # Network-specific parameters (sepolia.json, baseSepolia.json)
├── hardhat.config.ts       # Hardhat 3 configuration
└── foundry.toml            # Foundry configuration
```

**Key contracts:**

| Contract | Purpose |
|----------|---------|
| `RestlessEscrow` | Core escrow — create, fund, settle, dispute, cancel deals. Routes funds to Aave via adapter. |
| `AaveYieldAdapter` | Deposits/withdraws USDC to Aave V3 Pool. Reports accrued yield per deal. |
| `Settlement` | Distributes funds on settlement — handles yield splitting, optional LI.FI cross-chain bridging, optional v4 hook yield swaps. |
| `RestlessSettlementHook` | Uniswap v4 `BaseHook` — swaps yield portion from USDC to a preferred token via PoolManager. |
| `MockRestlessSettlementHook` | Simplified mock with hardcoded swap rates for TypeScript unit tests. |

### Contract Configuration

Create the contracts `.env` file:

```bash
cp contracts/.env.example contracts/.env
```

Edit `contracts/.env`:

```env
# RPC endpoints (get from Alchemy, Infura, or public RPCs)
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY

# Deployer private key (with testnet ETH for gas)
SEPOLIA_PRIVATE_KEY=0x_your_private_key_here

# Etherscan API key for contract verification (v2 key works for all chains)
ETHERSCAN_API_KEY=your_etherscan_api_key
```

| Key | Where to get it |
|-----|----------------|
| RPC URLs | [alchemy.com](https://www.alchemy.com) — create projects for Sepolia and Base Sepolia |
| Private key | Export from MetaMask (Settings > Security > Reveal Private Key). **Use a testnet-only wallet.** |
| Etherscan API key | [etherscan.io/myapikey](https://etherscan.io/myapikey) — v2 keys work across Etherscan + Basescan |

### Compiling Contracts

**Hardhat (for TypeScript tests & Ignition deployment):**

```bash
cd contracts
pnpm compile
```

**Foundry (for Solidity tests & CREATE2 hook deployment):**

```bash
cd contracts
forge build
```

Both use Solidity 0.8.26 with `cancun` EVM version (required for Uniswap v4 transient storage).

### Running Tests

**All TypeScript tests (Hardhat 3):**

```bash
cd contracts
pnpm test
```

This runs 71 TypeScript tests covering RestlessEscrow, AaveYieldAdapter, Settlement, MockHook, and integration scenarios.

**All Solidity tests (Foundry):**

```bash
cd contracts
forge test -vv
```

This runs 63 Solidity tests including RestlessEscrow, Settlement, v4 Hook, and fuzz tests.

**Run everything:**

```bash
cd contracts
pnpm test && forge test -vv
```

Expected: **134 tests passing** (71 TS + 63 Solidity).

### Deploying Contracts

Deployment uses **Hardhat Ignition** with network-specific parameter files.

**Deploy to Base Sepolia (recommended):**

```bash
cd contracts
pnpm deploy:baseSepolia
```

**Deploy to Sepolia:**

```bash
cd contracts
pnpm deploy:sepolia
```

The Ignition module (`ignition/modules/RestlessModule.ts`) deploys in order:
1. **Settlement** — with USDC address and LI.FI Diamond
2. **AaveYieldAdapter** — with USDC, aUSDC, and Aave Pool addresses
3. **RestlessEscrow** — with USDC, adapter, and settlement
4. Links adapter to escrow via `adapter.setEscrow(escrow)`
5. Deploys **MockRestlessSettlementHook** and links to settlement via `settlement.setHook(hook)`

Network parameters are in:
- `ignition/parameters/baseSepolia.json` — Aave V3 Base Sepolia addresses
- `ignition/parameters/sepolia.json` — Aave V3 Sepolia addresses

> **Note:** Sepolia Aave USDC supply cap is exceeded (3B/2B). Use **Base Sepolia** for functional testing.

### Verifying Contracts

**Ignition-deployed contracts:**

```bash
cd contracts
npx hardhat ignition verify chain-84532 --network baseSepolia   # Base Sepolia
npx hardhat ignition verify chain-11155111 --network sepolia     # Sepolia
```

**CREATE2-deployed contracts (v4 hook):**

```bash
npx hardhat verify --network baseSepolia HOOK_ADDRESS POOL_MANAGER USDC SETTLEMENT OWNER
```

### Uniswap v4 Hook Deployment

The real `RestlessSettlementHook` is a v4 `BaseHook` that requires **CREATE2 deployment** — the contract address must encode permission bits (AFTER_SWAP = bit 6).

**Step 1: Build with Foundry** (needed for bytecode):

```bash
cd contracts
forge build
```

**Step 2: Deploy via CREATE2:**

```bash
SETTLEMENT_ADDRESS=0x... \
POOL_MANAGER_ADDRESS=0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408 \
USDC_ADDRESS=0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f \
npx hardhat run scripts/deploy-hook.ts --network baseSepolia
```

The script mines a salt that produces an address with the correct permission bits, deploys via the deterministic CREATE2 deployer (`0x4e59...56C`), then calls `settlement.setHook()`.

**Step 3: Configure pool key** (optional, for yield swap):

```bash
npx hardhat run scripts/set-pool-key.ts --network baseSepolia
```

### Exporting ABIs to Frontend

After compiling contracts, export ABIs for the frontend:

```bash
cd contracts
pnpm compile
pnpm export-abis
```

This copies ABI JSON files to `frontend/src/contracts/` and generates a TypeScript barrel export.

---

## Frontend

### Frontend Configuration

Create the frontend `.env` file:

```bash
cp frontend/.env.example frontend/.env.local
```

Edit `frontend/.env.local`:

```env
# Contract addresses (Base Sepolia deployment)
NEXT_PUBLIC_ESCROW_ADDRESS=0xDCe58c9739a9F629cdFf840F9DA15AC82495B933
NEXT_PUBLIC_SETTLEMENT_ADDRESS=0x2ED54fB830F51C5519AAfF5698dab4DAC71163b2
NEXT_PUBLIC_ADAPTER_ADDRESS=0xF2B99E27196809aFd35A5C1E1F0747A0540E51b6
NEXT_PUBLIC_HOOK_ADDRESS=0x1D397343a67023148De2CaCA15c4C378DDc3C040
NEXT_PUBLIC_USDC_ADDRESS=0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f

# Chain ID (84532 = Base Sepolia)
NEXT_PUBLIC_CHAIN_ID=84532

# Alchemy API key — provides RPC for Base Sepolia + Ethereum mainnet (ENS resolution)
NEXT_PUBLIC_ALCHEMY_API_KEY=your_alchemy_api_key_here

# WalletConnect project ID (get from https://cloud.walletconnect.com)
NEXT_PUBLIC_RAINBOWKIT_PROJECT_ID=your_walletconnect_project_id_here
```

> If you deployed your own contracts, replace the addresses above with your deployed addresses from Ignition output (`ignition/deployments/chain-CHAINID/deployed_addresses.json`).

| Key | Where to get it |
|-----|----------------|
| Alchemy API key | [alchemy.com](https://www.alchemy.com) — create a project for Base Sepolia |
| WalletConnect Project ID | [cloud.walletconnect.com](https://cloud.walletconnect.com) — create a new project |

### Running the Frontend

```bash
pnpm --filter frontend dev
```

Open [http://localhost:3000](http://localhost:3000).

### Building for Production

```bash
pnpm --filter frontend build
pnpm --filter frontend start
```

---

## Wallet & Testnet Setup

### Adding Base Sepolia to MetaMask

1. Open MetaMask > network selector > "Add network" > "Add a network manually"
2. Enter:
   - **Network name:** Base Sepolia
   - **RPC URL:** `https://sepolia.base.org`
   - **Chain ID:** `84532`
   - **Currency symbol:** ETH
   - **Block explorer:** `https://sepolia.basescan.org`

### Getting Testnet ETH

You need Base Sepolia ETH for gas fees:

1. Go to [Alchemy Base Sepolia faucet](https://www.alchemy.com/faucets/base-sepolia)
2. Enter your wallet address
3. Request testnet ETH

### Getting Testnet USDC

Restless uses Aave's testnet USDC on Base Sepolia (`0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f`).

**Option 1: Aave Faucet UI**
1. Go to [Aave V3 Base Sepolia](https://app.aave.com/?marketName=proto_base_sepolia_v3)
2. Switch to Base Sepolia network in your wallet
3. Click "Faucet" in the sidebar
4. Mint USDC tokens

**Option 2: Direct contract call**
The Aave faucet contract at `0xD9145b5F45Ad4519c7ACcD6E0A4A82e83bB8A6Dc` is the USDC owner/minter. Call `mint(address to, uint256 amount)` on the USDC contract via a block explorer.

---

## Using the Application

### Connecting Your Wallet

1. Click the **wallet button** in the top-right header
2. Choose your provider (MetaMask, WalletConnect, Coinbase Wallet, etc.)
3. Approve the connection
4. Ensure you're on **Base Sepolia** (chain ID 84532)

### Creating a Deal

Navigate to **new deal** in the header or `/deals/new`.

**Step 1: Fill the form**

| Field | Description |
|-------|------------|
| **Counterparty address** | Ethereum address or ENS name (e.g. `vitalik.eth`) of the other party. ENS names resolve automatically. |
| **Amount (USDC)** | USDC to lock in escrow. Earns yield in Aave immediately upon funding. |
| **Yield split** | % of accrued yield that goes to the counterparty (0-100%). Default: 100%. |
| **Dispute timeout** | Days the depositor must wait to reclaim funds after disputing (1-30). |
| **Deal terms** | Description of the deal. Hashed via keccak256 and stored on-chain. |

**ENS preferences:** If the counterparty has Restless ENS text records set, the form auto-fills their preferred values.

**Step 2: Approve and fund (3 transactions)**

1. **Approve USDC** — Allow escrow to spend your USDC
2. **Create deal** — Register terms on-chain (emits `DealCreated` with deal ID)
3. **Fund deal** — Transfer USDC into escrow → immediately deposited into Aave → yield starts accruing

Each step requires wallet confirmation. The UI auto-advances after each transaction.

### Viewing Your Deals

Navigate to **deals** or `/deals`. Shows all deals where you are depositor or counterparty.

### Deal Detail Page

Each deal at `/deals/{id}` shows:

- **Yield Ticker** — Live-updating yield display (refreshes from chain every ~12s, interpolates between updates)
- **Deal Details** — Depositor, counterparty, amount, yield split, timeout, deal hash
- **Timeline** — Created, funded, disputed, settled, timed out, or cancelled events
- **State Channel** — Yellow Network panel for off-chain communication (funded deals only)
- **Actions** — Context-sensitive buttons based on deal status and your role

| Status | Depositor Actions | Counterparty Actions |
|--------|------------------|---------------------|
| Created | Approve + Fund, Cancel | Cancel |
| Funded | Settle, Dispute | Settle, Dispute |
| Disputed | Claim timeout (after expiry) | — |

### Settling a Deal

The settlement panel on funded deals offers three modes:

**Same-Chain** — Counterparty receives principal + yield share in USDC on current chain.

**Cross-Chain (LI.FI)** — Bridge counterparty's payout to another chain (Arbitrum, Optimism, Polygon, Base, Ethereum). See [Cross-Chain Settlement](#cross-chain-settlement-lifi).

**Yield Swap (v4 Hook)** — Swap yield portion to a preferred token (WETH, DAI, etc.) via Uniswap v4. See [Yield Swap](#yield-swap-uniswap-v4-hook).

### Disputing a Deal

Click **dispute deal** on a funded deal. Starts the timeout countdown. After timeout expires, the depositor can click **claim timeout refund**.

### Cancelling a Deal

Either party can cancel an unfunded deal. No fund movement occurs.

---

## Integration Features

### State Channels (Yellow Network)

Appears on funded deal detail pages. Enables gasless, instant off-chain messaging.

**Connect:**
1. Click **connect to clearnode**
2. Sign the EIP-712 authentication message in your wallet
3. Connection badge turns green

**Open a session:**
1. Click **open deal session** to create an off-chain channel with the counterparty

**Message types:**
- **confirm** — "I confirm the work is done"
- **milestone** — Mark a milestone completed
- **chat** — Free-form text

All messages are instant and gasless via Yellow ClearNode WebSocket (`wss://clearnet-sandbox.yellow.com/ws`).

**Close session:**
Click **close session (finalize off-chain)** when both parties agree. Then settle on-chain.

### Cross-Chain Settlement (LI.FI)

In the settle panel, select **cross-chain (LI.FI)** mode:

1. Pick a destination chain
2. Wait for LI.FI SDK to fetch a bridge quote (shows bridge, estimated receive amount, fees, time)
3. Click **settle + bridge**

The Settlement contract calls the LI.FI Diamond (`0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE`) to bridge funds.

> **Testnet note:** LI.FI uses mainnet chain IDs internally. On Base Sepolia, quotes are illustrative — actual settlement happens on-chain on the testnet.

### Yield Swap (Uniswap v4 Hook)

In the settle panel, select **yield swap (v4 hook)** mode:

1. Pick a token (WETH, DAI presets, or custom address)
2. Click **settle + swap yield to [token]**

This calls `settleDealWithHook()` which routes through the `RestlessSettlementHook`:
- Principal USDC goes directly to counterparty
- Yield USDC is swapped to the preferred token via v4 PoolManager
- Swapped tokens go to the counterparty

The hook uses a real Uniswap v4 pool (WETH/USDC pool configured on Base Sepolia).

### ENS Integration

**Address input:** Type an ENS name like `vitalik.eth` in the counterparty field — it auto-resolves to the address.

**Display:** Addresses show as ENS names throughout the app (deal lists, detail pages). Avatars shown on detail pages.

**Deal preferences via ENS text records:**

| Record Key | Description | Example |
|-----------|-------------|---------|
| `com.restless.yield-split` | Preferred yield split % | `80` |
| `com.restless.timeout` | Preferred timeout (days) | `14` |
| `com.restless.chain` | Preferred chain ID | `42161` |
| `com.restless.token` | Preferred token | `WETH` |

Set these at [app.ens.domains](https://app.ens.domains) > your name > Records > Text Records. When someone creates a deal with you, the form auto-fills your preferences.

---

## Architecture Overview

```
User (MetaMask)
     │
     ▼
┌─────────────┐     ┌──────────────────┐
│  Frontend    │────▶│  RestlessEscrow   │ ─── createDeal / fundDeal / settleDeal
│  (Next.js)  │     │  (entry point)    │
└─────────────┘     └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌──────────┐
     │AaveYield   │  │Settlement  │  │ Yellow   │
     │Adapter     │  │            │  │ ClearNode│
     │(Aave V3)   │  │  ┌────┐   │  │(off-chain)│
     └────────────┘  │  │LI.FI│   │  └──────────┘
                     │  └────┘   │
                     │  ┌────────┐│
                     │  │v4 Hook ││
                     │  │(swap)  ││
                     │  └────────┘│
                     └────────────┘
```

**Flow:**
1. Depositor creates a deal → `RestlessEscrow.createDeal()`
2. Depositor funds it → `fundDeal()` → USDC transferred to `AaveYieldAdapter` → deposited into Aave V3 Pool
3. Yield accrues in Aave's aUSDC token while locked
4. On settlement → escrow withdraws from Aave → calls `Settlement.settle()` which distributes:
   - Principal to counterparty
   - Yield split per deal terms
   - Optional: LI.FI bridge to another chain
   - Optional: v4 hook swap of yield to preferred token

---

## Deployed Contract Addresses

### Base Sepolia (Primary — recommended for testing)

| Contract | Address |
|----------|---------|
| RestlessEscrow | `0xDCe58c9739a9F629cdFf840F9DA15AC82495B933` |
| AaveYieldAdapter | `0xF2B99E27196809aFd35A5C1E1F0747A0540E51b6` |
| Settlement | `0x2ED54fB830F51C5519AAfF5698dab4DAC71163b2` |
| RestlessSettlementHook (v4 CREATE2) | `0x1D397343a67023148De2CaCA15c4C378DDc3C040` |
| MockRestlessSettlementHook | `0x95a041F9922A781D49c5b900C817EFe446300B44` |
| USDC (Aave testnet) | `0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f` |
| V4 PoolManager | `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408` |
| WETH | `0x4200000000000000000000000000000000000006` |

### Sepolia

| Contract | Address |
|----------|---------|
| RestlessEscrow | `0xc6b1316438d1597035B6D97BA22a610745685284` |
| AaveYieldAdapter | `0xC6A101B9a376d3b6aB7d4092658E66d718738600` |
| Settlement | `0x913997E266B5732Db47eD856Fe75F99983C471A8` |
| RestlessSettlementHook (v4 CREATE2) | `0x3a562c291539Cc0031E899271987d3cb51980040` |

All contracts are verified on Basescan and Etherscan.

> **Note:** Sepolia Aave USDC has exceeded its supply cap — deposits will fail. Use Base Sepolia.

---

## Tech Stack

### Contracts

| Component | Technology |
|-----------|-----------|
| Framework | Hardhat 3 (beta) + Foundry |
| Language | Solidity 0.8.26 (cancun EVM) |
| DeFi | Aave V3 (yield), Uniswap v4 (hook/swap) |
| Bridge | LI.FI Diamond |
| State channels | Yellow Network / Nitrolite |
| Deployment | Hardhat Ignition + CREATE2 (for v4 hook) |
| Testing | Forge (Solidity) + Hardhat/viem (TypeScript) |
| Dependencies | OpenZeppelin 5.x, solmate |

### Frontend

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS v4 |
| Wallet | RainbowKit + wagmi v2 + viem |
| State | TanStack React Query |
| Fonts | Satoshi (display), DM Sans (body), JetBrains Mono (mono) |
| Theme | next-themes (dark/light) |
| Toasts | Sonner |
| Cross-chain | LI.FI SDK |
| State channels | @erc7824/nitrolite |
| ENS | wagmi hooks (useEnsName, useEnsAddress, useEnsText, useEnsAvatar) |

---

## Troubleshooting

### Contracts

**`forge test` fails with "solc not found"**
Run `foundryup` to update Foundry, or install solc 0.8.26: `solc-select install 0.8.26`.

**Ignition deployment fails with "insufficient funds"**
Your deployer wallet needs testnet ETH. Get from [Alchemy faucet](https://www.alchemy.com/faucets/base-sepolia).

**"Duplicated plugin id" error in Hardhat**
Don't add `@nomicfoundation/hardhat-verify` separately — it's bundled in `hardhat-toolbox-viem`.

**Aave deposit fails on Sepolia**
Sepolia Aave USDC supply cap is exceeded. Use Base Sepolia instead.

**CREATE2 hook deployment shows "already deployed"**
The hook address is deterministic. Check the explorer — the contract may already be deployed at the mined address.

### Frontend

**"connect your wallet to create a deal"**
Click the wallet button in the header to connect.

**Transactions fail with "user rejected"**
Confirm the transaction in your wallet popup.

**No USDC balance**
Get testnet USDC from the Aave faucet (see [Getting Testnet USDC](#getting-testnet-usdc)).

**ENS names not resolving**
Requires a valid Ethereum mainnet RPC. Ensure `NEXT_PUBLIC_ALCHEMY_API_KEY` is set and your Alchemy project supports mainnet.

**Yellow Network connection fails**
The ClearNode sandbox may have intermittent availability. Connection times out after 15s. Try reconnecting.

**Cross-chain quotes show errors**
LI.FI uses mainnet chain IDs. Some testnet routes may lack liquidity. Cross-chain settlement is illustrative on testnet.

**Deal status not updating after action**
Frontend polls every 12s. Refresh the page for immediate update.

**Build warnings about indexedDB**
WalletConnect SSR warnings — harmless, doesn't affect functionality.

### General

**`pnpm install` fails**
Ensure pnpm v8+. Run `corepack enable` if using Node.js corepack.

**Uniswap v4 import errors**
The postinstall script must run to clean up v4 bundled `lib/` directories. Run `pnpm install` again or manually: `rm -rf node_modules/@uniswap/v4-periphery/lib node_modules/@uniswap/v4-core/lib`.
