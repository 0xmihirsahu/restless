// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IRestlessSettlementHook.sol";

/// @title RestlessSettlementHook
/// @notice Stub for Uniswap v4 hook — swaps yield tokens to recipient's preferred token
/// @dev For the hackathon, this uses a simple mock swap mechanism.
///      In production, this would integrate with Uniswap v4 PoolManager.
contract RestlessSettlementHook is IRestlessSettlementHook {
    using SafeERC20 for IERC20;

    IERC20 public immutable inputToken; // USDC
    address public immutable owner;
    address public immutable settlementAddress;

    // token address => rate per 1 unit of inputToken (scaled to token's decimals)
    // e.g., WETH rate = 0.0005e18 means 1 USDC (1e6) gets 0.0005 WETH (5e14)
    mapping(address => uint256) public swapRates;

    event YieldSwapped(
        address indexed recipient,
        address indexed outputToken,
        uint256 inputAmount,
        uint256 outputAmount
    );

    modifier onlySettlement() {
        require(msg.sender == settlementAddress, "Only settlement");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address _inputToken, address _settlementAddress) {
        require(_inputToken != address(0), "Invalid input token");
        require(_settlementAddress != address(0), "Invalid settlement");

        inputToken = IERC20(_inputToken);
        settlementAddress = _settlementAddress;
        owner = msg.sender;
    }

    /// @notice Configure the simulated swap rate for a token
    /// @param token The output token address
    /// @param ratePerUnit The amount of output token per 1 unit of input token (in output token decimals)
    function setSwapRate(address token, uint256 ratePerUnit) external onlyOwner {
        swapRates[token] = ratePerUnit;
    }

    /// @inheritdoc IRestlessSettlementHook
    function settleWithSwap(
        address recipient,
        uint256 yieldAmount,
        address preferredToken
    ) external onlySettlement returns (uint256 amountOut) {
        require(yieldAmount > 0, "Amount must be > 0");
        require(swapRates[preferredToken] > 0, "No swap rate configured");

        // Pull USDC from settlement
        inputToken.safeTransferFrom(msg.sender, address(this), yieldAmount);

        // Calculate output amount using configured rate
        // rate is per 1 full unit of inputToken (1e6 for USDC)
        amountOut = (yieldAmount * swapRates[preferredToken]) / 1e6;

        // Transfer output token to recipient
        IERC20(preferredToken).safeTransfer(recipient, amountOut);

        emit YieldSwapped(recipient, preferredToken, yieldAmount, amountOut);
    }
}
