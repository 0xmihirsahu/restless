// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../contracts/RestlessEscrow.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockYieldAdapter.sol";
import "../../contracts/mocks/MockSettlement.sol";

contract RestlessEscrowFuzzTest is Test {
    RestlessEscrow public escrow;
    MockERC20 public usdc;
    MockYieldAdapter public adapter;
    MockSettlement public settlement;

    address public depositor;
    address public counterparty;

    function setUp() public {
        depositor = makeAddr("depositor");
        counterparty = makeAddr("counterparty");

        usdc = new MockERC20("USD Coin", "USDC", 6);
        adapter = new MockYieldAdapter(address(usdc));
        settlement = new MockSettlement();

        escrow = new RestlessEscrow(
            address(usdc),
            address(adapter),
            address(settlement)
        );
    }

    /// @notice Fuzz: any valid deal params should create successfully
    function testFuzz_createDeal(
        uint256 amount,
        uint8 yieldSplit,
        uint256 timeout
    ) public {
        amount = bound(amount, 1, type(uint128).max);
        yieldSplit = uint8(bound(yieldSplit, 0, 100));
        timeout = bound(timeout, 1 days, 30 days);

        vm.prank(depositor);
        uint256 id = escrow.createDeal(
            counterparty,
            amount,
            yieldSplit,
            timeout,
            keccak256("fuzz-deal")
        );

        assertEq(id, 1);
        RestlessEscrow.Deal memory deal = escrow.getDeal(id);
        assertEq(deal.amount, amount);
        assertEq(deal.yieldSplitCounterparty, yieldSplit);
        assertEq(deal.timeout, timeout);
        assertEq(uint8(deal.status), uint8(RestlessEscrow.DealStatus.Created));
    }

    /// @notice Fuzz: any deposit amount should fund and reach yield adapter
    function testFuzz_fundDeal(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000_000e6); // up to 1B USDC

        vm.prank(depositor);
        uint256 dealId = escrow.createDeal(
            counterparty, amount, 50, 7 days, keccak256("fuzz-fund")
        );

        usdc.mint(depositor, amount);
        vm.startPrank(depositor);
        usdc.approve(address(escrow), amount);
        escrow.fundDeal(dealId);
        vm.stopPrank();

        // Adapter should hold the tokens
        assertEq(usdc.balanceOf(address(adapter)), amount);
        RestlessEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(uint8(deal.status), uint8(RestlessEscrow.DealStatus.Funded));
    }

    /// @notice Fuzz: timeout claim always returns principal + yield to depositor
    function testFuzz_claimTimeout_returns_funds(
        uint256 amount,
        uint256 mockYield,
        uint256 timeout
    ) public {
        amount = bound(amount, 1, 1_000_000_000e6);
        mockYield = bound(mockYield, 0, 1_000_000e6);
        timeout = bound(timeout, 1 days, 30 days);

        adapter.setMockYield(mockYield);
        usdc.mint(address(adapter), mockYield);

        vm.prank(depositor);
        uint256 dealId = escrow.createDeal(
            counterparty, amount, 50, timeout, keccak256("fuzz-timeout")
        );

        usdc.mint(depositor, amount);
        vm.startPrank(depositor);
        usdc.approve(address(escrow), amount);
        escrow.fundDeal(dealId);
        escrow.disputeDeal(dealId);
        vm.stopPrank();

        vm.warp(block.timestamp + timeout + 1);

        vm.prank(depositor);
        escrow.claimTimeout(dealId);

        assertEq(usdc.balanceOf(depositor), amount + mockYield, "depositor should get full refund + yield");
        assertEq(uint8(escrow.getDeal(dealId).status), uint8(RestlessEscrow.DealStatus.TimedOut));
    }

    /// @notice Fuzz: invalid timeout values always revert
    function testFuzz_invalid_timeout_reverts(uint256 timeout) public {
        vm.assume(timeout < 1 days || timeout > 30 days);

        vm.prank(depositor);
        vm.expectRevert("Invalid timeout");
        escrow.createDeal(counterparty, 1000e6, 50, timeout, keccak256("bad-timeout"));
    }
}
