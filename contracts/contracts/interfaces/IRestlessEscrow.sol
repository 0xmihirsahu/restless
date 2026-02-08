// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CreateDealParams, Deal} from "../Types.sol";

/// @title IRestlessEscrow
/// @notice P2P escrow where locked funds earn yield while waiting for deal completion
/// @dev Escrow never holds tokens directly — routes to yield adapter immediately
interface IRestlessEscrow {
    event DealCreated(uint256 indexed dealId, address indexed depositor, address indexed counterparty, uint256 amount, bytes32 dealHash);
    event DealFunded(uint256 indexed dealId, uint256 amount);
    event DealSettled(uint256 indexed dealId, uint256 totalPayout);
    event DealDisputed(uint256 indexed dealId, address disputedBy);
    event DealTimedOut(uint256 indexed dealId, uint256 refundAmount);
    event DealCancelled(uint256 indexed dealId, address cancelledBy);

    /// @notice Create a new escrow deal
    /// @param params The deal parameters (counterparty, amount, yield split, timeout, deal hash)
    /// @return The deal ID
    function createDeal(CreateDealParams calldata params) external returns (uint256);

    /// @notice Fund an existing deal by depositing tokens into the yield adapter
    /// @param dealId The deal to fund
    function fundDeal(uint256 dealId) external;

    /// @notice Mark a funded deal as disputed, starting the timeout clock
    /// @param dealId The deal to dispute
    function disputeDeal(uint256 dealId) external;

    /// @notice Cancel an unfunded deal
    /// @param dealId The deal to cancel
    function cancelDeal(uint256 dealId) external;

    /// @notice Settle a funded deal via same-chain or LI.FI cross-chain routing
    /// @param dealId The deal to settle
    /// @param lifiData Encoded LI.FI bridge data (empty for same-chain)
    function settleDeal(uint256 dealId, bytes calldata lifiData) external;

    /// @notice Settle with EIP-712 dual signatures from both parties
    /// @param dealId The deal to settle
    /// @param lifiData Encoded LI.FI bridge data (empty for same-chain)
    /// @param depositorSig EIP-712 signature from the depositor
    /// @param counterpartySig EIP-712 signature from the counterparty
    function settleDealSigned(
        uint256 dealId,
        bytes calldata lifiData,
        bytes calldata depositorSig,
        bytes calldata counterpartySig
    ) external;

    /// @notice Settle a deal with yield swapped via v4 hook to counterparty's preferred token
    /// @param dealId The deal to settle
    /// @param preferredToken The token counterparty wants their yield in
    function settleDealWithHook(uint256 dealId, address preferredToken) external;

    /// @notice Settle with hook using EIP-712 dual signatures
    /// @param dealId The deal to settle
    /// @param preferredToken The token counterparty wants their yield in
    /// @param depositorSig EIP-712 signature from the depositor
    /// @param counterpartySig EIP-712 signature from the counterparty
    function settleDealWithHookSigned(
        uint256 dealId,
        address preferredToken,
        bytes calldata depositorSig,
        bytes calldata counterpartySig
    ) external;

    /// @notice Claim timeout refund after dispute period expires
    /// @param dealId The disputed deal whose timeout has elapsed
    function claimTimeout(uint256 dealId) external;

    /// @notice Get deal details
    /// @param dealId The deal to query
    function getDeal(uint256 dealId) external view returns (Deal memory);

    /// @notice Get accrued yield for a deal
    /// @param dealId The deal to query
    function getAccruedYield(uint256 dealId) external view returns (uint256);
}
