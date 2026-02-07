/**
 * Test Yellow ClearNode authentication with EIP-712 signing.
 *
 * This mirrors the frontend's yellow.ts auth flow:
 * 1. Generate a session key pair
 * 2. Connect to ClearNode WebSocket
 * 3. Send auth_request with wallet address + session key
 * 4. Receive auth_challenge with UUID
 * 5. Sign challenge with EIP-712 (wallet) and send auth_verify
 * 6. Receive auth_verify success
 */
import { createWalletClient, http, toHex, keccak256, type Hex, type Address } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import WebSocket from "ws";

// Nitrolite SDK imports
import {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createEIP712AuthMessageSigner,
  parseAnyRPCResponse,
  parseAuthChallengeResponse,
} from "@erc7824/nitrolite";

const CLEARNODE_WS_URL = "wss://clearnet-sandbox.yellow.com/ws";
const APP_NAME = "restless-escrow";
// Domain name MUST match the `application` field in auth_request
const EIP712_DOMAIN = { name: APP_NAME };

// Use hardhat account #0 as the wallet
const WALLET_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const walletAccount = privateKeyToAccount(WALLET_PRIVATE_KEY);

console.log("=== Yellow ClearNode EIP-712 Auth Test ===\n");
console.log(`Wallet address: ${walletAccount.address}`);

// Create a viem WalletClient (same as what wagmi provides in the browser)
const walletClient = createWalletClient({
  account: walletAccount,
  chain: baseSepolia,
  transport: http(),
});

// Generate a session key (same as frontend does)
const sessionPrivateKey = generatePrivateKey();
const sessionAccount = privateKeyToAccount(sessionPrivateKey);
console.log(`Session key: ${sessionAccount.address}`);

// Auth parameters
const authScope = "console";
const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 86400);

// Create EIP-712 auth signer
const authSigner = createEIP712AuthMessageSigner(
  walletClient as any,
  {
    scope: authScope,
    session_key: sessionAccount.address,
    expires_at: expiresAt,
    allowances: [],
  },
  EIP712_DOMAIN,
);

console.log(`\nConnecting to ${CLEARNODE_WS_URL}...`);

const ws = new WebSocket(CLEARNODE_WS_URL);

ws.on("open", async () => {
  console.log("  WebSocket connected");

  // Step 1: Send auth_request
  const authReqMsg = await createAuthRequestMessage({
    address: walletAccount.address,
    session_key: sessionAccount.address,
    application: APP_NAME,
    allowances: [],
    expires_at: expiresAt,
    scope: authScope,
  });

  console.log("\n--- Sending auth_request ---");
  console.log(`  Message: ${authReqMsg.slice(0, 200)}...`);
  ws.send(authReqMsg);
});

ws.on("message", async (data: Buffer) => {
  const raw = data.toString();
  console.log(`\n--- Received ---`);
  console.log(`  Raw: ${raw.slice(0, 300)}${raw.length > 300 ? "..." : ""}`);

  try {
    const parsed = JSON.parse(raw);

    // Check for error responses
    if (parsed.res && parsed.res[1] === "error") {
      console.log(`\n  ERROR from ClearNode: ${JSON.stringify(parsed.res[2])}`);
      ws.close();
      process.exit(1);
    }

    const response = parseAnyRPCResponse(raw);

    if (response && "method" in response) {
      const method = (response as any).method;
      console.log(`  Method: ${method}`);

      if (method === "auth_challenge") {
        console.log(`  Challenge params:`, (response as any).params);

        // Step 2: Sign challenge with EIP-712 and send auth_verify
        const challengeResp = parseAuthChallengeResponse(raw);
        console.log("\n--- Signing challenge with EIP-712 ---");

        try {
          const verifyMsg = await createAuthVerifyMessage(
            authSigner,
            challengeResp,
          );
          console.log(`  Signed verify message: ${verifyMsg.slice(0, 200)}...`);
          ws.send(verifyMsg);
        } catch (signErr: any) {
          console.error(`  Signing failed: ${signErr.message}`);
          ws.close();
          process.exit(1);
        }
        return;
      }

      if (method === "auth_verify") {
        console.log("\n  *** AUTH SUCCESS! ***");
        console.log(`  Auth verify response:`, (response as any).params);
        ws.close();
        process.exit(0);
      }
    }
  } catch (err: any) {
    // Check if it's an assets broadcast or other non-RPC message
    if (raw.includes('"assets"') || raw.includes('"pong"')) {
      console.log(`  (non-auth broadcast, ignoring)`);
      return;
    }
    console.log(`  Parse error: ${err.message?.slice(0, 200)}`);
  }
});

ws.on("error", (err) => {
  console.error("WebSocket error:", err.message);
  process.exit(1);
});

ws.on("close", () => {
  console.log("\nWebSocket closed");
});

// Timeout
setTimeout(() => {
  console.error("\nTimeout — no auth response after 15s");
  ws.close();
  process.exit(1);
}, 15000);
