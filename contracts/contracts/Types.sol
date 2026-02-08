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
    uint256 timeout;
    bytes32 dealHash;
}

struct Deal {
    uint256 id;
    address depositor;
    address counterparty;
    uint256 amount;
    uint8 yieldSplitCounterparty;
    DealStatus status;
    uint256 timeout;
    bytes32 dealHash;
    uint256 createdAt;
    uint256 fundedAt;
    uint256 disputedAt;
}

/// @notice Parameters for settling a deal
/// @param dealId The deal identifier
/// @param depositor The depositor address
/// @param counterparty The counterparty address
/// @param principal The original deposited amount
/// @param total The total withdrawn amount (principal + yield)
/// @param yieldSplitCounterparty Percentage of yield going to counterparty (0-100)
struct SettleParams {
    uint256 dealId;
    address depositor;
    address counterparty;
    uint256 principal;
    uint256 total;
    uint8 yieldSplitCounterparty;
}
