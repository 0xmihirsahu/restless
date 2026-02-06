/**
 * Yellow Network / Nitrolite state channel integration for Restless.
 *
 * Enables instant off-chain deal confirmations between escrow parties
 * via the Nitrolite ClearNode. On-chain settlement only when the deal finalizes.
 *
 * Flow:
 * 1. Both parties connect to ClearNode via WebSocket
 * 2. Depositor creates an app session with the counterparty
 * 3. Parties exchange off-chain state updates (confirm milestones, etc.)
 * 4. On settlement, the session closes and triggers on-chain escrow settlement
 */

import {
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createAppSessionMessage,
  createCloseAppSessionMessage,
  createApplicationMessage,
  createPingMessageV2,
  createECDSAMessageSigner,
  parseAnyRPCResponse,
  parseAuthChallengeResponse,
  parseCreateAppSessionResponse,
  parseCloseAppSessionResponse,
  parseMessageResponse,
  type MessageSigner,
  type RPCAppDefinition,
  type RPCAppSessionAllocation,
  RPCProtocolVersion,
} from "@erc7824/nitrolite";
import type { Hex, Address } from "viem";

// ── Config ─────────────────────────────────────────────────────────

export const CLEARNODE_WS_URL = "wss://clearnet-sandbox.yellow.com/ws";

const APP_NAME = "restless-escrow";

// ── Types ──────────────────────────────────────────────────────────

export type YellowConnectionState =
  | "disconnected"
  | "connecting"
  | "authenticating"
  | "connected"
  | "error";

export type DealMessage = {
  type: "confirm" | "reject" | "milestone" | "chat";
  dealId: string;
  content: string;
  sender: string;
  timestamp: number;
};

export type YellowSession = {
  sessionId: Hex;
  dealId: string;
  depositor: Address;
  counterparty: Address;
  amount: string;
  status: "active" | "closed";
  messages: DealMessage[];
};

// ── Singleton Connection Manager ───────────────────────────────────

let ws: WebSocket | null = null;
let connectionState: YellowConnectionState = "disconnected";
let currentSigner: MessageSigner | null = null;
let currentAddress: Address | null = null;
let messageListeners: Array<(msg: any) => void> = [];
let stateListeners: Array<(state: YellowConnectionState) => void> = [];

function setConnectionState(state: YellowConnectionState) {
  connectionState = state;
  stateListeners.forEach((fn) => fn(state));
}

export function getConnectionState(): YellowConnectionState {
  return connectionState;
}

export function onConnectionStateChange(
  fn: (state: YellowConnectionState) => void
): () => void {
  stateListeners.push(fn);
  return () => {
    stateListeners = stateListeners.filter((l) => l !== fn);
  };
}

export function onMessage(fn: (msg: any) => void): () => void {
  messageListeners.push(fn);
  return () => {
    messageListeners = messageListeners.filter((l) => l !== fn);
  };
}

// ── Connection ─────────────────────────────────────────────────────

/**
 * Connect to Yellow ClearNode and authenticate.
 * Uses a wallet signing function to create a message signer.
 */
export async function connectToYellow(
  address: Address,
  signMessage: (message: string) => Promise<Hex>
): Promise<void> {
  if (ws && connectionState === "connected") return;

  currentAddress = address;

  // Create a MessageSigner from the wallet's signMessage
  // The Nitrolite SDK expects a signer that takes RPCData and returns a signature
  currentSigner = async (payload: any): Promise<Hex> => {
    const message =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    return signMessage(message);
  };

  return new Promise((resolve, reject) => {
    setConnectionState("connecting");

    ws = new WebSocket(CLEARNODE_WS_URL);

    ws.onopen = async () => {
      setConnectionState("authenticating");
      try {
        // Step 1: Request auth challenge
        const authReqMsg = await createAuthRequestMessage({
          address,
          session_key: address,
          application: APP_NAME,
          allowances: [],
          expires_at: BigInt(Math.floor(Date.now() / 1000) + 86400), // 24h
          scope: "escrow",
        });
        ws!.send(authReqMsg);
      } catch (err) {
        setConnectionState("error");
        reject(err);
      }
    };

    ws.onmessage = async (event) => {
      try {
        const response = parseAnyRPCResponse(
          typeof event.data === "string"
            ? event.data
            : event.data.toString()
        );

        // Handle auth challenge response
        if (
          response &&
          "method" in response &&
          (response as any).method === "auth_challenge"
        ) {
          const challengeResp = parseAuthChallengeResponse(
            typeof event.data === "string"
              ? event.data
              : event.data.toString()
          );
          // Sign the challenge and verify
          const verifyMsg = await createAuthVerifyMessage(
            currentSigner!,
            challengeResp,
          );
          ws!.send(verifyMsg);
          return;
        }

        // Handle auth verify response (success)
        if (
          response &&
          "method" in response &&
          (response as any).method === "auth_verify"
        ) {
          setConnectionState("connected");
          resolve();
          return;
        }

        // Forward all other messages to listeners
        messageListeners.forEach((fn) => fn(response));
      } catch {
        // If parsing fails, try forwarding raw data
        messageListeners.forEach((fn) => fn(event.data));
      }
    };

    ws.onerror = () => {
      setConnectionState("error");
      reject(new Error("WebSocket connection failed"));
    };

    ws.onclose = () => {
      setConnectionState("disconnected");
      ws = null;
    };

    // Timeout after 15s
    setTimeout(() => {
      if (connectionState !== "connected") {
        ws?.close();
        setConnectionState("error");
        reject(new Error("Connection timeout"));
      }
    }, 15000);
  });
}

