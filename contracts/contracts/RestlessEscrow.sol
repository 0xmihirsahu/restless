// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
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
        if (msg.sender != owner) revert IRestlessEscrow.OnlyOwner(msg.sender);
        _;
    }

    constructor(address _token, address _yieldAdapter, address _settlement)
        EIP712("RestlessEscrow", "1")
    {
        if (_token == address(0)) revert IRestlessEscrow.InvalidAddress();
        if (_yieldAdapter == address(0)) revert IRestlessEscrow.InvalidAddress();
        if (_settlement == address(0)) revert IRestlessEscrow.InvalidAddress();

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
        if (params.counterparty == address(0)) revert IRestlessEscrow.InvalidCounterparty();
        if (params.counterparty == msg.sender) revert IRestlessEscrow.CannotEscrowWithSelf();
        if (params.amount == 0) revert IRestlessEscrow.InvalidAmount();
        if (params.yieldSplitCounterparty > 100) revert IRestlessEscrow.InvalidYieldSplit(params.yieldSplitCounterparty);
        if (params.timeout < MIN_TIMEOUT || params.timeout > MAX_TIMEOUT) revert IRestlessEscrow.InvalidTimeout(params.timeout, MIN_TIMEOUT, MAX_TIMEOUT);

        unchecked { dealCount++; }
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
        if (deal.depositor == address(0)) revert IRestlessEscrow.DealNotFound(dealId);
        if (deal.status != DealStatus.Created) revert IRestlessEscrow.InvalidDealStatus(dealId, deal.status);
        if (msg.sender != deal.depositor) revert IRestlessEscrow.Unauthorized(msg.sender, dealId);

        deal.status = DealStatus.Funded;
        deal.fundedAt = uint40(block.timestamp);

        uint256 balBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), deal.amount);
        if (token.balanceOf(address(this)) - balBefore != deal.amount) revert IRestlessEscrow.FeeOnTransferNotSupported();

        token.forceApprove(address(yieldAdapter), deal.amount);
        yieldAdapter.deposit(dealId, deal.amount);

        emit DealFunded(dealId, deal.amount);
    }

    /// @inheritdoc IRestlessEscrow
    function disputeDeal(uint256 dealId) external whenNotPaused {
        Deal storage deal = deals[dealId];
        if (deal.depositor == address(0)) revert IRestlessEscrow.DealNotFound(dealId);
        if (deal.status != DealStatus.Funded) revert IRestlessEscrow.InvalidDealStatus(dealId, deal.status);
        if (msg.sender != deal.depositor && msg.sender != deal.counterparty) revert IRestlessEscrow.Unauthorized(msg.sender, dealId);

        deal.status = DealStatus.Disputed;
        deal.disputedAt = uint40(block.timestamp);

        emit DealDisputed(dealId, msg.sender);
    }

    /// @inheritdoc IRestlessEscrow
    function cancelDeal(uint256 dealId) external whenNotPaused {
        Deal storage deal = deals[dealId];
        if (deal.depositor == address(0)) revert IRestlessEscrow.DealNotFound(dealId);
        if (deal.status != DealStatus.Created) revert IRestlessEscrow.InvalidDealStatus(dealId, deal.status);
        if (msg.sender != deal.depositor && msg.sender != deal.counterparty) revert IRestlessEscrow.Unauthorized(msg.sender, dealId);

        deal.status = DealStatus.Cancelled;

        emit DealCancelled(dealId, msg.sender);
    }

    /// @inheritdoc IRestlessEscrow
    function settleDeal(uint256 dealId, bytes calldata lifiData) external nonReentrant whenNotPaused {
        Deal storage deal = deals[dealId];
        if (deal.depositor == address(0)) revert IRestlessEscrow.DealNotFound(dealId);
        if (deal.status != DealStatus.Funded) revert IRestlessEscrow.InvalidDealStatus(dealId, deal.status);
        if (msg.sender != deal.depositor && msg.sender != deal.counterparty) revert IRestlessEscrow.Unauthorized(msg.sender, dealId);

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
        if (deal.depositor == address(0)) revert IRestlessEscrow.DealNotFound(dealId);
        if (deal.status != DealStatus.Funded) revert IRestlessEscrow.InvalidDealStatus(dealId, deal.status);

        bytes32 structHash = keccak256(
            abi.encode(SETTLE_TYPEHASH, dealId, deal.dealHash)
        );
        bytes32 digest = _hashTypedDataV4(structHash);

        if (!SignatureChecker.isValidSignatureNow(deal.depositor, digest, depositorSig))
            revert IRestlessEscrow.InvalidSignature(deal.depositor);
        if (!SignatureChecker.isValidSignatureNow(deal.counterparty, digest, counterpartySig))
            revert IRestlessEscrow.InvalidSignature(deal.counterparty);

        _executeSettlement(deal, dealId, lifiData);
    }

    /// @inheritdoc IRestlessEscrow
    function settleDealWithHook(uint256 dealId, address preferredToken) external nonReentrant whenNotPaused {
        Deal storage deal = deals[dealId];
        if (deal.depositor == address(0)) revert IRestlessEscrow.DealNotFound(dealId);
        if (deal.status != DealStatus.Funded) revert IRestlessEscrow.InvalidDealStatus(dealId, deal.status);
        if (msg.sender != deal.depositor && msg.sender != deal.counterparty) revert IRestlessEscrow.Unauthorized(msg.sender, dealId);

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
        if (deal.depositor == address(0)) revert IRestlessEscrow.DealNotFound(dealId);
        if (deal.status != DealStatus.Funded) revert IRestlessEscrow.InvalidDealStatus(dealId, deal.status);

        bytes32 structHash = keccak256(
            abi.encode(SETTLE_TYPEHASH, dealId, deal.dealHash)
        );
        bytes32 digest = _hashTypedDataV4(structHash);

        if (!SignatureChecker.isValidSignatureNow(deal.depositor, digest, depositorSig))
            revert IRestlessEscrow.InvalidSignature(deal.depositor);
        if (!SignatureChecker.isValidSignatureNow(deal.counterparty, digest, counterpartySig))
            revert IRestlessEscrow.InvalidSignature(deal.counterparty);

        _executeHookSettlement(deal, dealId, preferredToken);
    }

    /// @inheritdoc IRestlessEscrow
    function claimTimeout(uint256 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];
        if (deal.depositor == address(0)) revert IRestlessEscrow.DealNotFound(dealId);
        if (deal.status != DealStatus.Disputed) revert IRestlessEscrow.InvalidDealStatus(dealId, deal.status);
        if (msg.sender != deal.depositor) revert IRestlessEscrow.Unauthorized(msg.sender, dealId);
        if (block.timestamp < deal.disputedAt + deal.timeout) revert IRestlessEscrow.TimeoutNotElapsed(block.timestamp, deal.disputedAt + deal.timeout);

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

    /// @notice Compute the EIP-712 digest for signing a settlement
    /// @dev Useful for off-chain tooling to construct the exact hash to sign
    /// @param dealId The deal to compute the digest for
    /// @return The EIP-712 typed data hash
    function getSettleDigest(uint256 dealId) external view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(SETTLE_TYPEHASH, dealId, deals[dealId].dealHash)
        );
        return _hashTypedDataV4(structHash);
    }

    /// @notice Rescue tokens accidentally sent to this contract
    /// @param _token The token to rescue
    /// @param to The recipient
    /// @param amount The amount to rescue
    function rescueTokens(IERC20 _token, address to, uint256 amount) external onlyOwner {
        _token.safeTransfer(to, amount);
    }

    function _executeSettlement(Deal storage deal, uint256 dealId, bytes calldata lifiData) internal {
        deal.status = DealStatus.Settled;

        uint256 total = yieldAdapter.withdraw(dealId);
        uint256 principal = total < deal.amount ? total : deal.amount;

        token.forceApprove(address(settlement), total);
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

        token.forceApprove(address(settlement), total);
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
