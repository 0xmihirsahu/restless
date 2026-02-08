// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IYieldAdapter
/// @notice Interface for yield-generating adapters (Aave, Morpho, etc.)
interface IYieldAdapter {
    error InvalidToken();
    error InvalidAmount();
    error DealAlreadyDeposited(uint256 dealId);
    error NoActiveDeposit(uint256 dealId);
    error OnlyEscrow(address caller);
    error OnlyOwner(address caller);
    error EscrowAlreadySet();
    error InvalidEscrow();

    event Deposited(uint256 indexed dealId, uint256 amount, uint256 aTokenReceived);
    event Withdrawn(uint256 indexed dealId, uint256 principal, uint256 total);

    /// @notice Deposit tokens into yield source for a specific deal
    function deposit(uint256 dealId, uint256 amount) external;

    /// @notice Withdraw full balance (principal + yield) for a deal
    function withdraw(uint256 dealId) external returns (uint256 total);

    /// @notice View current yield accrued for a deal
    function getAccruedYield(uint256 dealId) external view returns (uint256);

    /// @notice View the principal deposited for a deal
    function getPrincipal(uint256 dealId) external view returns (uint256);
}
