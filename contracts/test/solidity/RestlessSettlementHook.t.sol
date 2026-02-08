// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {IRestlessSettlementHook} from "../../contracts/interfaces/IRestlessSettlementHook.sol";
import {RestlessSettlementHook} from "../../contracts/RestlessSettlementHook.sol";

contract RestlessSettlementHookTest is Test, Deployers {
    RestlessSettlementHook hook;
    PoolKey poolKey;

    address inputToken;
    address outputToken;
    address recipient = address(0xBEEF);

    function setUp() public {
        // Deploy PoolManager and all test routers
        deployFreshManagerAndRouters();

        // Deploy and mint 2 test currencies (sorted by address)
        deployMintAndApprove2Currencies();

        inputToken = Currency.unwrap(currency0);
        outputToken = Currency.unwrap(currency1);

        // Mine a CREATE2 address with AFTER_SWAP_FLAG permission bit
        uint160 flags = uint160(Hooks.AFTER_SWAP_FLAG);
        (address hookAddr, bytes32 salt) = HookMiner.find(
            address(this),
            flags,
            type(RestlessSettlementHook).creationCode,
            abi.encode(manager, inputToken, address(this), address(this))
        );

        // Deploy hook at the mined address (constructor validates address bits)
        hook = new RestlessSettlementHook{salt: salt}(
            manager,
            inputToken,
            address(this), // this test contract acts as Settlement
            address(this)  // this test contract is the owner
        );
        assertEq(address(hook), hookAddr);

        // Initialize pool with liquidity (this contract has approved routers)
        (poolKey,) = initPoolAndAddLiquidity(
            currency0,
            currency1,
            hook,
            3000,
            Constants.SQRT_PRICE_1_1
        );

        // Configure the hook to know which pool to use for the output token
        hook.setPoolKey(outputToken, poolKey);

        // Approve hook to pull inputToken from this contract (acting as settlement)
        MockERC20(inputToken).approve(address(hook), type(uint256).max);
    }

    function test_settleWithSwap_swapsAndSendsToRecipient() public {
        uint256 yieldAmount = 1e18;

        uint256 recipientOutputBefore = MockERC20(outputToken).balanceOf(recipient);

        uint256 amountOut = hook.settleWithSwap(recipient, yieldAmount, outputToken);

        assertGt(amountOut, 0, "amountOut should be > 0");
        assertEq(
            MockERC20(outputToken).balanceOf(recipient),
            recipientOutputBefore + amountOut,
            "recipient should receive output tokens"
        );
    }

    function test_settleWithSwap_consumesInputTokens() public {
        uint256 yieldAmount = 1e18;

        uint256 settlementBefore = MockERC20(inputToken).balanceOf(address(this));

        hook.settleWithSwap(recipient, yieldAmount, outputToken);

        uint256 settlementAfter = MockERC20(inputToken).balanceOf(address(this));
        assertEq(
            settlementBefore - settlementAfter,
            yieldAmount,
            "settlement should have paid yieldAmount"
        );
    }

    function test_settleWithSwap_emitsYieldSwapped() public {
        uint256 yieldAmount = 1e18;

        vm.expectEmit(true, true, false, false);
        emit IRestlessSettlementHook.YieldSwapped(recipient, outputToken, yieldAmount, 0);

        hook.settleWithSwap(recipient, yieldAmount, outputToken);
    }

    function test_settleWithSwap_revertsIfNotSettlement() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert("Only settlement");
        hook.settleWithSwap(recipient, 1e18, outputToken);
    }

    function test_settleWithSwap_revertsIfZeroAmount() public {
        vm.expectRevert("Amount must be > 0");
        hook.settleWithSwap(recipient, 0, outputToken);
    }

    function test_settleWithSwap_revertsIfPoolNotConfigured() public {
        address unknownToken = address(0x1234);
        vm.expectRevert("Pool not configured");
        hook.settleWithSwap(recipient, 1e18, unknownToken);
    }

    function test_setPoolKey_onlyOwner() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert("Only owner");
        hook.setPoolKey(address(0x999), poolKey);
    }

    function test_setPoolKey_emitsPoolKeySet() public {
        address token = address(0x999);

        vm.expectEmit(true, false, false, false);
        emit IRestlessSettlementHook.PoolKeySet(token);

        hook.setPoolKey(token, poolKey);

        assertTrue(hook.poolConfigured(token));
    }

    function test_hookPermissions_onlyAfterSwap() public view {
        Hooks.Permissions memory perms = hook.getHookPermissions();

        assertFalse(perms.beforeInitialize);
        assertFalse(perms.afterInitialize);
        assertFalse(perms.beforeAddLiquidity);
        assertFalse(perms.afterAddLiquidity);
        assertFalse(perms.beforeRemoveLiquidity);
        assertFalse(perms.afterRemoveLiquidity);
        assertFalse(perms.beforeSwap);
        assertTrue(perms.afterSwap);
        assertFalse(perms.beforeDonate);
        assertFalse(perms.afterDonate);
        assertFalse(perms.beforeSwapReturnDelta);
        assertFalse(perms.afterSwapReturnDelta);
        assertFalse(perms.afterAddLiquidityReturnDelta);
        assertFalse(perms.afterRemoveLiquidityReturnDelta);
    }

    function test_immutables() public view {
        assertEq(hook.inputToken(), inputToken);
        assertEq(hook.settlementAddress(), address(this));
        assertEq(hook.owner(), address(this));
        assertEq(address(hook.poolManager()), address(manager));
    }

    function test_unlockCallback_revertsIfNotPoolManager() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert("Only pool manager");
        hook.unlockCallback(new bytes(0));
    }
}
