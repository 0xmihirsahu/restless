// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IYieldAdapter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Mock yield adapter for testing — stores tokens directly, simulates yield
contract MockYieldAdapter is IYieldAdapter {
    IERC20 public token;
    mapping(uint256 => uint256) public principals;
    mapping(uint256 => bool) public active;
    uint256 public mockYield; // configurable yield amount for testing

    constructor(address _token) {
        token = IERC20(_token);
    }

    function setMockYield(uint256 _yield) external {
        mockYield = _yield;
    }

    function deposit(uint256 dealId, uint256 amount) external override {
        require(!active[dealId], "Already deposited");
        token.transferFrom(msg.sender, address(this), amount);
        principals[dealId] = amount;
        active[dealId] = true;
    }

    function withdraw(uint256 dealId) external override returns (uint256 total) {
        require(active[dealId], "No active deposit");
        total = principals[dealId] + mockYield;
        active[dealId] = false;
        token.transfer(msg.sender, total);
    }

    function getAccruedYield(uint256 dealId) external view override returns (uint256) {
        if (!active[dealId]) return 0;
        return mockYield;
    }

    function getPrincipal(uint256 dealId) external view override returns (uint256) {
        return principals[dealId];
    }
}
