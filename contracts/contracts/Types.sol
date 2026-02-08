// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Types
/// @notice Shared types used across the Restless escrow protocol

enum DealStatus {
    Created,
    Funded,
    Settled,
    Disputed,
    TimedOut,
    Cancelled
}

struct CreateDealParams {
    address counterparty;
    uint256 amount;
    uint8 yieldSplitCounterparty;
    uint32 timeout;
    bytes32 dealHash;
}

/// @dev Storage-packed: 4 slots (down from 10)
/// Slot 0: depositor(20) + createdAt(5) + status(1) + yieldSplitCounterparty(1) + timeout(4) = 31 bytes
/// Slot 1: counterparty(20) + fundedAt(5) + disputedAt(5) = 30 bytes
/// Slot 2: amount (32 bytes)
/// Slot 3: dealHash (32 bytes)
struct Deal {
    address depositor;
    uint40 createdAt;
    DealStatus status;
    uint8 yieldSplitCounterparty;
    uint32 timeout;
    address counterparty;
    uint40 fundedAt;
    uint40 disputedAt;
    uint256 amount;
    bytes32 dealHash;
}

/// @notice Parameters for settling a deal (calldata-only, no storage packing needed)
struct SettleParams {
    uint256 dealId;
    address depositor;
    address counterparty;
    uint256 principal;
    uint256 total;
    uint8 yieldSplitCounterparty;
}
