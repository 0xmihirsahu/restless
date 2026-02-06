// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ISettlement.sol";
import "./interfaces/IRestlessSettlementHook.sol";

/// @title Settlement
/// @notice Handles yield splitting, payout routing, cross-chain bridging (LI.FI), and yield swaps (v4 hook)
/// @dev Called by RestlessEscrow after withdrawing funds from yield adapter
contract Settlement is ISettlement {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public immutable lifiDiamond;
    address public immutable owner;
    IRestlessSettlementHook public hook;

    event DealSettled(
        uint256 indexed dealId,
        address indexed depositor,
        address indexed counterparty,
        uint256 counterpartyPayout,
        uint256 depositorPayout
    );

    event HookUpdated(address indexed hook);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address _token, address _lifiDiamond, address _hook) {
        require(_token != address(0), "Invalid token");

        token = IERC20(_token);
        lifiDiamond = _lifiDiamond;
        owner = msg.sender;

        if (_hook != address(0)) {
            hook = IRestlessSettlementHook(_hook);
        }
    }

    /// @notice Update the settlement hook address
    function setHook(address _hook) external onlyOwner {
        hook = IRestlessSettlementHook(_hook);
        emit HookUpdated(_hook);
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
                // Cross-chain routing via LI.FI diamond
                require(lifiDiamond != address(0), "LI.FI not configured");
                uint256 balBefore = token.balanceOf(address(this));
                token.approve(lifiDiamond, counterpartyPayout);
                (bool success, ) = lifiDiamond.call(lifiData);
                require(success, "LI.FI bridge failed");
                uint256 balAfter = token.balanceOf(address(this));
                require(balBefore - balAfter == counterpartyPayout, "LI.FI amount mismatch");
                token.approve(lifiDiamond, 0);
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

    /// @notice Settle with yield swapped to counterparty's preferred token via hook
    /// @param dealId The deal identifier
    /// @param depositor The depositor address
    /// @param counterparty The counterparty address
    /// @param principal The original deposited amount
    /// @param total The total withdrawn amount (principal + yield)
    /// @param yieldSplitCounterparty Percentage of yield going to counterparty (0-100)
    /// @param preferredToken The token counterparty wants their yield in
    /// @inheritdoc ISettlement
    function settleWithHook(
        uint256 dealId,
        address depositor,
        address counterparty,
        uint256 principal,
        uint256 total,
        uint8 yieldSplitCounterparty,
        address preferredToken
    ) external override {
        require(principal > 0, "Principal must be > 0");
        require(total >= principal, "Total less than principal");
        require(yieldSplitCounterparty <= 100, "Invalid yield split");
        require(address(hook) != address(0), "Hook not configured");

        // Pull tokens from caller (escrow)
        token.safeTransferFrom(msg.sender, address(this), total);

        // Calculate yield and split
        uint256 yieldAmount = total - principal;
        uint256 counterpartyYield = (yieldAmount * yieldSplitCounterparty) / 100;
        uint256 depositorYield = yieldAmount - counterpartyYield;

        // Send principal directly to counterparty in USDC
        if (principal > 0) {
            token.safeTransfer(counterparty, principal);
        }

        // Route counterparty's yield through hook for swap
        if (counterpartyYield > 0) {
            token.approve(address(hook), counterpartyYield);
            hook.settleWithSwap(counterparty, counterpartyYield, preferredToken);
        }

        // Pay depositor their yield share in USDC
        if (depositorYield > 0) {
            token.safeTransfer(depositor, depositorYield);
        }

        emit DealSettled(dealId, depositor, counterparty, principal + counterpartyYield, depositorYield);
    }
}
