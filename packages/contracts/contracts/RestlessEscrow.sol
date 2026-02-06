// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./interfaces/IYieldAdapter.sol";
import "./interfaces/ISettlement.sol";

/// @title RestlessEscrow
/// @notice P2P escrow where locked funds earn yield while waiting for deal completion
contract RestlessEscrow is ReentrancyGuard, Pausable, EIP712 {
    using SafeERC20 for IERC20;

    enum DealStatus {
        Created,
        Funded,
        Settled,
        Disputed,
        TimedOut
    }

    struct Deal {
        uint256 id;
        address depositor;
        address counterparty;
        uint256 amount;
        uint8 yieldSplitCounterparty;
        DealStatus status;
        uint256 timeout;
        bytes32 dealHash;
        uint256 createdAt;
        uint256 fundedAt;
        uint256 disputedAt;
    }

    IERC20 public immutable token;
    IYieldAdapter public immutable yieldAdapter;
    ISettlement public immutable settlement;

    uint256 public dealCount;
    mapping(uint256 => Deal) public deals;

    uint256 public constant MIN_TIMEOUT = 1 days;
    uint256 public constant MAX_TIMEOUT = 30 days;

    event DealCreated(uint256 indexed dealId, address indexed depositor, address indexed counterparty, uint256 amount, bytes32 dealHash);
    event DealFunded(uint256 indexed dealId, uint256 amount);
    event DealSettled(uint256 indexed dealId, uint256 totalPayout);
    event DealDisputed(uint256 indexed dealId, address disputedBy);
    event DealTimedOut(uint256 indexed dealId, uint256 refundAmount);

    bytes32 public constant SETTLE_TYPEHASH =
        keccak256("SettleRequest(uint256 dealId,bytes32 dealHash)");

    constructor(address _token, address _yieldAdapter, address _settlement)
        EIP712("RestlessEscrow", "1")
    {
        require(_token != address(0), "Invalid token");
        require(_yieldAdapter != address(0), "Invalid adapter");
        require(_settlement != address(0), "Invalid settlement");

        token = IERC20(_token);
        yieldAdapter = IYieldAdapter(_yieldAdapter);
        settlement = ISettlement(_settlement);
    }

    function createDeal(
        address counterparty,
        uint256 amount,
        uint8 yieldSplitCounterparty,
        uint256 timeout,
        bytes32 dealHash
    ) external whenNotPaused returns (uint256) {
        require(counterparty != address(0), "Invalid counterparty");
        require(counterparty != msg.sender, "Cannot escrow with self");
        require(amount > 0, "Amount must be > 0");
        require(yieldSplitCounterparty <= 100, "Invalid yield split");
        require(timeout >= MIN_TIMEOUT && timeout <= MAX_TIMEOUT, "Invalid timeout");

        dealCount++;
        deals[dealCount] = Deal({
            id: dealCount,
            depositor: msg.sender,
            counterparty: counterparty,
            amount: amount,
            yieldSplitCounterparty: yieldSplitCounterparty,
            status: DealStatus.Created,
            timeout: timeout,
            dealHash: dealHash,
            createdAt: block.timestamp,
            fundedAt: 0,
            disputedAt: 0
        });

        emit DealCreated(dealCount, msg.sender, counterparty, amount, dealHash);
        return dealCount;
    }

    function fundDeal(uint256 dealId) external nonReentrant whenNotPaused {
        Deal storage deal = deals[dealId];
        require(deal.id != 0, "Deal does not exist");
        require(deal.status == DealStatus.Created, "Deal not in Created state");
        require(msg.sender == deal.depositor, "Only depositor can fund");

        deal.status = DealStatus.Funded;
        deal.fundedAt = block.timestamp;

        token.safeTransferFrom(msg.sender, address(this), deal.amount);
        token.approve(address(yieldAdapter), deal.amount);
        yieldAdapter.deposit(dealId, deal.amount);

        emit DealFunded(dealId, deal.amount);
    }

    function disputeDeal(uint256 dealId) external whenNotPaused {
        Deal storage deal = deals[dealId];
        require(deal.id != 0, "Deal does not exist");
        require(deal.status == DealStatus.Funded, "Deal not in Funded state");
        require(
            msg.sender == deal.depositor || msg.sender == deal.counterparty,
            "Only deal parties can dispute"
        );

        deal.status = DealStatus.Disputed;
        deal.disputedAt = block.timestamp;

        emit DealDisputed(dealId, msg.sender);
    }

    function settleDeal(uint256 dealId, bytes calldata lifiData) external nonReentrant whenNotPaused {
        Deal storage deal = deals[dealId];
        require(deal.id != 0, "Deal does not exist");
        require(deal.status == DealStatus.Funded, "Deal not in Funded state");
        require(
            msg.sender == deal.depositor || msg.sender == deal.counterparty,
            "Only deal parties can settle"
        );

        _executeSettlement(deal, dealId, lifiData);
    }

    function settleDealSigned(
        uint256 dealId,
        bytes calldata lifiData,
        bytes calldata depositorSig,
        bytes calldata counterpartySig
    ) external nonReentrant whenNotPaused {
        Deal storage deal = deals[dealId];
        require(deal.id != 0, "Deal does not exist");
        require(deal.status == DealStatus.Funded, "Deal not in Funded state");

        // Build EIP-712 struct hash
        bytes32 structHash = keccak256(
            abi.encode(SETTLE_TYPEHASH, dealId, deal.dealHash)
        );
        bytes32 digest = _hashTypedDataV4(structHash);

        // Verify both signatures
        address recoveredDepositor = ECDSA.recover(digest, depositorSig);
        require(recoveredDepositor == deal.depositor, "Invalid depositor signature");

        address recoveredCounterparty = ECDSA.recover(digest, counterpartySig);
        require(recoveredCounterparty == deal.counterparty, "Invalid counterparty signature");

        _executeSettlement(deal, dealId, lifiData);
    }

    function _executeSettlement(Deal storage deal, uint256 dealId, bytes calldata lifiData) internal {
        deal.status = DealStatus.Settled;

        uint256 total = yieldAdapter.withdraw(dealId);

        token.approve(address(settlement), total);
        settlement.settle(
            dealId,
            deal.depositor,
            deal.counterparty,
            deal.amount,
            total,
            deal.yieldSplitCounterparty,
            lifiData
        );

        emit DealSettled(dealId, total);
    }

    function claimTimeout(uint256 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];
        require(deal.id != 0, "Deal does not exist");
        require(deal.status == DealStatus.Disputed, "Deal not in Disputed state");
        require(msg.sender == deal.depositor, "Only depositor can claim timeout");
        require(block.timestamp >= deal.disputedAt + deal.timeout, "Timeout not elapsed");

        deal.status = DealStatus.TimedOut;

        uint256 total = yieldAdapter.withdraw(dealId);
        token.safeTransfer(deal.depositor, total);

        emit DealTimedOut(dealId, total);
    }

    function getDeal(uint256 dealId) external view returns (Deal memory) {
        return deals[dealId];
    }

    function getAccruedYield(uint256 dealId) external view returns (uint256) {
        return yieldAdapter.getAccruedYield(dealId);
    }
}
