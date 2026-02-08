// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IRestlessSettlementHook.sol";

contract MockRestlessSettlementHook is IRestlessSettlementHook {
    using SafeERC20 for IERC20;

    IERC20 public immutable inputToken;
    address public immutable owner;
    address public immutable settlementAddress;

    mapping(address => uint256) public swapRates;

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

        inputToken.safeTransferFrom(msg.sender, address(this), yieldAmount);

        amountOut = (yieldAmount * swapRates[preferredToken]) / 1e6;

        IERC20(preferredToken).safeTransfer(recipient, amountOut);

        emit YieldSwapped(recipient, preferredToken, yieldAmount, amountOut);
    }
}
