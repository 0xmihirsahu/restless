import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseUnits } from "viem";

const { viem, networkHelpers } = await network.connect();

describe("AaveYieldAdapter", function () {
  async function deployFixture() {
    const [deployer, escrowSigner] = await viem.getWalletClients();

    // Deploy mock tokens
    const usdc = await viem.deployContract("MockERC20", ["USD Coin", "USDC", 6n]);
    const aUsdc = await viem.deployContract("MockERC20", ["Aave USDC", "aUSDC", 6n]);

    // Deploy mock Aave pool
    const pool = await viem.deployContract("MockAavePool", [usdc.address, aUsdc.address]);

    // Deploy adapter with escrowSigner as the "escrow" (caller)
    const adapter = await viem.deployContract("AaveYieldAdapter", [
      usdc.address,
      aUsdc.address,
      pool.address,
      escrowSigner.account.address,
    ]);

    const amount = parseUnits("5000", 6); // 5000 USDC

    // Mint USDC to escrow signer (simulates escrow holding tokens)
    await usdc.write.mint([escrowSigner.account.address, amount]);

    // Approve adapter to pull USDC from escrow
    const usdcAsEscrow = await viem.getContractAt("MockERC20", usdc.address, {
      client: { wallet: escrowSigner },
    });
    await usdcAsEscrow.write.approve([adapter.address, amount]);

    // Get adapter instance as escrow signer
    const adapterAsEscrow = await viem.getContractAt(
      "AaveYieldAdapter",
      adapter.address,
      { client: { wallet: escrowSigner } }
    );

    return {
      usdc,
      aUsdc,
      pool,
      adapter,
      adapterAsEscrow,
      deployer,
      escrowSigner,
      amount,
    };
  }

  describe("deposit", function () {
    it("should deposit USDC into Aave and record the deal", async function () {
      const { adapter, adapterAsEscrow, usdc, aUsdc, amount } =
        await networkHelpers.loadFixture(deployFixture);

      await adapterAsEscrow.write.deposit([1n, amount]);

      // Principal should be recorded
      const principal = await adapter.read.getPrincipal([1n]);
      assert.equal(principal, amount);

      // aTokens should be held by the adapter
      const aBalance = await aUsdc.read.balanceOf([adapter.address]);
      assert.equal(aBalance, amount);

      // USDC should be in the pool (transferred from adapter -> pool via supply)
      const poolBalance = await usdc.read.balanceOf([
        await adapter.read.aavePool(),
      ]);
      assert.equal(poolBalance, amount);
    });

    it("should reject double deposit for same deal", async function () {
      const { adapterAsEscrow, usdc, escrowSigner, amount } =
        await networkHelpers.loadFixture(deployFixture);

      await adapterAsEscrow.write.deposit([1n, amount]);

      // Mint more and approve
      await usdc.write.mint([escrowSigner.account.address, amount]);
      const usdcAsEscrow = await viem.getContractAt("MockERC20", usdc.address, {
        client: { wallet: escrowSigner },
      });
      await usdcAsEscrow.write.approve([adapterAsEscrow.address, amount]);

      await viem.assertions.revertWith(
        adapterAsEscrow.write.deposit([1n, amount]),
        "Deal already deposited"
      );
    });

    it("should reject calls from non-escrow", async function () {
      const { adapter, amount } =
        await networkHelpers.loadFixture(deployFixture);

      // deployer is not the escrow
      await viem.assertions.revertWith(
        adapter.write.deposit([1n, amount]),
        "Only escrow"
      );
    });
  });

  describe("withdraw", function () {
    it("should withdraw principal when no yield", async function () {
      const { adapter, adapterAsEscrow, usdc, escrowSigner, amount } =
        await networkHelpers.loadFixture(deployFixture);

      await adapterAsEscrow.write.deposit([1n, amount]);

      // Withdraw — funds go back to escrow address
      await adapterAsEscrow.write.withdraw([1n]);

      // Escrow should have its USDC back
      const escrowBalance = await usdc.read.balanceOf([escrowSigner.account.address]);
      assert.equal(escrowBalance, amount);
    });

    it("should withdraw principal + yield when yield exists", async function () {
      const { adapter, adapterAsEscrow, usdc, aUsdc, pool, escrowSigner, amount } =
        await networkHelpers.loadFixture(deployFixture);

      await adapterAsEscrow.write.deposit([1n, amount]);

      // Simulate yield: mint extra aTokens to adapter + back with USDC in pool
      const yieldAmount = parseUnits("50", 6); // $50 yield
      await aUsdc.write.mint([adapter.address, yieldAmount]);
      await usdc.write.mint([pool.address, yieldAmount]); // pool needs USDC to pay out

      // Withdraw
      await adapterAsEscrow.write.withdraw([1n]);

      // Escrow should have principal + yield
      const escrowBalance = await usdc.read.balanceOf([escrowSigner.account.address]);
      assert.equal(escrowBalance, amount + yieldAmount);
    });

    it("should reject withdraw for non-existent deposit", async function () {
      const { adapterAsEscrow } =
        await networkHelpers.loadFixture(deployFixture);

      await viem.assertions.revertWith(
        adapterAsEscrow.write.withdraw([99n]),
        "No active deposit"
      );
    });
  });

  describe("getAccruedYield", function () {
    it("should return 0 when no yield accrued", async function () {
      const { adapter, adapterAsEscrow, amount } =
        await networkHelpers.loadFixture(deployFixture);

      await adapterAsEscrow.write.deposit([1n, amount]);

      const yield_ = await adapter.read.getAccruedYield([1n]);
      assert.equal(yield_, 0n);
    });

    it("should return correct yield after accrual", async function () {
      const { adapter, adapterAsEscrow, aUsdc, amount } =
        await networkHelpers.loadFixture(deployFixture);

      await adapterAsEscrow.write.deposit([1n, amount]);

      // Simulate yield
      const yieldAmount = parseUnits("25", 6);
      await aUsdc.write.mint([adapter.address, yieldAmount]);

      const yield_ = await adapter.read.getAccruedYield([1n]);
      assert.equal(yield_, yieldAmount);
    });
  });
});
