"use client";

import { useState } from "react";
import type { Address } from "viem";
import { useYellowConnection, useDealSession } from "@/hooks/useYellow";
import type { DealMessage } from "@/lib/yellow";

type StateChannelPanelProps = {
  dealId: string;
  counterparty: Address;
  depositor: Address;
  amount: string; // human-readable USDC amount
  isDepositor: boolean;
};

export function StateChannelPanel({
  dealId,
  counterparty,
  depositor,
  amount,
  isDepositor,
}: StateChannelPanelProps) {
  const { state, isConnected, connect, disconnect } = useYellowConnection();
  const {
    sessionId,
    messages,
    isCreating,
    isClosing,
    error,
    createSession,
    sendMessage,
    closeSession,
    hasSession,
  } = useDealSession(dealId);

  const [chatInput, setChatInput] = useState("");

  const handleCreateSession = () => {
    createSession(counterparty, amount);
  };

  const handleSendChat = () => {
    if (!chatInput.trim()) return;
    sendMessage("chat", chatInput.trim());
    setChatInput("");
  };

  const handleConfirm = () => {
    sendMessage("confirm", "Deal confirmed by counterparty");
  };

  const handleMilestone = () => {
    sendMessage("milestone", "Milestone completed");
  };

  const handleCloseSession = () => {
    closeSession(depositor, counterparty, amount);
  };

  return (
    <div className="border border-border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground tracking-wide">
          state channel (yellow network)
        </div>
        <ConnectionBadge state={state} />
      </div>

      {/* Connection Controls */}
      {!isConnected && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            connect to Yellow ClearNode for instant off-chain deal
            confirmations. no gas fees for messages.
          </p>
          <button
            onClick={connect}
            disabled={state === "connecting" || state === "authenticating"}
            className="w-full px-4 py-2 text-xs bg-yellow-500 text-black hover:bg-yellow-400 transition-colors disabled:opacity-40"
          >
            {state === "connecting"
              ? "connecting..."
              : state === "authenticating"
                ? "authenticating..."
                : "connect to clearnode"}
          </button>
        </div>
      )}

      {/* Connected — Session Management */}
      {isConnected && !hasSession && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            open a state channel session with the{" "}
            {isDepositor ? "counterparty" : "depositor"} for gasless deal
            updates.
          </p>
          <button
            onClick={handleCreateSession}
            disabled={isCreating}
            className="w-full px-4 py-2 text-xs border border-yellow-500 text-yellow-500 hover:bg-yellow-500/10 transition-colors disabled:opacity-40"
          >
            {isCreating ? "creating session..." : "open deal session"}
          </button>
        </div>
      )}

      {/* Active Session */}
      {isConnected && hasSession && (
        <div className="space-y-3">
          {/* Session Info */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">session</span>
            <span className="font-mono text-foreground">
              {sessionId?.slice(0, 10)}...
            </span>
          </div>

          {/* Messages */}
          <div className="border border-border max-h-48 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground text-center">
                no messages yet — send a confirmation or chat
              </div>
            ) : (
              <div className="divide-y divide-border">
                {messages.map((msg, i) => (
                  <MessageRow key={i} msg={msg} />
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              className="flex-1 px-2 py-1.5 text-xs border border-green-600 text-green-600 hover:bg-green-600/10 transition-colors"
            >
              confirm
            </button>
            <button
              onClick={handleMilestone}
              className="flex-1 px-2 py-1.5 text-xs border border-blue-500 text-blue-500 hover:bg-blue-500/10 transition-colors"
            >
              milestone
            </button>
          </div>

          {/* Chat Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
              placeholder="type a message..."
              className="flex-1 px-3 py-1.5 text-xs bg-transparent border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-yellow-500"
            />
            <button
              onClick={handleSendChat}
              disabled={!chatInput.trim()}
              className="px-3 py-1.5 text-xs bg-yellow-500 text-black hover:bg-yellow-400 transition-colors disabled:opacity-40"
            >
              send
            </button>
          </div>

          {/* Close Session */}
          <button
            onClick={handleCloseSession}
            disabled={isClosing}
            className="w-full px-4 py-2 text-xs border border-destructive text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
          >
            {isClosing ? "closing..." : "close session (finalize off-chain)"}
          </button>
        </div>
      )}

      {/* Disconnect */}
      {isConnected && (
        <button
          onClick={disconnect}
          className="w-full px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          disconnect from clearnode
        </button>
      )}

      {/* Error Display */}
      {error && <div className="text-xs text-destructive">{error}</div>}
    </div>
  );
}

function ConnectionBadge({
  state,
}: {
  state: string;
}) {
  const colors: Record<string, string> = {
    disconnected: "bg-muted-foreground",
    connecting: "bg-yellow-500 animate-pulse",
    authenticating: "bg-yellow-500 animate-pulse",
    connected: "bg-green-500",
    error: "bg-destructive",
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full ${colors[state] ?? "bg-muted-foreground"}`} />
      <span className="text-xs text-muted-foreground">{state}</span>
    </div>
  );
}

function MessageRow({ msg }: { msg: DealMessage }) {
  const typeColors: Record<string, string> = {
    confirm: "text-green-500",
    reject: "text-destructive",
    milestone: "text-blue-500",
    chat: "text-foreground",
  };

  return (
    <div className="px-3 py-2 text-xs">
      <div className="flex items-center justify-between mb-0.5">
        <span className={typeColors[msg.type] ?? "text-foreground"}>
          {msg.type}
        </span>
        <span className="text-muted-foreground font-mono">
          {msg.sender.slice(0, 6)}...{msg.sender.slice(-4)}
        </span>
      </div>
      <div className="text-muted-foreground">{msg.content}</div>
    </div>
  );
}
