// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ISettlement.sol";

/// @title Settlement
/// @notice Handles yield splitting and payout routing for settled deals
/// @dev Called by RestlessEscrow after withdrawing funds from yield adapter
contract Settlement is ISettlement {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;

    event DealSettled(
        uint256 indexed dealId,
        address indexed depositor,
        address indexed counterparty,
        uint256 counterpartyPayout,
        uint256 depositorPayout
    );

    constructor(address _token) {
        require(_token != address(0), "Invalid token");
        token = IERC20(_token);
    }

    /// @inheritdoc ISettlement
    function settle(
        uint256 dealId,
        address depositor,
        address counterparty,
        uint256 principal,
        uint256 total,
        uint8 yieldSplitCounterparty,
        bytes calldata lifiData
    ) external override {
        require(principal > 0, "Principal must be > 0");
        require(total >= principal, "Total less than principal");
        require(yieldSplitCounterparty <= 100, "Invalid yield split");

        // Pull tokens from caller (escrow)
        token.safeTransferFrom(msg.sender, address(this), total);

        // Calculate yield and split
        uint256 yieldAmount = total - principal;
        uint256 counterpartyYield = (yieldAmount * yieldSplitCounterparty) / 100;
        uint256 depositorYield = yieldAmount - counterpartyYield;

        uint256 counterpartyPayout = principal + counterpartyYield;
        uint256 depositorPayout = depositorYield;

        // Pay counterparty (principal + their yield share)
        if (counterpartyPayout > 0) {
            if (lifiData.length > 0) {
                // Cross-chain routing via LI.FI (future implementation)
                // For now, same-chain transfer as fallback
                token.safeTransfer(counterparty, counterpartyPayout);
            } else {
                token.safeTransfer(counterparty, counterpartyPayout);
            }
        }

        // Pay depositor their yield share
        if (depositorPayout > 0) {
            token.safeTransfer(depositor, depositorPayout);
        }

        emit DealSettled(dealId, depositor, counterparty, counterpartyPayout, depositorPayout);
    }
}
