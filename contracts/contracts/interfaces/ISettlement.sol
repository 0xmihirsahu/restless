// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SettleParams} from "../Types.sol";

/// @title ISettlement
/// @notice Handles yield splitting, payout routing, cross-chain bridging (LI.FI), and yield swaps (v4 hook)
/// @dev Called by RestlessEscrow after withdrawing funds from yield adapter
interface ISettlement {
    error InvalidToken();
    error InvalidPrincipal();
    error TotalLessThanPrincipal();
    error InvalidYieldSplit();
    error HookNotConfigured();
    error LiFiNotConfigured();
    error LiFiBridgeFailed();
    error LiFiAmountMismatch();
    error OnlyOwner();
    error OnlyEscrow();
    error InvalidEscrow();

    event DealSettled(
        uint256 indexed dealId,
        address indexed depositor,
        address indexed counterparty,
        uint256 counterpartyPayout,
        uint256 depositorPayout
    );

    event HookUpdated(address indexed hook);
    event EscrowUpdated(address indexed escrow);

    /// @notice Settle a deal: split yield and pay out parties
    /// @param params The settlement parameters
    /// @param lifiData Encoded LI.FI cross-chain route data (empty for same-chain)
    function settle(SettleParams calldata params, bytes calldata lifiData) external;

    /// @notice Settle a deal with yield swapped via hook to counterparty's preferred token
    /// @param params The settlement parameters
    /// @param preferredToken The token counterparty wants their yield in
    function settleWithHook(SettleParams calldata params, address preferredToken) external;
}
