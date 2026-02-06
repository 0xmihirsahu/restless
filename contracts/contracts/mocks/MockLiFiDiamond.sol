// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Mock LI.FI diamond for testing cross-chain settlement routing
/// @dev Simulates the LI.FI diamond contract's bridge function
contract MockLiFiDiamond {
    using SafeERC20 for IERC20;

    uint256 public lastAmount;
    address public lastReceiver;
    uint256 public lastDstChainId;
    address public lastToken;

    event BridgeStarted(
        address indexed token,
        uint256 amount,
        address indexed receiver,
        uint256 dstChainId
    );

    /// @notice Simulates a LI.FI bridge call — pulls tokens and records the call
    function bridgeTokens(
        address token,
        uint256 amount,
        address receiver,
        uint256 dstChainId
    ) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        lastToken = token;
        lastAmount = amount;
        lastReceiver = receiver;
        lastDstChainId = dstChainId;

        emit BridgeStarted(token, amount, receiver, dstChainId);
    }
}
