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
    address public escrow;

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner(msg.sender);
        _;
    }

    modifier onlyEscrow() {
        if (msg.sender != escrow) revert OnlyEscrow(msg.sender);
        _;
    }

    constructor(address _token, address _lifiDiamond, address _hook) {
        if (_token == address(0)) revert InvalidToken();

        token = IERC20(_token);
        lifiDiamond = _lifiDiamond;
        owner = msg.sender;

        if (_hook != address(0)) {
            hook = IRestlessSettlementHook(_hook);
        }
    }

    function setEscrow(address _escrow) external onlyOwner {
        if (_escrow == address(0)) revert InvalidEscrow();
        escrow = _escrow;
        emit EscrowUpdated(_escrow);
    }

    function setHook(address _hook) external onlyOwner {
        hook = IRestlessSettlementHook(_hook);
        emit HookUpdated(_hook);
    }

    /// @inheritdoc ISettlement
    function settle(
        SettleParams calldata params,
        bytes calldata lifiData
    ) external override onlyEscrow {
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
    ) external override onlyEscrow {
        _validateSettleParams(params);
        if (address(hook) == address(0)) revert HookNotConfigured();
        token.safeTransferFrom(msg.sender, address(this), params.total);

        (uint256 counterpartyYield, uint256 depositorYield) = _splitYield(params);

        if (params.principal > 0) {
            token.safeTransfer(params.counterparty, params.principal);
        }

        if (counterpartyYield > 0) {
            token.forceApprove(address(hook), counterpartyYield);
            hook.settleWithSwap(params.counterparty, counterpartyYield, preferredToken);
        }

        if (depositorYield > 0) {
            token.safeTransfer(params.depositor, depositorYield);
        }

        emit DealSettled(params.dealId, params.depositor, params.counterparty, params.principal + counterpartyYield, depositorYield);
    }

    /// @notice Rescue tokens accidentally sent to this contract
    /// @param _token The token to rescue
    /// @param to The recipient
    /// @param amount The amount to rescue
    function rescueTokens(IERC20 _token, address to, uint256 amount) external onlyOwner {
        _token.safeTransfer(to, amount);
    }

    function _validateSettleParams(SettleParams calldata params) internal pure {
        if (params.principal == 0) revert InvalidPrincipal();
        if (params.total < params.principal) revert TotalLessThanPrincipal(params.total, params.principal);
        if (params.yieldSplitCounterparty > 100) revert InvalidYieldSplit(params.yieldSplitCounterparty);
    }

    function _splitYield(
        SettleParams calldata params
    ) internal pure returns (uint256 counterpartyYield, uint256 depositorYield) {
        unchecked {
            uint256 yieldAmount = params.total - params.principal;
            counterpartyYield = (yieldAmount * params.yieldSplitCounterparty) / 100;
            depositorYield = yieldAmount - counterpartyYield;
        }
    }

    function _bridgeViaLifi(uint256 amount, bytes calldata lifiData) internal {
        if (lifiDiamond == address(0)) revert LiFiNotConfigured();
        uint256 balBefore = token.balanceOf(address(this));
        token.forceApprove(lifiDiamond, amount);
        (bool success, ) = lifiDiamond.call(lifiData);
        if (!success) revert LiFiBridgeFailed();
        uint256 consumed = balBefore - token.balanceOf(address(this));
        if (consumed != amount) revert LiFiAmountMismatch(amount, consumed);
        token.forceApprove(lifiDiamond, 0);
    }
}
