// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IYieldAdapter.sol";

/// @notice Minimal interface for Aave V3 Pool
interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

contract AaveYieldAdapter is IYieldAdapter {
    using SafeERC20 for IERC20;

    event EscrowSet(address escrow);

    struct DepositRecord {
        uint256 principal;
        uint256 aTokenBalance;
        uint40 depositTimestamp;
        bool active;
    }

    IERC20 public immutable token;
    IERC20 public immutable aToken;
    IAavePool public immutable aavePool;
    address public immutable owner;
    address public escrow;
    mapping(uint256 => DepositRecord) public deposits;
    uint256 public totalDeposited;

    modifier onlyEscrow() {
        if (msg.sender != escrow) revert OnlyEscrow();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    constructor(address _token, address _aToken, address _aavePool) {
        if (_token == address(0)) revert InvalidToken();
        if (_aToken == address(0)) revert InvalidToken();
        if (_aavePool == address(0)) revert InvalidToken();

        token = IERC20(_token);
        aToken = IERC20(_aToken);
        aavePool = IAavePool(_aavePool);
        owner = msg.sender;
    }

    function setEscrow(address _escrow) external onlyOwner {
        if (escrow != address(0)) revert EscrowAlreadySet();
        if (_escrow == address(0)) revert InvalidEscrow();

        escrow = _escrow;

        emit EscrowSet(_escrow);
    }

    /// @inheritdoc IYieldAdapter
    function deposit(uint256 dealId, uint256 amount) external onlyEscrow {
        if (deposits[dealId].active) revert DealAlreadyDeposited();
        if (amount == 0) revert InvalidAmount();

        uint256 aTokenBefore = aToken.balanceOf(address(this));

        token.safeTransferFrom(escrow, address(this), amount);
        token.forceApprove(address(aavePool), amount);
        aavePool.supply(address(token), amount, address(this), 0);

        uint256 aTokenReceived = aToken.balanceOf(address(this)) - aTokenBefore;

        deposits[dealId] = DepositRecord({
            principal: amount,
            aTokenBalance: aTokenReceived,
            depositTimestamp: uint40(block.timestamp),
            active: true
        });
        totalDeposited += amount;

        emit Deposited(dealId, amount, aTokenReceived);
    }

    /// @inheritdoc IYieldAdapter
    function withdraw(uint256 dealId) external onlyEscrow returns (uint256 total) {
        DepositRecord storage record = deposits[dealId];
        if (!record.active) revert NoActiveDeposit();

        uint256 totalATokens = aToken.balanceOf(address(this));
        uint256 dealShare;

        if (totalDeposited == record.principal) {
            dealShare = totalATokens;
        } else {
            dealShare = (totalATokens * record.principal) / totalDeposited;
        }

        record.active = false;
        unchecked { totalDeposited -= record.principal; }

        aToken.forceApprove(address(aavePool), dealShare);
        total = aavePool.withdraw(address(token), dealShare, escrow);

        emit Withdrawn(dealId, record.principal, total);
    }

    /// @inheritdoc IYieldAdapter
    function getAccruedYield(uint256 dealId) external view returns (uint256) {
        DepositRecord storage record = deposits[dealId];
        if (!record.active || totalDeposited == 0) return 0;

        uint256 totalATokens = aToken.balanceOf(address(this));
        uint256 dealShare;

        if (totalDeposited == record.principal) {
            dealShare = totalATokens;
        } else {
            dealShare = (totalATokens * record.principal) / totalDeposited;
        }

        if (dealShare <= record.principal) return 0;
        return dealShare - record.principal;
    }

    /// @inheritdoc IYieldAdapter
    function getPrincipal(uint256 dealId) external view returns (uint256) {
        return deposits[dealId].principal;
    }
}
