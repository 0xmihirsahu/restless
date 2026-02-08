// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/ISettlement.sol";

/// @notice Mock settlement for testing — just records calls
contract MockSettlement is ISettlement {
    struct SettleCall {
        uint256 dealId;
        address depositor;
        address counterparty;
        uint256 principal;
        uint256 total;
        uint8 yieldSplitCounterparty;
        bytes lifiData;
    }

    struct SettleWithHookCall {
        uint256 dealId;
        address depositor;
        address counterparty;
        uint256 principal;
        uint256 total;
        uint8 yieldSplitCounterparty;
        address preferredToken;
    }

    SettleCall[] public settleCalls;
    SettleWithHookCall[] public settleWithHookCalls;

    function settle(
        SettleParams calldata params,
        bytes calldata lifiData
    ) external override {
        settleCalls.push(SettleCall({
            dealId: params.dealId,
            depositor: params.depositor,
            counterparty: params.counterparty,
            principal: params.principal,
            total: params.total,
            yieldSplitCounterparty: params.yieldSplitCounterparty,
            lifiData: lifiData
        }));
    }

    function settleWithHook(
        SettleParams calldata params,
        address preferredToken
    ) external override {
        settleWithHookCalls.push(SettleWithHookCall({
            dealId: params.dealId,
            depositor: params.depositor,
            counterparty: params.counterparty,
            principal: params.principal,
            total: params.total,
            yieldSplitCounterparty: params.yieldSplitCounterparty,
            preferredToken: preferredToken
        }));
    }

    function getSettleCallCount() external view returns (uint256) {
        return settleCalls.length;
    }

    function getSettleWithHookCallCount() external view returns (uint256) {
        return settleWithHookCalls.length;
    }
}
