// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ISettlement.sol";
import "./interfaces/IRestlessSettlementHook.sol";
import {SettleParams} from "./Types.sol";

contract Settlement is ISettlement {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public immutable lifiDiamond;
    address public immutable owner;
    IRestlessSettlementHook public hook;

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

    function setHook(address _hook) external onlyOwner {
        hook = IRestlessSettlementHook(_hook);
        emit HookUpdated(_hook);
    }

    /// @inheritdoc ISettlement
    function settle(
        SettleParams calldata params,
        bytes calldata lifiData
    ) external override {
        _validateSettleParams(params);
        token.safeTransferFrom(msg.sender, address(this), params.total);

        (uint256 counterpartyYield, uint256 depositorYield) = _splitYield(params);
        uint256 counterpartyPayout = params.principal + counterpartyYield;

        if (counterpartyPayout > 0) {
            if (lifiData.length > 0) {
                _bridgeViaLifi(counterpartyPayout, lifiData);
            } else {
                token.safeTransfer(params.counterparty, counterpartyPayout);
            }
        }

        if (depositorYield > 0) {
            token.safeTransfer(params.depositor, depositorYield);
        }

        emit DealSettled(params.dealId, params.depositor, params.counterparty, counterpartyPayout, depositorYield);
    }

    /// @inheritdoc ISettlement
    function settleWithHook(
        SettleParams calldata params,
        address preferredToken
    ) external override {
        _validateSettleParams(params);
        require(address(hook) != address(0), "Hook not configured");
        token.safeTransferFrom(msg.sender, address(this), params.total);

        (uint256 counterpartyYield, uint256 depositorYield) = _splitYield(params);

        if (params.principal > 0) {
            token.safeTransfer(params.counterparty, params.principal);
        }

        if (counterpartyYield > 0) {
            token.approve(address(hook), counterpartyYield);
            hook.settleWithSwap(params.counterparty, counterpartyYield, preferredToken);
        }

        if (depositorYield > 0) {
            token.safeTransfer(params.depositor, depositorYield);
        }

        emit DealSettled(params.dealId, params.depositor, params.counterparty, params.principal + counterpartyYield, depositorYield);
    }

    function _validateSettleParams(SettleParams calldata params) internal pure {
        require(params.principal > 0, "Principal must be > 0");
        require(params.total >= params.principal, "Total less than principal");
        require(params.yieldSplitCounterparty <= 100, "Invalid yield split");
    }

    function _splitYield(
        SettleParams calldata params
    ) internal pure returns (uint256 counterpartyYield, uint256 depositorYield) {
        uint256 yieldAmount = params.total - params.principal;
        counterpartyYield = (yieldAmount * params.yieldSplitCounterparty) / 100;
        depositorYield = yieldAmount - counterpartyYield;
    }

    function _bridgeViaLifi(uint256 amount, bytes calldata lifiData) internal {
        require(lifiDiamond != address(0), "LI.FI not configured");
        uint256 balBefore = token.balanceOf(address(this));
        token.approve(lifiDiamond, amount);
        (bool success, ) = lifiDiamond.call(lifiData);
        require(success, "LI.FI bridge failed");
        require(balBefore - token.balanceOf(address(this)) == amount, "LI.FI amount mismatch");
        token.approve(lifiDiamond, 0);
    }
}
