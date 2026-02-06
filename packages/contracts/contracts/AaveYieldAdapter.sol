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

/// @title AaveYieldAdapter
/// @notice Deposits escrow USDC into Aave V3 to earn yield, tracks per-deal balances
contract AaveYieldAdapter is IYieldAdapter {
    using SafeERC20 for IERC20;

    struct DepositRecord {
        uint256 principal;
        uint256 aTokenBalance;
        uint256 depositTimestamp;
        bool active;
    }

    IERC20 public immutable token;
    IERC20 public immutable aToken;
    IAavePool public immutable aavePool;
    address public immutable escrow;

    mapping(uint256 => DepositRecord) public deposits;
    uint256 public totalDeposited;

    event Deposited(uint256 indexed dealId, uint256 amount, uint256 aTokenReceived);
    event Withdrawn(uint256 indexed dealId, uint256 principal, uint256 total);

    modifier onlyEscrow() {
        require(msg.sender == escrow, "Only escrow");
        _;
    }

    constructor(address _token, address _aToken, address _aavePool, address _escrow) {
        require(_token != address(0), "Invalid token");
        require(_aToken != address(0), "Invalid aToken");
        require(_aavePool != address(0), "Invalid pool");
        require(_escrow != address(0), "Invalid escrow");

        token = IERC20(_token);
        aToken = IERC20(_aToken);
        aavePool = IAavePool(_aavePool);
        escrow = _escrow;
    }

    /// @inheritdoc IYieldAdapter
    function deposit(uint256 dealId, uint256 amount) external onlyEscrow {
        require(!deposits[dealId].active, "Deal already deposited");
        require(amount > 0, "Amount must be > 0");

        uint256 aTokenBefore = aToken.balanceOf(address(this));

        token.safeTransferFrom(escrow, address(this), amount);
        token.approve(address(aavePool), amount);
        aavePool.supply(address(token), amount, address(this), 0);

        uint256 aTokenReceived = aToken.balanceOf(address(this)) - aTokenBefore;

        deposits[dealId] = DepositRecord({
            principal: amount,
            aTokenBalance: aTokenReceived,
            depositTimestamp: block.timestamp,
            active: true
        });
        totalDeposited += amount;

        emit Deposited(dealId, amount, aTokenReceived);
    }

    /// @inheritdoc IYieldAdapter
    function withdraw(uint256 dealId) external onlyEscrow returns (uint256 total) {
        DepositRecord storage record = deposits[dealId];
        require(record.active, "No active deposit");

        uint256 totalATokens = aToken.balanceOf(address(this));
        uint256 dealShare;

        if (totalDeposited == record.principal) {
            // Only deal in the adapter — withdraw everything
            dealShare = totalATokens;
        } else {
            // Multiple deals — proportional share
            dealShare = (totalATokens * record.principal) / totalDeposited;
        }

        record.active = false;
        totalDeposited -= record.principal;

        // Approve pool to pull aTokens and withdraw USDC
        aToken.approve(address(aavePool), dealShare);
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
