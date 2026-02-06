// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Mock LI.FI diamond that accepts any call but doesn't pull tokens
/// @dev Used to test that Settlement validates token consumption after LI.FI calls
contract MockLiFiDiamondNoOp {
    fallback() external {}
}
