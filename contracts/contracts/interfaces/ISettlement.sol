// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISettlement
/// @notice Interface for settlement logic — yield splitting and payout routing
interface ISettlement {
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

    /// @notice Settle a deal: split yield and pay out parties
    /// @param params The settlement parameters
    /// @param lifiData Encoded LI.FI cross-chain route data (empty for same-chain)
    function settle(SettleParams calldata params, bytes calldata lifiData) external;

    /// @notice Settle a deal with yield swapped via hook to counterparty's preferred token
    /// @param params The settlement parameters
    /// @param preferredToken The token counterparty wants their yield in
    function settleWithHook(SettleParams calldata params, address preferredToken) external;
}