export function disconnectFromYellow() {
  ws?.close();
  ws = null;
  currentSigner = null;
  currentAddress = null;
  setConnectionState("disconnected");
}

// ── App Sessions (Deal State Channels) ─────────────────────────────

/**
 * Create an off-chain app session for a deal.
 * Both parties can then exchange instant messages without gas.
 */
export async function createDealSession(params: {
  dealId: string;
  counterparty: Address;
  amount: string; // USDC amount in human readable
}): Promise<Hex> {
  if (!ws || !currentSigner || !currentAddress) {
    throw new Error("Not connected to Yellow Network");
  }

  const definition: RPCAppDefinition = {
    application: APP_NAME,
    protocol: RPCProtocolVersion.NitroRPC_0_2,
    participants: [currentAddress, params.counterparty],
    weights: [50, 50],
    quorum: 100,
    challenge: 0,
    nonce: Date.now(),
  };

  const allocations: RPCAppSessionAllocation[] = [
    {
      participant: currentAddress,
      asset: "usdc",
      amount: params.amount,
    },
    {
      participant: params.counterparty,
      asset: "usdc",
      amount: "0",
    },
  ];

  const msg = await createAppSessionMessage(currentSigner, {
    definition,
    allocations,
    session_data: JSON.stringify({ dealId: params.dealId }),
  });

  ws.send(msg);

  // Wait for session creation response
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Session creation timeout"));
    }, 10000);

    const cleanup = onMessage((response) => {
      try {
        const parsed = parseCreateAppSessionResponse(
          JSON.stringify(response)
        );
        if (parsed) {
          clearTimeout(timeout);
          cleanup();
          resolve((parsed as any).app_session_id ?? ("0x" as Hex));
        }
      } catch {
        // Not a session response, ignore
      }
    });
  });
}

/**
 * Send a deal-related message through the state channel.
 * These are instant, gasless, off-chain messages.
 */
export async function sendDealMessage(
  sessionId: Hex,
  message: Omit<DealMessage, "sender" | "timestamp">
): Promise<void> {
  if (!ws || !currentSigner || !currentAddress) {
    throw new Error("Not connected to Yellow Network");
  }

  const fullMessage: DealMessage = {
    ...message,
    sender: currentAddress,
    timestamp: Date.now(),
  };

  const msg = await createApplicationMessage(
    currentSigner,
    sessionId,
    fullMessage
  );

  ws.send(msg);
}

/**
 * Close a deal session (triggers on-chain settlement readiness).
 * Called when both parties agree the deal is complete.
 */
export async function closeDealSession(params: {
  sessionId: Hex;
  depositor: Address;
  counterparty: Address;
  amount: string;
}): Promise<void> {
  if (!ws || !currentSigner) {
    throw new Error("Not connected to Yellow Network");
  }

  // Final allocations: counterparty gets the escrowed amount
  const finalAllocations: RPCAppSessionAllocation[] = [
    {
      participant: params.depositor,
      asset: "usdc",
      amount: "0",
    },
    {
      participant: params.counterparty,
      asset: "usdc",
      amount: params.amount,
    },
  ];

  const msg = await createCloseAppSessionMessage(currentSigner, {
    app_session_id: params.sessionId,
    allocations: finalAllocations,
  });

  ws.send(msg);
}

/**
 * Send a ping to keep the connection alive.
 */
export function sendPing(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(createPingMessageV2());
}
