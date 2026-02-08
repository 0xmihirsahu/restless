// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IRestlessSettlementHook.sol";

error NoSwapRate();

contract MockRestlessSettlementHook is IRestlessSettlementHook {
    using SafeERC20 for IERC20;

    IERC20 public immutable inputToken;
    address public immutable owner;
    address public immutable settlementAddress;

    mapping(address => uint256) public swapRates;

    modifier onlySettlement() {
        if (msg.sender != settlementAddress) revert OnlySettlement();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(address _inputToken, address _settlementAddress) {
        if (_inputToken == address(0)) revert InvalidInputToken();
        if (_settlementAddress == address(0)) revert InvalidSettlementAddress();

        inputToken = IERC20(_inputToken);
        settlementAddress = _settlementAddress;
        owner = msg.sender;
    }

    function setSwapRate(address token, uint256 ratePerUnit) external onlyOwner {
        swapRates[token] = ratePerUnit;
    }

    /// @inheritdoc IRestlessSettlementHook
    function settleWithSwap(
        address recipient,
        uint256 yieldAmount,
        address preferredToken
    ) external onlySettlement returns (uint256 amountOut) {
        if (yieldAmount == 0) revert InvalidAmount();
        if (swapRates[preferredToken] == 0) revert NoSwapRate();

        inputToken.safeTransferFrom(msg.sender, address(this), yieldAmount);

        amountOut = (yieldAmount * swapRates[preferredToken]) / 1e6;

        IERC20(preferredToken).safeTransfer(recipient, amountOut);

        emit YieldSwapped(recipient, preferredToken, yieldAmount, amountOut);
    }
}
