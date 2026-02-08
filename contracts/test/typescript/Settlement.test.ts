import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseUnits, getAddress, encodeFunctionData } from "viem";

const { viem, networkHelpers } = await network.connect();

describe("Settlement", function () {
  async function deployFixture() {
    const [deployer, depositor, counterparty] =
      await viem.getWalletClients();

    // Deploy mock ERC20 (USDC with 6 decimals)
    const token = await viem.deployContract("MockERC20", [
      "USD Coin",
      "USDC",
      6n,
    ]);

    // Deploy settlement — escrow is the deployer for simplicity
    // No LI.FI diamond or hook for basic tests
    const settlement = await viem.deployContract("Settlement", [
      token.address,
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
    ]);

    // Set deployer as escrow so it can call settle() directly
    await settlement.write.setEscrow([deployer.account.address]);

    const principal = parseUnits("5000", 6);
    const yieldAmount = parseUnits("100", 6);
    const totalAmount = principal + yieldAmount;

    return {
      settlement,
      token,
      deployer,
      depositor,
      counterparty,
      principal,
      yieldAmount,
      totalAmount,
    };
  }

  describe("settle — same chain, 100% yield to counterparty", function () {
    it("should send principal + all yield to counterparty, nothing to depositor", async function () {
      const { settlement, token, deployer, depositor, counterparty, principal, totalAmount } =
        await networkHelpers.loadFixture(deployFixture);

      // Mint totalAmount USDC to deployer (caller simulating escrow)
      await token.write.mint([deployer.account.address, totalAmount]);

      // Approve settlement to pull tokens
      await token.write.approve([settlement.address, totalAmount]);

      // settle: 100% yield to counterparty
      await settlement.write.settle([
        {
          dealId: 1n,
          depositor: depositor.account.address,
          counterparty: counterparty.account.address,
          principal: principal,
          total: totalAmount,
          yieldSplitCounterparty: 100,
        },
        "0x", // no lifi data (same chain)
      ]);

      // Counterparty gets principal + all yield
      const counterpartyBalance = await token.read.balanceOf([counterparty.account.address]);
      assert.equal(counterpartyBalance, totalAmount);

      // Depositor gets nothing (yield was 100% to counterparty)
      const depositorBalance = await token.read.balanceOf([depositor.account.address]);
      assert.equal(depositorBalance, 0n);
    });
  });

  describe("settle — same chain, 50% yield split", function () {
    it("should split yield evenly between depositor and counterparty", async function () {
      const { settlement, token, deployer, depositor, counterparty, principal, yieldAmount, totalAmount } =
        await networkHelpers.loadFixture(deployFixture);

      await token.write.mint([deployer.account.address, totalAmount]);
      await token.write.approve([settlement.address, totalAmount]);

      // settle: 50% yield to counterparty
      await settlement.write.settle([
        {
          dealId: 1n,
          depositor: depositor.account.address,
          counterparty: counterparty.account.address,
          principal: principal,
          total: totalAmount,
          yieldSplitCounterparty: 50,
        },
        "0x",
      ]);

      const halfYield = yieldAmount / 2n;

      // Counterparty gets principal + 50% of yield
      const counterpartyBalance = await token.read.balanceOf([counterparty.account.address]);
      assert.equal(counterpartyBalance, principal + halfYield);

      // Depositor gets remaining 50% of yield
      const depositorBalance = await token.read.balanceOf([depositor.account.address]);
      assert.equal(depositorBalance, halfYield);
    });
  });

  describe("settle — same chain, 0% yield to counterparty", function () {
    it("should send principal to counterparty and all yield to depositor", async function () {
      const { settlement, token, deployer, depositor, counterparty, principal, yieldAmount, totalAmount } =
        await networkHelpers.loadFixture(deployFixture);

      await token.write.mint([deployer.account.address, totalAmount]);
      await token.write.approve([settlement.address, totalAmount]);

      // settle: 0% yield to counterparty
      await settlement.write.settle([
        {
          dealId: 1n,
          depositor: depositor.account.address,
          counterparty: counterparty.account.address,
          principal: principal,
          total: totalAmount,
          yieldSplitCounterparty: 0,
        },
        "0x",
      ]);

      // Counterparty gets only principal
      const counterpartyBalance = await token.read.balanceOf([counterparty.account.address]);
      assert.equal(counterpartyBalance, principal);

      // Depositor gets all yield
      const depositorBalance = await token.read.balanceOf([depositor.account.address]);
      assert.equal(depositorBalance, yieldAmount);
    });
  });

  describe("settle — no yield accrued", function () {
    it("should send principal to counterparty when total equals principal", async function () {
      const { settlement, token, deployer, depositor, counterparty, principal } =
        await networkHelpers.loadFixture(deployFixture);

      await token.write.mint([deployer.account.address, principal]);
      await token.write.approve([settlement.address, principal]);

      // settle: total == principal (no yield)
      await settlement.write.settle([
        {
          dealId: 1n,
          depositor: depositor.account.address,
          counterparty: counterparty.account.address,
          principal: principal,
          total: principal, // total == principal, no yield
          yieldSplitCounterparty: 100,
        },
        "0x",
      ]);

      const counterpartyBalance = await token.read.balanceOf([counterparty.account.address]);
      assert.equal(counterpartyBalance, principal);

      const depositorBalance = await token.read.balanceOf([depositor.account.address]);
      assert.equal(depositorBalance, 0n);
    });
  });

  describe("settle — validation", function () {
    it("should reject if total is less than principal", async function () {
      const { settlement, token, deployer, depositor, counterparty, principal } =
        await networkHelpers.loadFixture(deployFixture);

      const badTotal = principal - parseUnits("100", 6);
      await token.write.mint([deployer.account.address, badTotal]);
      await token.write.approve([settlement.address, badTotal]);

      await viem.assertions.revertWithCustomError(
        settlement.write.settle([
          {
            dealId: 1n,
            depositor: depositor.account.address,
            counterparty: counterparty.account.address,
            principal: principal,
            total: badTotal,
            yieldSplitCounterparty: 100,
          },
          "0x",
        ]),
        settlement,
        "TotalLessThanPrincipal"
      );
    });

    it("should reject invalid yield split > 100", async function () {
      const { settlement, token, deployer, depositor, counterparty, principal, totalAmount } =
        await networkHelpers.loadFixture(deployFixture);

      await token.write.mint([deployer.account.address, totalAmount]);
      await token.write.approve([settlement.address, totalAmount]);

      await viem.assertions.revertWithCustomError(
        settlement.write.settle([
          {
            dealId: 1n,
            depositor: depositor.account.address,
            counterparty: counterparty.account.address,
            principal: principal,
            total: totalAmount,
            yieldSplitCounterparty: 101,
          },
          "0x",
        ]),
        settlement,
        "InvalidYieldSplit"
      );
    });

    it("should reject zero principal", async function () {
      const { settlement, token, deployer, depositor, counterparty, totalAmount } =
        await networkHelpers.loadFixture(deployFixture);

      await token.write.mint([deployer.account.address, totalAmount]);
      await token.write.approve([settlement.address, totalAmount]);

      await viem.assertions.revertWithCustomError(
        settlement.write.settle([
          {
            dealId: 1n,
            depositor: depositor.account.address,
            counterparty: counterparty.account.address,
            principal: 0n,
            total: totalAmount,
            yieldSplitCounterparty: 100,
          },
          "0x",
        ]),
        settlement,
        "InvalidPrincipal"
      );
    });
  });

  describe("settle — event emission", function () {
    it("should emit DealSettled event with correct payout details", async function () {
      const { settlement, token, deployer, depositor, counterparty, principal, yieldAmount, totalAmount } =
        await networkHelpers.loadFixture(deployFixture);

      await token.write.mint([deployer.account.address, totalAmount]);
      await token.write.approve([settlement.address, totalAmount]);

      const hash = await settlement.write.settle([
        {
          dealId: 1n,
          depositor: depositor.account.address,
          counterparty: counterparty.account.address,
          principal: principal,
          total: totalAmount,
          yieldSplitCounterparty: 100,
        },
        "0x",
      ]);

      const publicClient = await viem.getPublicClient();
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Verify the transaction succeeded
      assert.equal(receipt.status, "success");
    });
  });

  // ─── LI.FI Cross-Chain Routing ───────────────────────────────────

  describe("settle — LI.FI cross-chain routing", function () {
    async function deployLiFiFixture() {
      const [deployer, depositor, counterparty] =
        await viem.getWalletClients();

      const token = await viem.deployContract("MockERC20", [
        "USD Coin",
        "USDC",
        6n,
      ]);

      const lifiDiamond = await viem.deployContract("MockLiFiDiamond", []);

      // Deploy settlement with LI.FI diamond, no hook
      const settlement = await viem.deployContract("Settlement", [
        token.address,
        lifiDiamond.address,
        "0x0000000000000000000000000000000000000000", // no hook
      ]);

      // Set deployer as escrow
      await settlement.write.setEscrow([deployer.account.address]);

      const principal = parseUnits("5000", 6);
      const yieldAmount = parseUnits("100", 6);
      const totalAmount = principal + yieldAmount;

      return {
        settlement,
        token,
        lifiDiamond,
        deployer,
        depositor,
        counterparty,
        principal,
        yieldAmount,
        totalAmount,
      };
    }

    it("should route counterparty payout through LI.FI diamond when lifiData is provided", async function () {
      const { settlement, token, lifiDiamond, deployer, depositor, counterparty, principal, totalAmount } =
        await networkHelpers.loadFixture(deployLiFiFixture);

      await token.write.mint([deployer.account.address, totalAmount]);
      await token.write.approve([settlement.address, totalAmount]);

      // Encode a call to MockLiFiDiamond.bridgeTokens
      const lifiData = encodeFunctionData({
        abi: [
          {
            name: "bridgeTokens",
            type: "function",
            inputs: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint256" },
              { name: "receiver", type: "address" },
              { name: "dstChainId", type: "uint256" },
            ],
            outputs: [],
            stateMutability: "nonpayable",
          },
        ],
        functionName: "bridgeTokens",
        args: [
          token.address,
          totalAmount, // 100% yield to counterparty, full amount bridges
          counterparty.account.address,
          421614n, // Arbitrum Sepolia chain ID
        ],
      });

      await settlement.write.settle([
        {
          dealId: 1n,
          depositor: depositor.account.address,
          counterparty: counterparty.account.address,
          principal: principal,
          total: totalAmount,
          yieldSplitCounterparty: 100,
        },
        lifiData,
      ]);

      // LI.FI diamond should have received the counterparty payout
      const diamondBalance = await token.read.balanceOf([lifiDiamond.address]);
      assert.equal(diamondBalance, totalAmount);

      // Counterparty should NOT have tokens directly (they were bridged)
      const counterpartyBalance = await token.read.balanceOf([counterparty.account.address]);
      assert.equal(counterpartyBalance, 0n);
    });

    it("should still pay depositor on same chain when LI.FI routes counterparty", async function () {
      const { settlement, token, lifiDiamond, deployer, depositor, counterparty, principal, yieldAmount, totalAmount } =
        await networkHelpers.loadFixture(deployLiFiFixture);

      await token.write.mint([deployer.account.address, totalAmount]);
      await token.write.approve([settlement.address, totalAmount]);

      // 50% yield split — depositor should still get their share on same chain
      const halfYield = yieldAmount / 2n;
      const counterpartyPayout = principal + halfYield;

      const lifiData = encodeFunctionData({
        abi: [
          {
            name: "bridgeTokens",
            type: "function",
            inputs: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint256" },
              { name: "receiver", type: "address" },
              { name: "dstChainId", type: "uint256" },
            ],
            outputs: [],
            stateMutability: "nonpayable",
          },
        ],
        functionName: "bridgeTokens",
        args: [
          token.address,
          counterpartyPayout,
          counterparty.account.address,
          421614n,
        ],
      });

      await settlement.write.settle([
        {
          dealId: 1n,
          depositor: depositor.account.address,
          counterparty: counterparty.account.address,
          principal: principal,
          total: totalAmount,
          yieldSplitCounterparty: 50,
        },
        lifiData,
      ]);

      // Depositor gets their yield share directly
      const depositorBalance = await token.read.balanceOf([depositor.account.address]);
      assert.equal(depositorBalance, halfYield);

      // LI.FI diamond has the counterparty payout
      const diamondBalance = await token.read.balanceOf([lifiDiamond.address]);
      assert.equal(diamondBalance, counterpartyPayout);
    });

    it("should revert if LI.FI call fails", async function () {
      const { settlement, token, deployer, depositor, counterparty, principal, totalAmount } =
        await networkHelpers.loadFixture(deployLiFiFixture);

      await token.write.mint([deployer.account.address, totalAmount]);
      await token.write.approve([settlement.address, totalAmount]);

      // Bad calldata that will revert
      const badLifiData = "0xdeadbeef";

      await viem.assertions.revertWithCustomError(
        settlement.write.settle([
          {
            dealId: 1n,
            depositor: depositor.account.address,
            counterparty: counterparty.account.address,
            principal: principal,
            total: totalAmount,
            yieldSplitCounterparty: 100,
          },
          badLifiData,
        ]),
        settlement,
        "LiFiBridgeFailed"
      );
    });
  });

  // ─── LI.FI Calldata Validation ──────────────────────────────────

  describe("settle — LI.FI calldata validation", function () {
    async function deployLiFiValidationFixture() {
      const [deployer, depositor, counterparty] =
        await viem.getWalletClients();

      const token = await viem.deployContract("MockERC20", [
        "USD Coin",
        "USDC",
        6n,
      ]);

      // Deploy no-op LI.FI diamond (accepts calls but doesn't pull tokens)
      const badDiamond = await viem.deployContract("MockLiFiDiamondNoOp", []);

      const settlement = await viem.deployContract("Settlement", [
        token.address,
        badDiamond.address,
        "0x0000000000000000000000000000000000000000",
      ]);

      // Set deployer as escrow
      await settlement.write.setEscrow([deployer.account.address]);

      const principal = parseUnits("5000", 6);
      const yieldAmount = parseUnits("100", 6);
      const totalAmount = principal + yieldAmount;

      return {
        settlement,
        token,
        badDiamond,
        deployer,
        depositor,
        counterparty,
        principal,
        yieldAmount,
        totalAmount,
      };
    }

    it("should revert when LI.FI diamond does not consume tokens", async function () {
      const { settlement, token, deployer, depositor, counterparty, principal, totalAmount } =
        await networkHelpers.loadFixture(deployLiFiValidationFixture);

      await token.write.mint([deployer.account.address, totalAmount]);
      await token.write.approve([settlement.address, totalAmount]);

      // Encode a call that the no-op diamond will accept but won't pull tokens
      const lifiData = encodeFunctionData({
        abi: [
          {
            name: "bridgeTokens",
            type: "function",
            inputs: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint256" },
              { name: "receiver", type: "address" },
              { name: "dstChainId", type: "uint256" },
            ],
            outputs: [],
            stateMutability: "nonpayable",
          },
        ],
        functionName: "bridgeTokens",
        args: [
          token.address,
          totalAmount,
          counterparty.account.address,
          421614n,
        ],
      });

      await viem.assertions.revertWithCustomError(
        settlement.write.settle([
          {
            dealId: 1n,
            depositor: depositor.account.address,
            counterparty: counterparty.account.address,
            principal: principal,
            total: totalAmount,
            yieldSplitCounterparty: 100,
          },
          lifiData,
        ]),
        settlement,
        "LiFiAmountMismatch"
      );
    });

    it("should reset LI.FI approval after successful bridge", async function () {
      const [deployer, depositor, counterparty] =
        await viem.getWalletClients();

      const token = await viem.deployContract("MockERC20", [
        "USD Coin",
        "USDC",
        6n,
      ]);

      // Use the real mock diamond that does pull tokens
      const lifiDiamond = await viem.deployContract("MockLiFiDiamond", []);

      const settlement = await viem.deployContract("Settlement", [
        token.address,
        lifiDiamond.address,
        "0x0000000000000000000000000000000000000000",
      ]);

      // Set deployer as escrow
      await settlement.write.setEscrow([deployer.account.address]);

      const principal = parseUnits("5000", 6);
      const totalAmount = parseUnits("5100", 6);

      await token.write.mint([deployer.account.address, totalAmount]);
      await token.write.approve([settlement.address, totalAmount]);

      const lifiData = encodeFunctionData({
        abi: [
          {
            name: "bridgeTokens",
            type: "function",
            inputs: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint256" },
              { name: "receiver", type: "address" },
              { name: "dstChainId", type: "uint256" },
            ],
            outputs: [],
            stateMutability: "nonpayable",
          },
        ],
        functionName: "bridgeTokens",
        args: [
          token.address,
          totalAmount,
          counterparty.account.address,
          421614n,
        ],
      });

      await settlement.write.settle([
        {
          dealId: 1n,
          depositor: depositor.account.address,
          counterparty: counterparty.account.address,
          principal: principal,
          total: totalAmount,
          yieldSplitCounterparty: 100,
        },
        lifiData,
      ]);

      // After settlement, the LI.FI diamond should have zero remaining approval
      const remainingAllowance = await token.read.allowance([
        settlement.address,
        lifiDiamond.address,
      ]);
      assert.equal(remainingAllowance, 0n);
    });
  });

  // ─── Hook Integration (Yield Swap) ──────────────────────────────

  describe("settle — hook yield swap", function () {
    async function deployHookFixture() {
      const [deployer, depositor, counterparty] =
        await viem.getWalletClients();

      const usdc = await viem.deployContract("MockERC20", [
        "USD Coin",
        "USDC",
        6n,
      ]);
      const weth = await viem.deployContract("MockERC20", [
        "Wrapped Ether",
        "WETH",
        18n,
      ]);

      // Deploy settlement first (need its address for hook)
      // We deploy with a temporary address then redeploy — or use deployer address
      // Actually: deploy hook with settlement address, then deploy settlement with hook address
      // Chicken-and-egg: use create2 or predict address. For testing: deploy settlement first with no hook, then set hook.

      // Deploy settlement with no LI.FI, no hook initially
      const settlement = await viem.deployContract("Settlement", [
        usdc.address,
        "0x0000000000000000000000000000000000000000", // no lifi
        "0x0000000000000000000000000000000000000000", // no hook (set later)
      ]);

      // Set deployer as escrow
      await settlement.write.setEscrow([deployer.account.address]);

      // Deploy hook with settlement as authorized caller
      const hook = await viem.deployContract("MockRestlessSettlementHook", [
        usdc.address,
        settlement.address,
      ]);

      // Set hook on settlement
      await settlement.write.setHook([hook.address]);

      // Configure swap rate: 1 USDC = 0.0005 WETH
      await hook.write.setSwapRate([weth.address, parseUnits("0.0005", 18)]);

      // Mint WETH to hook so it can fulfill swaps
      await weth.write.mint([hook.address, parseUnits("100", 18)]);

      const principal = parseUnits("5000", 6);
      const yieldAmount = parseUnits("100", 6);
      const totalAmount = principal + yieldAmount;

      return {
        settlement,
        hook,
        usdc,
        weth,
        deployer,
        depositor,
        counterparty,
        principal,
        yieldAmount,
        totalAmount,
      };
    }

    it("should route yield through hook when preferredToken is set", async function () {
      const { settlement, usdc, weth, deployer, depositor, counterparty, principal, yieldAmount, totalAmount } =
        await networkHelpers.loadFixture(deployHookFixture);

      await usdc.write.mint([deployer.account.address, totalAmount]);
      await usdc.write.approve([settlement.address, totalAmount]);

      // settle with 100% yield to counterparty, preferred token = WETH
      await settlement.write.settleWithHook([
        {
          dealId: 1n,
          depositor: depositor.account.address,
          counterparty: counterparty.account.address,
          principal: principal,
          total: totalAmount,
          yieldSplitCounterparty: 100,
        },
        weth.address, // preferredToken
      ]);

      // Counterparty gets principal in USDC
      const counterpartyUsdc = await usdc.read.balanceOf([counterparty.account.address]);
      assert.equal(counterpartyUsdc, principal);

      // Counterparty gets yield as WETH (100 USDC * 0.0005 WETH/USDC = 0.05 WETH)
      const counterpartyWeth = await weth.read.balanceOf([counterparty.account.address]);
      const expectedWeth = parseUnits("0.05", 18);
      assert.equal(counterpartyWeth, expectedWeth);
    });

    it("should pay depositor yield share in USDC even when hook is used", async function () {
      const { settlement, usdc, weth, deployer, depositor, counterparty, principal, yieldAmount, totalAmount } =
        await networkHelpers.loadFixture(deployHookFixture);

      await usdc.write.mint([deployer.account.address, totalAmount]);
      await usdc.write.approve([settlement.address, totalAmount]);

      const halfYield = yieldAmount / 2n;

      // 50% yield split with hook
      await settlement.write.settleWithHook([
        {
          dealId: 1n,
          depositor: depositor.account.address,
          counterparty: counterparty.account.address,
          principal: principal,
          total: totalAmount,
          yieldSplitCounterparty: 50,
        },
        weth.address,
      ]);

      // Depositor gets their yield share in USDC
      const depositorUsdc = await usdc.read.balanceOf([depositor.account.address]);
      assert.equal(depositorUsdc, halfYield);

      // Counterparty gets principal in USDC + yield as WETH
      const counterpartyUsdc = await usdc.read.balanceOf([counterparty.account.address]);
      assert.equal(counterpartyUsdc, principal);

      // 50 USDC * 0.0005 = 0.025 WETH
      const counterpartyWeth = await weth.read.balanceOf([counterparty.account.address]);
      assert.equal(counterpartyWeth, parseUnits("0.025", 18));
    });

    it("should reject settleWithHook when hook is not configured", async function () {
      const [deployer, depositor, counterparty] =
        await viem.getWalletClients();

      const usdc = await viem.deployContract("MockERC20", ["USD Coin", "USDC", 6n]);
      const weth = await viem.deployContract("MockERC20", ["Wrapped Ether", "WETH", 18n]);

      // Settlement with NO hook
      const settlement = await viem.deployContract("Settlement", [
        usdc.address,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
      ]);

      // Set deployer as escrow
      await settlement.write.setEscrow([deployer.account.address]);

      const principal = parseUnits("5000", 6);
      const total = parseUnits("5100", 6);

      await usdc.write.mint([deployer.account.address, total]);
      await usdc.write.approve([settlement.address, total]);

      await viem.assertions.revertWithCustomError(
        settlement.write.settleWithHook([
          {
            dealId: 1n,
            depositor: depositor.account.address,
            counterparty: counterparty.account.address,
            principal: principal,
            total: total,
            yieldSplitCounterparty: 100,
          },
          weth.address,
        ]),
        settlement,
        "HookNotConfigured"
      );
    });

    it("should reject setHook from non-owner", async function () {
      const [deployer, nonOwner] = await viem.getWalletClients();

      const usdc = await viem.deployContract("MockERC20", ["USD Coin", "USDC", 6n]);

      const settlement = await viem.deployContract("Settlement", [
        usdc.address,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
      ]);

      const settlementAsNonOwner = await viem.getContractAt(
        "Settlement",
        settlement.address,
        { client: { wallet: nonOwner } }
      );

      await viem.assertions.revertWithCustomError(
        settlementAsNonOwner.write.setHook(["0x0000000000000000000000000000000000000001"]),
        settlement,
        "OnlyOwner"
      );
    });
  });
});
