// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../contracts/Settlement.sol";
import "../../contracts/interfaces/ISettlement.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockLiFiDiamond.sol";
import "../../contracts/mocks/MockLiFiDiamondNoOp.sol";
import "../../contracts/RestlessSettlementHook.sol";
import {SettleParams} from "../../contracts/Types.sol";

contract SettlementTest is Test {
    Settlement public settlement;
    MockERC20 public usdc;
    address public deployer;
    address public depositor;
    address public counterparty;

    uint256 constant PRINCIPAL = 5000e6;
    uint256 constant YIELD = 100e6;
    uint256 constant TOTAL = PRINCIPAL + YIELD;

    function setUp() public {
        deployer = address(this);
        depositor = makeAddr("depositor");
        counterparty = makeAddr("counterparty");

        usdc = new MockERC20("USD Coin", "USDC", 6);
        settlement = new Settlement(
            address(usdc),
            address(0), // no LI.FI
            address(0)  // no hook
        );
        settlement.setEscrow(address(this));
    }

    function test_settle_100pct_yield_to_counterparty() public {
        _mintAndApprove(TOTAL);

        settlement.settle(SettleParams({
            dealId: 1,
            depositor: depositor,
            counterparty: counterparty,
            principal: PRINCIPAL,
            total: TOTAL,
            yieldSplitCounterparty: 100
        }), "");

        assertEq(usdc.balanceOf(counterparty), TOTAL, "counterparty should get principal + all yield");
        assertEq(usdc.balanceOf(depositor), 0, "depositor should get nothing");
    }

    function test_settle_0pct_yield_to_counterparty() public {
        _mintAndApprove(TOTAL);

        settlement.settle(SettleParams({
            dealId: 1,
            depositor: depositor,
            counterparty: counterparty,
            principal: PRINCIPAL,
            total: TOTAL,
            yieldSplitCounterparty: 0
        }), "");

        assertEq(usdc.balanceOf(counterparty), PRINCIPAL, "counterparty should get only principal");
        assertEq(usdc.balanceOf(depositor), YIELD, "depositor should get all yield");
    }

    function test_settle_50pct_yield_split() public {
        _mintAndApprove(TOTAL);

        settlement.settle(SettleParams({
            dealId: 1,
            depositor: depositor,
            counterparty: counterparty,
            principal: PRINCIPAL,
            total: TOTAL,
            yieldSplitCounterparty: 50
        }), "");

        uint256 halfYield = YIELD / 2;
        assertEq(usdc.balanceOf(counterparty), PRINCIPAL + halfYield, "counterparty should get principal + half yield");
        assertEq(usdc.balanceOf(depositor), halfYield, "depositor should get half yield");
    }

    function test_settle_no_yield() public {
        _mintAndApprove(PRINCIPAL);

        settlement.settle(SettleParams({
            dealId: 1,
            depositor: depositor,
            counterparty: counterparty,
            principal: PRINCIPAL,
            total: PRINCIPAL,
            yieldSplitCounterparty: 100
        }), "");

        assertEq(usdc.balanceOf(counterparty), PRINCIPAL, "counterparty should get principal");
        assertEq(usdc.balanceOf(depositor), 0, "depositor should get nothing");
    }

    function test_revert_total_less_than_principal() public {
        uint256 badTotal = PRINCIPAL - 100e6;
        _mintAndApprove(badTotal);

        vm.expectRevert(ISettlement.TotalLessThanPrincipal.selector);
        settlement.settle(SettleParams({
            dealId: 1,
            depositor: depositor,
            counterparty: counterparty,
            principal: PRINCIPAL,
            total: badTotal,
            yieldSplitCounterparty: 100
        }), "");
    }

    function test_revert_invalid_yield_split() public {
        _mintAndApprove(TOTAL);

        vm.expectRevert(ISettlement.InvalidYieldSplit.selector);
        settlement.settle(SettleParams({
            dealId: 1,
            depositor: depositor,
            counterparty: counterparty,
            principal: PRINCIPAL,
            total: TOTAL,
            yieldSplitCounterparty: 101
        }), "");
    }

    function test_revert_zero_principal() public {
        _mintAndApprove(TOTAL);

        vm.expectRevert(ISettlement.InvalidPrincipal.selector);
        settlement.settle(SettleParams({
            dealId: 1,
            depositor: depositor,
            counterparty: counterparty,
            principal: 0,
            total: TOTAL,
            yieldSplitCounterparty: 100
        }), "");
    }

    function test_lifi_revert_when_tokens_not_consumed() public {
        MockLiFiDiamondNoOp badDiamond = new MockLiFiDiamondNoOp();
        Settlement lifiSettlement = new Settlement(
            address(usdc),
            address(badDiamond),
            address(0)
        );
        lifiSettlement.setEscrow(address(this));

        usdc.mint(address(this), TOTAL);
        usdc.approve(address(lifiSettlement), TOTAL);

        // Encode a bridge call that the no-op diamond will accept
        bytes memory lifiData = abi.encodeWithSignature(
            "bridgeTokens(address,uint256,address,uint256)",
            address(usdc), TOTAL, counterparty, 421614
        );

        vm.expectRevert(ISettlement.LiFiAmountMismatch.selector);
        lifiSettlement.settle(SettleParams({
            dealId: 1,
            depositor: depositor,
            counterparty: counterparty,
            principal: PRINCIPAL,
            total: TOTAL,
            yieldSplitCounterparty: 100
        }), lifiData);
    }

    function test_lifi_successful_bridge() public {
        MockLiFiDiamond diamond = new MockLiFiDiamond();
        Settlement lifiSettlement = new Settlement(
            address(usdc),
            address(diamond),
            address(0)
        );
        lifiSettlement.setEscrow(address(this));

        usdc.mint(address(this), TOTAL);
        usdc.approve(address(lifiSettlement), TOTAL);

        bytes memory lifiData = abi.encodeWithSignature(
            "bridgeTokens(address,uint256,address,uint256)",
            address(usdc), TOTAL, counterparty, 421614
        );

        lifiSettlement.settle(SettleParams({
            dealId: 1,
            depositor: depositor,
            counterparty: counterparty,
            principal: PRINCIPAL,
            total: TOTAL,
            yieldSplitCounterparty: 100
        }), lifiData);

        assertEq(usdc.balanceOf(address(diamond)), TOTAL, "diamond should hold bridged tokens");
        assertEq(usdc.balanceOf(counterparty), 0, "counterparty should not have tokens directly");
    }

    function test_lifi_approval_reset_after_bridge() public {
        MockLiFiDiamond diamond = new MockLiFiDiamond();
        Settlement lifiSettlement = new Settlement(
            address(usdc),
            address(diamond),
            address(0)
        );
        lifiSettlement.setEscrow(address(this));

        usdc.mint(address(this), TOTAL);
        usdc.approve(address(lifiSettlement), TOTAL);

        bytes memory lifiData = abi.encodeWithSignature(
            "bridgeTokens(address,uint256,address,uint256)",
            address(usdc), TOTAL, counterparty, 421614
        );

        lifiSettlement.settle(SettleParams({
            dealId: 1,
            depositor: depositor,
            counterparty: counterparty,
            principal: PRINCIPAL,
            total: TOTAL,
            yieldSplitCounterparty: 100
        }), lifiData);

        uint256 remaining = usdc.allowance(address(lifiSettlement), address(diamond));
        assertEq(remaining, 0, "approval should be reset to 0 after bridge");
    }

    function test_emit_DealSettled() public {
        _mintAndApprove(TOTAL);

        vm.expectEmit(true, true, true, true);
        emit ISettlement.DealSettled(1, depositor, counterparty, TOTAL, 0);

        settlement.settle(SettleParams({
            dealId: 1,
            depositor: depositor,
            counterparty: counterparty,
            principal: PRINCIPAL,
            total: TOTAL,
            yieldSplitCounterparty: 100
        }), "");
    }

    function test_settleWithHook_revert_no_hook() public {
        _mintAndApprove(TOTAL);

        vm.expectRevert(ISettlement.HookNotConfigured.selector);
        settlement.settleWithHook(SettleParams({
            dealId: 1,
            depositor: depositor,
            counterparty: counterparty,
            principal: PRINCIPAL,
            total: TOTAL,
            yieldSplitCounterparty: 100
        }), makeAddr("weth"));
    }

    function _mintAndApprove(uint256 amount) internal {
        usdc.mint(address(this), amount);
        usdc.approve(address(settlement), amount);
    }
}
