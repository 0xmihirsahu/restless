// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IRestlessSettlementHook.sol";

contract RestlessSettlementHook is BaseHook, IUnlockCallback, IRestlessSettlementHook {
    using SafeERC20 for IERC20;

    struct SwapCallbackData {
        PoolKey key;
        bool zeroForOne;
        uint256 inputAmount;
        address recipient;
    }

    address public immutable inputToken;
    address public immutable settlementAddress;
    address public immutable owner;

    mapping(address => PoolKey) public poolKeys;
    mapping(address => bool) public poolConfigured;

    modifier onlySettlement() {
        require(msg.sender == settlementAddress, "Only settlement");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(
        IPoolManager _poolManager,
        address _inputToken,
        address _settlementAddress,
        address _owner
    ) BaseHook(_poolManager) {
        require(_inputToken != address(0), "Invalid input token");
        require(_settlementAddress != address(0), "Invalid settlement");
        require(_owner != address(0), "Invalid owner");

        inputToken = _inputToken;
        settlementAddress = _settlementAddress;
        owner = _owner;
    }

    function getHookPermissions()
        public
        pure
        override
        returns (Hooks.Permissions memory)
    {
        return
            Hooks.Permissions({
                beforeInitialize: false,
                afterInitialize: false,
                beforeAddLiquidity: false,
                afterAddLiquidity: false,
                beforeRemoveLiquidity: false,
                afterRemoveLiquidity: false,
                beforeSwap: false,
                afterSwap: true,
                beforeDonate: false,
                afterDonate: false,
                beforeSwapReturnDelta: false,
                afterSwapReturnDelta: false,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            });
    }

    function _afterSwap(
        address,
        PoolKey calldata,
        SwapParams calldata,
        BalanceDelta,
        bytes calldata
    ) internal pure override returns (bytes4, int128) {
        return (BaseHook.afterSwap.selector, 0);
    }

    function setPoolKey(
        address preferredToken,
        PoolKey calldata key
    ) external onlyOwner {
        poolKeys[preferredToken] = key;
        poolConfigured[preferredToken] = true;
        emit PoolKeySet(preferredToken);
    }

    /// @inheritdoc IRestlessSettlementHook
    function settleWithSwap(
        address recipient,
        uint256 yieldAmount,
        address preferredToken
    ) external onlySettlement returns (uint256 amountOut) {
        require(yieldAmount > 0, "Amount must be > 0");
        require(poolConfigured[preferredToken], "Pool not configured");

        IERC20(inputToken).safeTransferFrom(msg.sender, address(this), yieldAmount);

        PoolKey memory key = poolKeys[preferredToken];
        bool zeroForOne = Currency.unwrap(key.currency0) == inputToken;

        bytes memory result = poolManager.unlock(
            abi.encode(
                SwapCallbackData({
                    key: key,
                    zeroForOne: zeroForOne,
                    inputAmount: yieldAmount,
                    recipient: recipient
                })
            )
        );

        amountOut = abi.decode(result, (uint256));
        emit YieldSwapped(recipient, preferredToken, yieldAmount, amountOut);
    }

    function unlockCallback(
        bytes calldata data
    ) external override returns (bytes memory) {
        require(msg.sender == address(poolManager), "Only pool manager");

        SwapCallbackData memory cbData = abi.decode(data, (SwapCallbackData));
        BalanceDelta delta = _executeSwap(cbData);
        _settleInputDelta(cbData, delta);
        uint256 amountOut = _takeOutputDelta(cbData, delta);

        return abi.encode(amountOut);
    }

    function _executeSwap(SwapCallbackData memory cbData) internal returns (BalanceDelta) {
        SwapParams memory params = SwapParams({
            zeroForOne: cbData.zeroForOne,
            amountSpecified: -int256(cbData.inputAmount),
            sqrtPriceLimitX96: cbData.zeroForOne
                ? TickMath.MIN_SQRT_PRICE + 1
                : TickMath.MAX_SQRT_PRICE - 1
        });
        return poolManager.swap(cbData.key, params, "");
    }

    function _settleInputDelta(SwapCallbackData memory cbData, BalanceDelta delta) internal {
        Currency inputCurrency = cbData.zeroForOne ? cbData.key.currency0 : cbData.key.currency1;
        int128 inputDelta = cbData.zeroForOne ? delta.amount0() : delta.amount1();
        uint256 amountToPay = uint256(uint128(-inputDelta));

        poolManager.sync(inputCurrency);
        IERC20(Currency.unwrap(inputCurrency)).transfer(address(poolManager), amountToPay);
        poolManager.settle();
    }

    function _takeOutputDelta(
        SwapCallbackData memory cbData,
        BalanceDelta delta
    ) internal returns (uint256 amountOut) {
        Currency outputCurrency = cbData.zeroForOne ? cbData.key.currency1 : cbData.key.currency0;
        int128 outputDelta = cbData.zeroForOne ? delta.amount1() : delta.amount0();
        amountOut = uint256(uint128(outputDelta));

        poolManager.take(outputCurrency, cbData.recipient, amountOut);
    }
}
