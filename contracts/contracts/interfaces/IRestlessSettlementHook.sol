// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IRestlessSettlementHook
/// @notice Interface for the optional Uniswap v4 yield-swap hook
interface IRestlessSettlementHook {
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
