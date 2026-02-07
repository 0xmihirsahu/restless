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

/// @title RestlessSettlementHook
/// @notice Uniswap v4 hook that swaps yield tokens to a recipient's preferred token
/// @dev Inherits BaseHook for v4 integration, implements IUnlockCallback for swap execution.
///      The hook only enables afterSwap for event tracking.
///      Swap execution follows the unlock → swap → settle/take pattern.
contract RestlessSettlementHook is BaseHook, IUnlockCallback, IRestlessSettlementHook {
    using SafeERC20 for IERC20;

    address public immutable inputToken; // USDC
    address public immutable settlementAddress;
    address public immutable owner;

    /// @notice PoolKey for each preferred output token
    mapping(address => PoolKey) public poolKeys;
    /// @notice Whether a pool has been configured for a given output token
    mapping(address => bool) public poolConfigured;

    struct SwapCallbackData {
        PoolKey key;
        bool zeroForOne;
        uint256 inputAmount;
        address recipient;
    }

    event YieldSwapped(
        address indexed recipient,
        address indexed outputToken,
        uint256 inputAmount,
        uint256 outputAmount
    );

    event PoolKeySet(address indexed preferredToken);

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

    // ─── v4 Hook Permissions ──────────────────────────────────────

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

    /// @dev afterSwap is a no-op — just returns selector for event tracking
    function _afterSwap(
        address,
        PoolKey calldata,
        SwapParams calldata,
        BalanceDelta,
        bytes calldata
    ) internal pure override returns (bytes4, int128) {
        return (BaseHook.afterSwap.selector, 0);
    }

    // ─── Pool Configuration ───────────────────────────────────────

    /// @notice Configure which v4 pool to use for a given output token
    function setPoolKey(
        address preferredToken,
        PoolKey calldata key
    ) external onlyOwner {
        poolKeys[preferredToken] = key;
        poolConfigured[preferredToken] = true;
        emit PoolKeySet(preferredToken);
    }

    // ─── IRestlessSettlementHook ──────────────────────────────────

    /// @inheritdoc IRestlessSettlementHook
    function settleWithSwap(
        address recipient,
        uint256 yieldAmount,
        address preferredToken
    ) external onlySettlement returns (uint256 amountOut) {
        require(yieldAmount > 0, "Amount must be > 0");
        require(poolConfigured[preferredToken], "Pool not configured");

        // Pull USDC from Settlement
        IERC20(inputToken).safeTransferFrom(
            msg.sender,
            address(this),
            yieldAmount
        );

        // Determine swap direction based on currency ordering in the pool
        PoolKey memory key = poolKeys[preferredToken];
        bool zeroForOne = Currency.unwrap(key.currency0) == inputToken;

        // Execute swap via PoolManager unlock pattern
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

    // ─── IUnlockCallback ─────────────────────────────────────────

    /// @dev Called by PoolManager during unlock. Executes the swap and settles balances.
    function unlockCallback(
        bytes calldata data
    ) external override returns (bytes memory) {
        require(msg.sender == address(poolManager), "Only pool manager");

        SwapCallbackData memory cbData = abi.decode(data, (SwapCallbackData));

        // Execute exactIn swap (negative amountSpecified = exactIn)
        SwapParams memory params = SwapParams({
            zeroForOne: cbData.zeroForOne,
            amountSpecified: -int256(cbData.inputAmount),
            sqrtPriceLimitX96: cbData.zeroForOne
                ? TickMath.MIN_SQRT_PRICE + 1
                : TickMath.MAX_SQRT_PRICE - 1
        });

        BalanceDelta delta = poolManager.swap(cbData.key, params, "");

        // Settle input: sync → transfer → settle
        Currency inputCurrency = cbData.zeroForOne
            ? cbData.key.currency0
            : cbData.key.currency1;
        int128 inputDelta = cbData.zeroForOne
            ? delta.amount0()
            : delta.amount1();
        uint256 amountToPay = uint256(uint128(-inputDelta));

        poolManager.sync(inputCurrency);
        IERC20(Currency.unwrap(inputCurrency)).transfer(
            address(poolManager),
            amountToPay
        );
        poolManager.settle();

        // Take output: send tokens directly to recipient
        Currency outputCurrency = cbData.zeroForOne
            ? cbData.key.currency1
            : cbData.key.currency0;
        int128 outputDelta = cbData.zeroForOne
            ? delta.amount1()
            : delta.amount0();
        uint256 amountOut = uint256(uint128(outputDelta));

        poolManager.take(outputCurrency, cbData.recipient, amountOut);

        return abi.encode(amountOut);
    }
}
