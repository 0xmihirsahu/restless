// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IRestlessSettlementHook
/// @notice Uniswap v4 hook that swaps yield tokens to a recipient's preferred token
/// @dev Implements afterSwap for event tracking, uses unlock → swap → settle/take pattern
interface IRestlessSettlementHook {
    event YieldSwapped(
        address indexed recipient,
        address indexed outputToken,
        uint256 inputAmount,
        uint256 outputAmount
    );

    event PoolKeySet(address indexed preferredToken);

    /// @notice Swap yield tokens to recipient's preferred token via a Uniswap v4 pool
    /// @param recipient The address receiving the swapped tokens
    /// @param yieldAmount The amount of yield tokens (USDC) to swap
    /// @param preferredToken The token the recipient wants to receive
    /// @return amountOut The amount of preferred tokens received
    function settleWithSwap(
        address recipient,
        uint256 yieldAmount,
        address preferredToken
    ) external returns (uint256 amountOut);
}
