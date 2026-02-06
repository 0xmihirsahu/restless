// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISettlement
/// @notice Interface for settlement logic — yield splitting and payout routing
interface ISettlement {
    /// @notice Settle a deal: withdraw yield, split, and pay out
    function settle(
        uint256 dealId,
        address depositor,
        address counterparty,
        uint256 principal,
        uint8 yieldSplitCounterparty,
        bytes calldata lifiData
    ) external;
}
