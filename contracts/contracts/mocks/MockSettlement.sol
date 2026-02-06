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
        uint256 dealId,
        address depositor,
        address counterparty,
        uint256 principal,
        uint256 total,
        uint8 yieldSplitCounterparty,
        bytes calldata lifiData
    ) external override {
        settleCalls.push(SettleCall({
            dealId: dealId,
            depositor: depositor,
            counterparty: counterparty,
            principal: principal,
            total: total,
            yieldSplitCounterparty: yieldSplitCounterparty,
            lifiData: lifiData
        }));
    }

    function settleWithHook(
        uint256 dealId,
        address depositor,
        address counterparty,
        uint256 principal,
        uint256 total,
        uint8 yieldSplitCounterparty,
        address preferredToken
    ) external override {
        settleWithHookCalls.push(SettleWithHookCall({
            dealId: dealId,
            depositor: depositor,
            counterparty: counterparty,
            principal: principal,
            total: total,
            yieldSplitCounterparty: yieldSplitCounterparty,
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
