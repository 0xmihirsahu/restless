import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseUnits } from "viem";

const { viem, networkHelpers } = await network.connect();

describe("RestlessSettlementHook", function () {
  async function deployFixture() {
    const [deployer, settlement, recipient] =
      await viem.getWalletClients();

    // Deploy mock tokens
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

    // Deploy the hook (settlement address is the authorized caller)
    const hook = await viem.deployContract("RestlessSettlementHook", [
      usdc.address,
      settlement.account.address,
    ]);

    // Set a swap rate: 1 USDC = 0.0005 WETH (simulating $2000/ETH)
    await hook.write.setSwapRate([weth.address, parseUnits("0.0005", 18)]);

    // Mint WETH to the hook so it can fulfill swaps
    await weth.write.mint([hook.address, parseUnits("100", 18)]);

    const yieldAmount = parseUnits("50", 6); // $50 yield

    // Mint USDC to settlement (caller)
    await usdc.write.mint([settlement.account.address, yieldAmount]);

    // Approve hook to pull USDC from settlement
    const usdcAsSettlement = await viem.getContractAt("MockERC20", usdc.address, {
      client: { wallet: settlement },
    });
    await usdcAsSettlement.write.approve([hook.address, yieldAmount]);

    // Get hook as settlement caller
    const hookAsSettlement = await viem.getContractAt(
      "RestlessSettlementHook",
      hook.address,
      { client: { wallet: settlement } }
    );

    return {
      hook,
      hookAsSettlement,
      usdc,
      weth,
      deployer,
      settlement,
      recipient,
      yieldAmount,
    };
  }

  describe("settleWithSwap", function () {
    it("should swap USDC yield to preferred token and send to recipient", async function () {
      const { hookAsSettlement, weth, recipient, yieldAmount } =
        await networkHelpers.loadFixture(deployFixture);

      await hookAsSettlement.write.settleWithSwap([
        recipient.account.address,
        yieldAmount,
        weth.address,
      ]);

      // Recipient should receive WETH (50 USDC * 0.0005 WETH/USDC = 0.025 WETH)
      const recipientWethBalance = await weth.read.balanceOf([recipient.account.address]);
      const expectedWeth = parseUnits("0.025", 18);
      assert.equal(recipientWethBalance, expectedWeth);
    });

    it("should transfer USDC from caller to hook", async function () {
      const { hookAsSettlement, usdc, hook, recipient, yieldAmount, weth } =
        await networkHelpers.loadFixture(deployFixture);

      await hookAsSettlement.write.settleWithSwap([
        recipient.account.address,
        yieldAmount,
        weth.address,
      ]);

      // Hook should hold the USDC (simulating it was swapped in a real pool)
      const hookUsdcBalance = await usdc.read.balanceOf([hook.address]);
      assert.equal(hookUsdcBalance, yieldAmount);
    });

    it("should reject calls from non-settlement", async function () {
      const { hook, weth, recipient, yieldAmount } =
        await networkHelpers.loadFixture(deployFixture);

      // deployer is not the settlement
      await viem.assertions.revertWith(
        hook.write.settleWithSwap([
          recipient.account.address,
          yieldAmount,
          weth.address,
        ]),
        "Only settlement"
      );
    });

    it("should reject swap for token without a configured rate", async function () {
      const { hookAsSettlement, recipient, yieldAmount } =
        await networkHelpers.loadFixture(deployFixture);

      // Random address as unknown token
      const unknownToken = "0x0000000000000000000000000000000000000001";

      await viem.assertions.revertWith(
        hookAsSettlement.write.settleWithSwap([
          recipient.account.address,
          yieldAmount,
          unknownToken,
        ]),
        "No swap rate configured"
      );
    });

    it("should reject zero yield amount", async function () {
      const { hookAsSettlement, weth, recipient } =
        await networkHelpers.loadFixture(deployFixture);

      await viem.assertions.revertWith(
        hookAsSettlement.write.settleWithSwap([
          recipient.account.address,
          0n,
          weth.address,
        ]),
        "Amount must be > 0"
      );
    });
  });

  describe("setSwapRate", function () {
    it("should allow owner to set swap rate", async function () {
      const { hook } =
        await networkHelpers.loadFixture(deployFixture);

      const newRate = parseUnits("0.001", 18);
      const tokenAddr = "0x0000000000000000000000000000000000000002";

      await hook.write.setSwapRate([tokenAddr, newRate]);

      const rate = await hook.read.swapRates([tokenAddr]);
      assert.equal(rate, newRate);
    });
  });
});
