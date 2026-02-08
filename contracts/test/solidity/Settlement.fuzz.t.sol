// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../contracts/Settlement.sol";
import "../../contracts/interfaces/ISettlement.sol";
import "../../contracts/mocks/MockERC20.sol";
import {SettleParams} from "../../contracts/Types.sol";

contract SettlementFuzzTest is Test {
    Settlement public settlement;
    MockERC20 public usdc;
    address public depositor;
    address public counterparty;

    function setUp() public {
        depositor = makeAddr("depositor");
        counterparty = makeAddr("counterparty");

        usdc = new MockERC20("USD Coin", "USDC", 6);
        settlement = new Settlement(
            address(usdc),
            address(0),
            address(0)
        );
        settlement.setEscrow(address(this));
    }

    /// @notice Fuzz: yield split always distributes exact total, no tokens stuck
    function testFuzz_yieldSplit_conservation(
        uint256 principal,
        uint256 yieldAmount,
        uint8 yieldSplitCounterparty
    ) public {
        // Bound to realistic ranges
        principal = bound(principal, 1, 1_000_000_000e6); // 1 wei to 1B USDC
        yieldAmount = bound(yieldAmount, 0, 1_000_000e6); // 0 to 1M USDC yield
        yieldSplitCounterparty = uint8(bound(yieldSplitCounterparty, 0, 100));

        uint256 total = principal + yieldAmount;

        usdc.mint(address(this), total);
        usdc.approve(address(settlement), total);

        settlement.settle(SettleParams({
            dealId: 1,
            depositor: depositor,
            counterparty: counterparty,
            principal: principal,
            total: total,
            yieldSplitCounterparty: yieldSplitCounterparty
        }), "");

        uint256 counterpartyBal = usdc.balanceOf(counterparty);
        uint256 depositorBal = usdc.balanceOf(depositor);
        uint256 settlementBal = usdc.balanceOf(address(settlement));

        // Conservation: all tokens distributed, none stuck in settlement
        assertEq(counterpartyBal + depositorBal, total, "tokens must be fully distributed");
        assertEq(settlementBal, 0, "no tokens should remain in settlement");
    }

    /// @notice Fuzz: counterparty always gets at least the principal
    function testFuzz_counterparty_gets_principal(
        uint256 principal,
        uint256 yieldAmount,
        uint8 yieldSplitCounterparty
    ) public {
        principal = bound(principal, 1, 1_000_000_000e6);
        yieldAmount = bound(yieldAmount, 0, 1_000_000e6);
        yieldSplitCounterparty = uint8(bound(yieldSplitCounterparty, 0, 100));

        uint256 total = principal + yieldAmount;

        usdc.mint(address(this), total);
        usdc.approve(address(settlement), total);

        settlement.settle(SettleParams({
            dealId: 1,
            depositor: depositor,
            counterparty: counterparty,
            principal: principal,
            total: total,
            yieldSplitCounterparty: yieldSplitCounterparty
        }), "");

        uint256 counterpartyBal = usdc.balanceOf(counterparty);
        assertGe(counterpartyBal, principal, "counterparty must get at least principal");
    }

    /// @notice Fuzz: depositor gets exactly their yield share
    function testFuzz_depositor_yield_share(
        uint256 principal,
        uint256 yieldAmount,
        uint8 yieldSplitCounterparty
    ) public {
        principal = bound(principal, 1, 1_000_000_000e6);
        yieldAmount = bound(yieldAmount, 0, 1_000_000e6);
        yieldSplitCounterparty = uint8(bound(yieldSplitCounterparty, 0, 100));

        uint256 total = principal + yieldAmount;

        usdc.mint(address(this), total);
        usdc.approve(address(settlement), total);

        settlement.settle(SettleParams({
            dealId: 1,
            depositor: depositor,
            counterparty: counterparty,
            principal: principal,
            total: total,
            yieldSplitCounterparty: yieldSplitCounterparty
        }), "");

        uint256 depositorBal = usdc.balanceOf(depositor);
        uint256 expectedDepositorYield = yieldAmount - (yieldAmount * yieldSplitCounterparty) / 100;
        assertEq(depositorBal, expectedDepositorYield, "depositor should get (100 - split)% of yield");
    }

    /// @notice Fuzz: 0% split means counterparty gets only principal
    function testFuzz_zero_split_counterparty_gets_principal_only(
        uint256 principal,
        uint256 yieldAmount
    ) public {
        principal = bound(principal, 1, 1_000_000_000e6);
        yieldAmount = bound(yieldAmount, 0, 1_000_000e6);

        uint256 total = principal + yieldAmount;

        usdc.mint(address(this), total);
        usdc.approve(address(settlement), total);

        settlement.settle(SettleParams({
            dealId: 1,
            depositor: depositor,
            counterparty: counterparty,
            principal: principal,
            total: total,
            yieldSplitCounterparty: 0
        }), "");

        assertEq(usdc.balanceOf(counterparty), principal, "counterparty gets only principal at 0% split");
        assertEq(usdc.balanceOf(depositor), yieldAmount, "depositor gets all yield at 0% split");
    }

    /// @notice Fuzz: 100% split means depositor gets nothing
    function testFuzz_full_split_depositor_gets_nothing(
        uint256 principal,
        uint256 yieldAmount
    ) public {
        principal = bound(principal, 1, 1_000_000_000e6);
        yieldAmount = bound(yieldAmount, 0, 1_000_000e6);

        uint256 total = principal + yieldAmount;

        usdc.mint(address(this), total);
        usdc.approve(address(settlement), total);

        settlement.settle(SettleParams({
            dealId: 1,
            depositor: depositor,
            counterparty: counterparty,
            principal: principal,
            total: total,
            yieldSplitCounterparty: 100
        }), "");

        assertEq(usdc.balanceOf(counterparty), total, "counterparty gets everything at 100% split");
        assertEq(usdc.balanceOf(depositor), 0, "depositor gets nothing at 100% split");
    }

    /// @notice Fuzz: invalid yield split (>100) always reverts
    function testFuzz_invalid_yield_split_reverts(uint8 badSplit) public {
        vm.assume(badSplit > 100);

        uint256 total = 5100e6;
        uint256 principal = 5000e6;

        usdc.mint(address(this), total);
        usdc.approve(address(settlement), total);

        vm.expectRevert(abi.encodeWithSelector(ISettlement.InvalidYieldSplit.selector, badSplit));
        settlement.settle(SettleParams({
            dealId: 1,
            depositor: depositor,
            counterparty: counterparty,
            principal: principal,
            total: total,
            yieldSplitCounterparty: badSplit
        }), "");
    }

    /// @notice Fuzz: total less than principal always reverts
    function testFuzz_total_less_than_principal_reverts(
        uint256 principal,
        uint256 total
    ) public {
        principal = bound(principal, 1, type(uint128).max);
        vm.assume(total < principal);

        usdc.mint(address(this), total);
        usdc.approve(address(settlement), total);

        vm.expectRevert(abi.encodeWithSelector(ISettlement.TotalLessThanPrincipal.selector, total, principal));
        settlement.settle(SettleParams({
            dealId: 1,
            depositor: depositor,
            counterparty: counterparty,
            principal: principal,
            total: total,
            yieldSplitCounterparty: 50
        }), "");
    }
}
