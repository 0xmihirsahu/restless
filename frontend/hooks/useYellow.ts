"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, useSignMessage } from "wagmi";
import type { Address, Hex } from "viem";
import {
  connectToYellow,
  disconnectFromYellow,
  getConnectionState,
  onConnectionStateChange,
  onMessage,
  createDealSession,
  sendDealMessage,
  closeDealSession,
  sendPing,
  type YellowConnectionState,
  type DealMessage,
} from "@/lib/yellow";

/**
 * Hook for connecting to Yellow Network ClearNode.
 * Manages WebSocket connection lifecycle and authentication.
 */
export function useYellowConnection() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [state, setState] = useState<YellowConnectionState>(
    getConnectionState()
  );

  useEffect(() => {
    return onConnectionStateChange(setState);
  }, []);

  // Keep-alive ping every 30s
  useEffect(() => {
    if (state !== "connected") return;
    const interval = setInterval(sendPing, 30000);
    return () => clearInterval(interval);
  }, [state]);

  const connect = useCallback(async () => {
    if (!address) return;
    try {
      await connectToYellow(address, async (message: string) => {
        const sig = await signMessageAsync({ message });
        return sig as Hex;
      });
    } catch (err) {
      console.error("Yellow connection failed:", err);
    }
  }, [address, signMessageAsync]);

  const disconnect = useCallback(() => {
    disconnectFromYellow();
  }, []);

  return {
    state,
    isConnected: state === "connected",
    connect,
    disconnect,
  };
}

/**
 * Hook for managing a deal's state channel session.
 * Handles session creation, messaging, and closure.
 */
export function useDealSession(dealId: string) {
  const { address } = useAccount();
  const [sessionId, setSessionId] = useState<Hex | null>(null);
  const [messages, setMessages] = useState<DealMessage[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for incoming messages
  useEffect(() => {
    return onMessage((msg) => {
      try {
        // Check if this is a deal message for our session
        if (msg?.params?.type && msg?.params?.dealId === dealId) {
          setMessages((prev) => [...prev, msg.params as DealMessage]);
        }
        // Also try parsing as a generic message response
        if (msg?.result?.params?.dealId === dealId) {
          setMessages((prev) => [...prev, msg.result.params as DealMessage]);
        }
      } catch {
        // Not a deal message, ignore
      }
    });
  }, [dealId]);

  const createSession = useCallback(
    async (counterparty: Address, amount: string) => {
      setIsCreating(true);
      setError(null);
      try {
        const id = await createDealSession({
          dealId,
          counterparty,
          amount,
        });
        setSessionId(id);
        return id;
      } catch (err: any) {
        setError(err.message ?? "Failed to create session");
        return null;
      } finally {
        setIsCreating(false);
      }
    },
    [dealId]
  );

  const sendMessage = useCallback(
    async (type: DealMessage["type"], content: string) => {
      if (!sessionId) return;
      try {
        await sendDealMessage(sessionId, { type, dealId, content });
        // Optimistically add to local messages
        if (address) {
          setMessages((prev) => [
            ...prev,
            { type, dealId, content, sender: address, timestamp: Date.now() },
          ]);
        }
      } catch (err: any) {
        setError(err.message ?? "Failed to send message");
      }
    },
    [sessionId, dealId, address]
  );

  const closeSession = useCallback(
    async (depositor: Address, counterparty: Address, amount: string) => {
      if (!sessionId) return;
      setIsClosing(true);
      try {
        await closeDealSession({
          sessionId,
          depositor,
          counterparty,
          amount,
        });
        setSessionId(null);
      } catch (err: any) {
        setError(err.message ?? "Failed to close session");
      } finally {
        setIsClosing(false);
      }
    },
    [sessionId]
  );

  return {
    sessionId,
    messages,
    isCreating,
    isClosing,
    error,
    createSession,
    sendMessage,
    closeSession,
    hasSession: !!sessionId,
  };
}
