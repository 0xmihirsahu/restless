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

    SettleCall[] public settleCalls;

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

    function getSettleCallCount() external view returns (uint256) {
        return settleCalls.length;
    }
}
