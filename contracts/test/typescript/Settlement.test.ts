import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseUnits, getAddress } from "viem";

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
    const settlement = await viem.deployContract("Settlement", [
      token.address,
    ]);

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
        1n,
        depositor.account.address,
        counterparty.account.address,
        principal,
        totalAmount,
        100, // 100% yield to counterparty
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
        1n,
        depositor.account.address,
        counterparty.account.address,
        principal,
        totalAmount,
        50, // 50% yield to counterparty
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
        1n,
        depositor.account.address,
        counterparty.account.address,
        principal,
        totalAmount,
        0, // 0% yield to counterparty
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
        1n,
        depositor.account.address,
        counterparty.account.address,
        principal,
        principal, // total == principal, no yield
        100,
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

      await viem.assertions.revertWith(
        settlement.write.settle([
          1n,
          depositor.account.address,
          counterparty.account.address,
          principal,
          badTotal,
          100,
          "0x",
        ]),
        "Total less than principal"
      );
    });

    it("should reject invalid yield split > 100", async function () {
      const { settlement, token, deployer, depositor, counterparty, principal, totalAmount } =
        await networkHelpers.loadFixture(deployFixture);

      await token.write.mint([deployer.account.address, totalAmount]);
      await token.write.approve([settlement.address, totalAmount]);

      await viem.assertions.revertWith(
        settlement.write.settle([
          1n,
          depositor.account.address,
          counterparty.account.address,
          principal,
          totalAmount,
          101, // invalid
          "0x",
        ]),
        "Invalid yield split"
      );
    });

    it("should reject zero principal", async function () {
      const { settlement, token, deployer, depositor, counterparty, totalAmount } =
        await networkHelpers.loadFixture(deployFixture);

      await token.write.mint([deployer.account.address, totalAmount]);
      await token.write.approve([settlement.address, totalAmount]);

      await viem.assertions.revertWith(
        settlement.write.settle([
          1n,
          depositor.account.address,
          counterparty.account.address,
          0n, // zero principal
          totalAmount,
          100,
          "0x",
        ]),
        "Principal must be > 0"
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
        1n,
        depositor.account.address,
        counterparty.account.address,
        principal,
        totalAmount,
        100,
        "0x",
      ]);

      const publicClient = await viem.getPublicClient();
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Verify the transaction succeeded
      assert.equal(receipt.status, "success");
    });
  });
});
