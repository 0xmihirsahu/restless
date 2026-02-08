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
        uint256 depositTimestamp;
        bool active;
    }

    IERC20 public immutable token;
    IERC20 public immutable aToken;
    IAavePool public immutable aavePool;
    address public owner;
    address public escrow;
    bool private escrowSet;

    mapping(uint256 => DepositRecord) public deposits;
    uint256 public totalDeposited;

    modifier onlyEscrow() {
        require(msg.sender == escrow, "Only escrow");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address _token, address _aToken, address _aavePool) {
        require(_token != address(0), "Invalid token");
        require(_aToken != address(0), "Invalid aToken");
        require(_aavePool != address(0), "Invalid pool");

        token = IERC20(_token);
        aToken = IERC20(_aToken);
        aavePool = IAavePool(_aavePool);
        owner = msg.sender;
    }

    function setEscrow(address _escrow) external onlyOwner {
        require(!escrowSet, "Escrow already set");
        require(_escrow != address(0), "Invalid escrow");

        escrow = _escrow;
        escrowSet = true;

        emit EscrowSet(_escrow);
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
            dealShare = totalATokens;
        } else {
            dealShare = (totalATokens * record.principal) / totalDeposited;
        }

        record.active = false;
        totalDeposited -= record.principal;

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
