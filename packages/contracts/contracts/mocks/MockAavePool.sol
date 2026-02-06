// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../mocks/MockERC20.sol";

/// @notice Mock Aave V3 Pool for testing — takes USDC, mints aUSDC 1:1, simulates yield
contract MockAavePool {
    IERC20 public token;       // USDC
    MockERC20 public aToken;   // aUSDC (mock)

    constructor(address _token, address _aToken) {
        token = IERC20(_token);
        aToken = MockERC20(_aToken);
    }

    /// @notice Simulates Aave supply — takes USDC, mints aUSDC to onBehalfOf
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 /*referralCode*/) external {
        require(asset == address(token), "Wrong asset");
        token.transferFrom(msg.sender, address(this), amount);
        aToken.mint(onBehalfOf, amount);
    }

    /// @notice Simulates Aave withdraw — burns aUSDC, returns USDC to `to`
    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        require(asset == address(token), "Wrong asset");

        // type(uint256).max means withdraw all
        uint256 withdrawAmount = amount == type(uint256).max
            ? aToken.balanceOf(msg.sender)
            : amount;

        // Burn aTokens from caller (adapter must approve pool first)
        aToken.transferFrom(msg.sender, address(this), withdrawAmount);

        // Return USDC
        token.transfer(to, withdrawAmount);
        return withdrawAmount;
    }

    /// @notice Simulate yield accrual by minting extra aTokens to a holder
    function simulateYield(address holder, uint256 yieldAmount) external {
        aToken.mint(holder, yieldAmount);
        // Also need to back it with USDC in the pool
        // For testing: mint USDC to the pool so it can pay out
    }

    /// @notice Mint backing USDC to the pool (for yield simulation)
    function addBackingUSDC(uint256 amount) external {
        // The test should call token.mint(pool, amount) directly via MockERC20
    }
}
