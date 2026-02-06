// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../contracts/RestlessEscrow.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockYieldAdapter.sol";
import "../../contracts/mocks/MockSettlement.sol";

contract RestlessEscrowTest is Test {
    RestlessEscrow public escrow;
    MockERC20 public usdc;
    MockYieldAdapter public adapter;
    MockSettlement public settlement;

    address public depositor;
    address public counterparty;
    address public stranger;

    uint256 constant AMOUNT = 5000e6;
    uint256 constant MOCK_YIELD = 100e6;
    uint256 constant TIMEOUT = 7 days;
    bytes32 constant DEAL_HASH = keccak256("test-deal");

    function setUp() public {
        depositor = makeAddr("depositor");
        counterparty = makeAddr("counterparty");
        stranger = makeAddr("stranger");

        usdc = new MockERC20("USD Coin", "USDC", 6);
        adapter = new MockYieldAdapter(address(usdc));
        settlement = new MockSettlement();

        escrow = new RestlessEscrow(
            address(usdc),
            address(adapter),
            address(settlement)
        );

        // Give yield adapter some extra USDC for simulated yield
        adapter.setMockYield(MOCK_YIELD);
        usdc.mint(address(adapter), MOCK_YIELD);
    }

    // ─── createDeal ─────────────────────────────────────────────────

    function test_createDeal() public {
        vm.prank(depositor);
        uint256 id = escrow.createDeal(counterparty, AMOUNT, 50, TIMEOUT, DEAL_HASH);

        assertEq(id, 1, "first deal should have id 1");
        assertEq(escrow.dealCount(), 1, "deal count should be 1");
    }

    function test_createDeal_increments() public {
        vm.startPrank(depositor);
        escrow.createDeal(counterparty, AMOUNT, 50, TIMEOUT, DEAL_HASH);
        uint256 id2 = escrow.createDeal(counterparty, AMOUNT, 50, TIMEOUT, DEAL_HASH);
        vm.stopPrank();

        assertEq(id2, 2, "second deal should have id 2");
    }

    function test_createDeal_revert_self_escrow() public {
        vm.prank(depositor);
        vm.expectRevert("Cannot escrow with self");
        escrow.createDeal(depositor, AMOUNT, 50, TIMEOUT, DEAL_HASH);
    }

    function test_createDeal_revert_zero_address() public {
        vm.prank(depositor);
        vm.expectRevert("Invalid counterparty");
        escrow.createDeal(address(0), AMOUNT, 50, TIMEOUT, DEAL_HASH);
    }

    function test_createDeal_revert_zero_amount() public {
        vm.prank(depositor);
        vm.expectRevert("Amount must be > 0");
        escrow.createDeal(counterparty, 0, 50, TIMEOUT, DEAL_HASH);
    }

    function test_createDeal_revert_invalid_yield_split() public {
        vm.prank(depositor);
        vm.expectRevert("Invalid yield split");
        escrow.createDeal(counterparty, AMOUNT, 101, TIMEOUT, DEAL_HASH);
    }

    function test_createDeal_revert_timeout_too_short() public {
        vm.prank(depositor);
        vm.expectRevert("Invalid timeout");
        escrow.createDeal(counterparty, AMOUNT, 50, 1 hours, DEAL_HASH);
    }

    function test_createDeal_revert_timeout_too_long() public {
        vm.prank(depositor);
        vm.expectRevert("Invalid timeout");
        escrow.createDeal(counterparty, AMOUNT, 50, 31 days, DEAL_HASH);
    }

    // ─── fundDeal ───────────────────────────────────────────────────

    function test_fundDeal() public {
        uint256 dealId = _createDeal();

        usdc.mint(depositor, AMOUNT);
        vm.startPrank(depositor);
        usdc.approve(address(escrow), AMOUNT);
        escrow.fundDeal(dealId);
        vm.stopPrank();

        RestlessEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(uint8(deal.status), uint8(RestlessEscrow.DealStatus.Funded), "deal should be Funded");
        assertTrue(deal.fundedAt > 0, "fundedAt should be set");
    }

    function test_fundDeal_revert_stranger() public {
        uint256 dealId = _createDeal();

        vm.prank(stranger);
        vm.expectRevert("Only depositor can fund");
        escrow.fundDeal(dealId);
    }

    function test_fundDeal_revert_nonexistent() public {
        vm.prank(depositor);
        vm.expectRevert("Deal does not exist");
        escrow.fundDeal(999);
    }

    function test_fundDeal_revert_already_funded() public {
        uint256 dealId = _createAndFundDeal();

        usdc.mint(depositor, AMOUNT);
        vm.startPrank(depositor);
        usdc.approve(address(escrow), AMOUNT);
        vm.expectRevert("Deal not in Created state");
        escrow.fundDeal(dealId);
        vm.stopPrank();
    }

    // ─── cancelDeal ─────────────────────────────────────────────────

    function test_cancelDeal_by_depositor() public {
        uint256 dealId = _createDeal();

        vm.prank(depositor);
        escrow.cancelDeal(dealId);

        RestlessEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(uint8(deal.status), uint8(RestlessEscrow.DealStatus.Cancelled));
    }

    function test_cancelDeal_by_counterparty() public {
        uint256 dealId = _createDeal();

        vm.prank(counterparty);
        escrow.cancelDeal(dealId);

        RestlessEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(uint8(deal.status), uint8(RestlessEscrow.DealStatus.Cancelled));
    }

    function test_cancelDeal_revert_stranger() public {
        uint256 dealId = _createDeal();

        vm.prank(stranger);
        vm.expectRevert("Only deal parties can cancel");
        escrow.cancelDeal(dealId);
    }

    function test_cancelDeal_revert_funded() public {
        uint256 dealId = _createAndFundDeal();

        vm.prank(depositor);
        vm.expectRevert("Deal not in Created state");
        escrow.cancelDeal(dealId);
    }

    // ─── disputeDeal ────────────────────────────────────────────────

    function test_disputeDeal() public {
        uint256 dealId = _createAndFundDeal();

        vm.prank(depositor);
        escrow.disputeDeal(dealId);

        RestlessEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(uint8(deal.status), uint8(RestlessEscrow.DealStatus.Disputed));
        assertTrue(deal.disputedAt > 0);
    }

    function test_disputeDeal_by_counterparty() public {
        uint256 dealId = _createAndFundDeal();

        vm.prank(counterparty);
        escrow.disputeDeal(dealId);

        RestlessEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(uint8(deal.status), uint8(RestlessEscrow.DealStatus.Disputed));
    }

    function test_disputeDeal_revert_stranger() public {
        uint256 dealId = _createAndFundDeal();

        vm.prank(stranger);
        vm.expectRevert("Only deal parties can dispute");
        escrow.disputeDeal(dealId);
    }

    // ─── settleDeal ─────────────────────────────────────────────────

    function test_settleDeal() public {
        uint256 dealId = _createAndFundDeal();

        vm.prank(depositor);
        escrow.settleDeal(dealId, "");

        RestlessEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(uint8(deal.status), uint8(RestlessEscrow.DealStatus.Settled));
        assertEq(settlement.getSettleCallCount(), 1, "settlement should be called once");
    }

    function test_settleDeal_revert_stranger() public {
        uint256 dealId = _createAndFundDeal();

        vm.prank(stranger);
        vm.expectRevert("Only deal parties can settle");
        escrow.settleDeal(dealId, "");
    }

    function test_settleDeal_revert_not_funded() public {
        uint256 dealId = _createDeal();

        vm.prank(depositor);
        vm.expectRevert("Deal not in Funded state");
        escrow.settleDeal(dealId, "");
    }

    // ─── claimTimeout ───────────────────────────────────────────────

    function test_claimTimeout() public {
        uint256 dealId = _createAndFundDeal();

        vm.prank(depositor);
        escrow.disputeDeal(dealId);

        // Fast forward past timeout
        vm.warp(block.timestamp + TIMEOUT + 1);

        vm.prank(depositor);
        escrow.claimTimeout(dealId);

        RestlessEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(uint8(deal.status), uint8(RestlessEscrow.DealStatus.TimedOut));
        assertEq(usdc.balanceOf(depositor), AMOUNT + MOCK_YIELD, "depositor should get principal + yield");
    }

    function test_claimTimeout_revert_not_elapsed() public {
        uint256 dealId = _createAndFundDeal();

        vm.prank(depositor);
        escrow.disputeDeal(dealId);

        vm.prank(depositor);
        vm.expectRevert("Timeout not elapsed");
        escrow.claimTimeout(dealId);
    }

    function test_claimTimeout_revert_not_disputed() public {
        uint256 dealId = _createAndFundDeal();

        vm.prank(depositor);
        vm.expectRevert("Deal not in Disputed state");
        escrow.claimTimeout(dealId);
    }

    function test_claimTimeout_revert_stranger() public {
        uint256 dealId = _createAndFundDeal();

        vm.prank(depositor);
        escrow.disputeDeal(dealId);

        vm.warp(block.timestamp + TIMEOUT + 1);

        vm.prank(stranger);
        vm.expectRevert("Only depositor can claim timeout");
        escrow.claimTimeout(dealId);
    }

    // ─── pause / unpause ────────────────────────────────────────────

    function test_pause_blocks_createDeal() public {
        escrow.pause();

        vm.prank(depositor);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        escrow.createDeal(counterparty, AMOUNT, 50, TIMEOUT, DEAL_HASH);
    }

    function test_unpause_allows_createDeal() public {
        escrow.pause();
        escrow.unpause();

        vm.prank(depositor);
        uint256 id = escrow.createDeal(counterparty, AMOUNT, 50, TIMEOUT, DEAL_HASH);
        assertEq(id, 1);
    }

    function test_pause_revert_non_owner() public {
        vm.prank(stranger);
        vm.expectRevert("Only owner");
        escrow.pause();
    }

    // ─── Helpers ────────────────────────────────────────────────────

    function _createDeal() internal returns (uint256) {
        vm.prank(depositor);
        return escrow.createDeal(counterparty, AMOUNT, 50, TIMEOUT, DEAL_HASH);
    }

    function _createAndFundDeal() internal returns (uint256) {
        uint256 dealId = _createDeal();

        usdc.mint(depositor, AMOUNT);
        vm.startPrank(depositor);
        usdc.approve(address(escrow), AMOUNT);
        escrow.fundDeal(dealId);
        vm.stopPrank();

        return dealId;
    }
}
