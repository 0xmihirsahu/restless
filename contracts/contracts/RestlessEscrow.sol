// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./interfaces/IRestlessEscrow.sol";
import "./interfaces/IYieldAdapter.sol";
import "./interfaces/ISettlement.sol";
import {DealStatus, CreateDealParams, Deal, SettleParams} from "./Types.sol";

contract RestlessEscrow is IRestlessEscrow, ReentrancyGuard, Pausable, EIP712 {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    IYieldAdapter public immutable yieldAdapter;
    ISettlement public immutable settlement;
    address public immutable owner;

    uint256 public dealCount;
    mapping(uint256 => Deal) public deals;

    uint32 public constant MIN_TIMEOUT = 1 days;
    uint32 public constant MAX_TIMEOUT = 30 days;
    bytes32 public constant SETTLE_TYPEHASH =
        keccak256("SettleRequest(uint256 dealId,bytes32 dealHash)");

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address _token, address _yieldAdapter, address _settlement)
        EIP712("RestlessEscrow", "1")
    {
        require(_token != address(0), "Invalid token");
        require(_yieldAdapter != address(0), "Invalid adapter");
        require(_settlement != address(0), "Invalid settlement");

        token = IERC20(_token);
        yieldAdapter = IYieldAdapter(_yieldAdapter);
        settlement = ISettlement(_settlement);
        owner = msg.sender;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @inheritdoc IRestlessEscrow
    function createDeal(
        CreateDealParams calldata params
    ) external whenNotPaused returns (uint256) {
        require(params.counterparty != address(0), "Invalid counterparty");
        require(params.counterparty != msg.sender, "Cannot escrow with self");
        require(params.amount > 0, "Amount must be > 0");
        require(params.yieldSplitCounterparty <= 100, "Invalid yield split");
        require(params.timeout >= MIN_TIMEOUT && params.timeout <= MAX_TIMEOUT, "Invalid timeout");

        dealCount++;
        deals[dealCount] = Deal({
            depositor: msg.sender,
            createdAt: uint40(block.timestamp),
            status: DealStatus.Created,
            yieldSplitCounterparty: params.yieldSplitCounterparty,
            timeout: params.timeout,
            counterparty: params.counterparty,
            fundedAt: 0,
            disputedAt: 0,
            amount: params.amount,
            dealHash: params.dealHash
        });

        emit DealCreated(dealCount, msg.sender, params.counterparty, params.amount, params.dealHash);
        return dealCount;
    }

    /// @inheritdoc IRestlessEscrow
    function fundDeal(uint256 dealId) external nonReentrant whenNotPaused {
        Deal storage deal = deals[dealId];
        require(deal.depositor != address(0), "Deal does not exist");
        require(deal.status == DealStatus.Created, "Deal not in Created state");
        require(msg.sender == deal.depositor, "Only depositor can fund");

        deal.status = DealStatus.Funded;
        deal.fundedAt = uint40(block.timestamp);

        token.safeTransferFrom(msg.sender, address(this), deal.amount);
        token.approve(address(yieldAdapter), deal.amount);
        yieldAdapter.deposit(dealId, deal.amount);

        emit DealFunded(dealId, deal.amount);
    }

    /// @inheritdoc IRestlessEscrow
    function disputeDeal(uint256 dealId) external whenNotPaused {
        Deal storage deal = deals[dealId];
        require(deal.depositor != address(0), "Deal does not exist");
        require(deal.status == DealStatus.Funded, "Deal not in Funded state");
        require(
            msg.sender == deal.depositor || msg.sender == deal.counterparty,
            "Only deal parties can dispute"
        );

        deal.status = DealStatus.Disputed;
        deal.disputedAt = uint40(block.timestamp);

        emit DealDisputed(dealId, msg.sender);
    }

    /// @inheritdoc IRestlessEscrow
    function cancelDeal(uint256 dealId) external whenNotPaused {
        Deal storage deal = deals[dealId];
        require(deal.depositor != address(0), "Deal does not exist");
        require(deal.status == DealStatus.Created, "Deal not in Created state");
        require(
            msg.sender == deal.depositor || msg.sender == deal.counterparty,
            "Only deal parties can cancel"
        );

        deal.status = DealStatus.Cancelled;

        emit DealCancelled(dealId, msg.sender);
    }

    /// @inheritdoc IRestlessEscrow
    function settleDeal(uint256 dealId, bytes calldata lifiData) external nonReentrant whenNotPaused {
        Deal storage deal = deals[dealId];
        require(deal.depositor != address(0), "Deal does not exist");
        require(deal.status == DealStatus.Funded, "Deal not in Funded state");
        require(
            msg.sender == deal.depositor || msg.sender == deal.counterparty,
            "Only deal parties can settle"
        );

        _executeSettlement(deal, dealId, lifiData);
    }

    /// @inheritdoc IRestlessEscrow
    function settleDealSigned(
        uint256 dealId,
        bytes calldata lifiData,
        bytes calldata depositorSig,
        bytes calldata counterpartySig
    ) external nonReentrant whenNotPaused {
        Deal storage deal = deals[dealId];
        require(deal.depositor != address(0), "Deal does not exist");
        require(deal.status == DealStatus.Funded, "Deal not in Funded state");

        bytes32 structHash = keccak256(
            abi.encode(SETTLE_TYPEHASH, dealId, deal.dealHash)
        );
        bytes32 digest = _hashTypedDataV4(structHash);

        address recoveredDepositor = ECDSA.recover(digest, depositorSig);
        require(recoveredDepositor == deal.depositor, "Invalid depositor signature");

        address recoveredCounterparty = ECDSA.recover(digest, counterpartySig);
        require(recoveredCounterparty == deal.counterparty, "Invalid counterparty signature");

        _executeSettlement(deal, dealId, lifiData);
    }

    /// @inheritdoc IRestlessEscrow
    function settleDealWithHook(uint256 dealId, address preferredToken) external nonReentrant whenNotPaused {
        Deal storage deal = deals[dealId];
        require(deal.depositor != address(0), "Deal does not exist");
        require(deal.status == DealStatus.Funded, "Deal not in Funded state");
        require(
            msg.sender == deal.depositor || msg.sender == deal.counterparty,
            "Only deal parties can settle"
        );

        _executeHookSettlement(deal, dealId, preferredToken);
    }

    /// @inheritdoc IRestlessEscrow
    function settleDealWithHookSigned(
        uint256 dealId,
        address preferredToken,
        bytes calldata depositorSig,
        bytes calldata counterpartySig
    ) external nonReentrant whenNotPaused {
        Deal storage deal = deals[dealId];
        require(deal.depositor != address(0), "Deal does not exist");
        require(deal.status == DealStatus.Funded, "Deal not in Funded state");

        bytes32 structHash = keccak256(
            abi.encode(SETTLE_TYPEHASH, dealId, deal.dealHash)
        );
        bytes32 digest = _hashTypedDataV4(structHash);

        address recoveredDepositor = ECDSA.recover(digest, depositorSig);
        require(recoveredDepositor == deal.depositor, "Invalid depositor signature");

        address recoveredCounterparty = ECDSA.recover(digest, counterpartySig);
        require(recoveredCounterparty == deal.counterparty, "Invalid counterparty signature");

        _executeHookSettlement(deal, dealId, preferredToken);
    }

    /// @inheritdoc IRestlessEscrow
    function claimTimeout(uint256 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];
        require(deal.depositor != address(0), "Deal does not exist");
        require(deal.status == DealStatus.Disputed, "Deal not in Disputed state");
        require(msg.sender == deal.depositor, "Only depositor can claim timeout");
        require(block.timestamp >= deal.disputedAt + deal.timeout, "Timeout not elapsed");

        deal.status = DealStatus.TimedOut;

        uint256 total = yieldAdapter.withdraw(dealId);
        token.safeTransfer(deal.depositor, total);

        emit DealTimedOut(dealId, total);
    }

    /// @inheritdoc IRestlessEscrow
    function getDeal(uint256 dealId) external view returns (Deal memory) {
        return deals[dealId];
    }

    /// @inheritdoc IRestlessEscrow
    function getAccruedYield(uint256 dealId) external view returns (uint256) {
        return yieldAdapter.getAccruedYield(dealId);
    }

    function _executeSettlement(Deal storage deal, uint256 dealId, bytes calldata lifiData) internal {
        deal.status = DealStatus.Settled;

        uint256 total = yieldAdapter.withdraw(dealId);
        uint256 principal = total < deal.amount ? total : deal.amount;

        token.approve(address(settlement), total);
        settlement.settle(
            SettleParams({
                dealId: dealId,
                depositor: deal.depositor,
                counterparty: deal.counterparty,
                principal: principal,
                total: total,
                yieldSplitCounterparty: deal.yieldSplitCounterparty
            }),
            lifiData
        );

        emit DealSettled(dealId, total);
    }

    function _executeHookSettlement(Deal storage deal, uint256 dealId, address preferredToken) internal {
        deal.status = DealStatus.Settled;

        uint256 total = yieldAdapter.withdraw(dealId);
        uint256 principal = total < deal.amount ? total : deal.amount;

        token.approve(address(settlement), total);
        settlement.settleWithHook(
            SettleParams({
                dealId: dealId,
                depositor: deal.depositor,
                counterparty: deal.counterparty,
                principal: principal,
                total: total,
                yieldSplitCounterparty: deal.yieldSplitCounterparty
            }),
            preferredToken
        );

        emit DealSettled(dealId, total);
    }
}
