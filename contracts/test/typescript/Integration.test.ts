import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseUnits, getAddress, keccak256, toHex } from "viem";

const { viem, networkHelpers, provider } = await network.connect();

describe("Integration: Full Deal Lifecycle", function () {
  async function deployFullStackFixture() {
    const [deployer, depositor, counterparty] =
      await viem.getWalletClients();

    // Deploy USDC mock
    const usdc = await viem.deployContract("MockERC20", [
      "USD Coin",
      "USDC",
      6n,
    ]);

    // Deploy aUSDC mock
    const aUsdc = await viem.deployContract("MockERC20", [
      "Aave USDC",
      "aUSDC",
      6n,
    ]);

    // Deploy mock Aave pool
    const pool = await viem.deployContract("MockAavePool", [
      usdc.address,
      aUsdc.address,
    ]);

    // Deploy real Settlement (no LI.FI or hook for integration tests)
    const settlement = await viem.deployContract("Settlement", [
      usdc.address,
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
    ]);

    // Deploy real AaveYieldAdapter (without escrow — set later)
    const adapter = await viem.deployContract("AaveYieldAdapter", [
      usdc.address,
      aUsdc.address,
      pool.address,
    ]);

    // Deploy real RestlessEscrow
    const escrow = await viem.deployContract("RestlessEscrow", [
      usdc.address,
      adapter.address,
      settlement.address,
    ]);

    // Link adapter to escrow
    await adapter.write.setEscrow([escrow.address]);

    // Mint USDC to depositor
    const amount = parseUnits("5000", 6);
    await usdc.write.mint([depositor.account.address, amount]);

    // Approve escrow to spend depositor's USDC
    const usdcAsDepositor = await viem.getContractAt("MockERC20", usdc.address, {
      client: { wallet: depositor },
    });
    await usdcAsDepositor.write.approve([escrow.address, amount]);

    const dealHash = keccak256(toHex("integration-deal-v1"));

    return {
      usdc,
      aUsdc,
      pool,
      settlement,
      adapter,
      escrow,
      deployer,
      depositor,
      counterparty,
      amount,
      dealHash,
    };
  }

  it("should complete full lifecycle: create → fund → settle (no yield)", async function () {
    const { escrow, usdc, depositor, counterparty, amount, dealHash } =
      await networkHelpers.loadFixture(deployFullStackFixture);

    const escrowAsDepositor = await viem.getContractAt(
      "RestlessEscrow",
      escrow.address,
      { client: { wallet: depositor } }
    );

    // 1. Create deal (100% yield to counterparty)
    await escrowAsDepositor.write.createDeal([
      {
        counterparty: counterparty.account.address,
        amount: amount,
        yieldSplitCounterparty: 100,
        timeout: 86400n,
        dealHash: dealHash,
      },
    ]);

    // 2. Fund deal
    await escrowAsDepositor.write.fundDeal([1n]);

    // Verify depositor has 0 USDC
    const depositorBalAfterFund = await usdc.read.balanceOf([depositor.account.address]);
    assert.equal(depositorBalAfterFund, 0n);

    // 3. Settle deal (counterparty triggers)
    const escrowAsCounterparty = await viem.getContractAt(
      "RestlessEscrow",
      escrow.address,
      { client: { wallet: counterparty } }
    );
    await escrowAsCounterparty.write.settleDeal([1n, "0x"]);

    // 4. Verify final state
    const deal = await escrow.read.getDeal([1n]);
    assert.equal(deal.status, 2); // Settled

    // Counterparty gets all funds (principal + 100% of yield = principal when no yield)
    const counterpartyBal = await usdc.read.balanceOf([counterparty.account.address]);
    assert.equal(counterpartyBal, amount);

    // Depositor gets 0 (100% yield to counterparty, no yield accrued)
    const depositorBal = await usdc.read.balanceOf([depositor.account.address]);
    assert.equal(depositorBal, 0n);
  });

  it("should complete full lifecycle: create → fund → settle (with yield, 100% to counterparty)", async function () {
    const { escrow, usdc, aUsdc, pool, adapter, depositor, counterparty, amount, dealHash } =
      await networkHelpers.loadFixture(deployFullStackFixture);

    const escrowAsDepositor = await viem.getContractAt(
      "RestlessEscrow",
      escrow.address,
      { client: { wallet: depositor } }
    );

    // 1. Create + fund
    await escrowAsDepositor.write.createDeal([
      {
        counterparty: counterparty.account.address,
        amount: amount,
        yieldSplitCounterparty: 100,
        timeout: 86400n,
        dealHash: dealHash,
      },
    ]);
    await escrowAsDepositor.write.fundDeal([1n]);

    // 2. Simulate yield: mint extra aTokens to adapter + back USDC in pool
    const yieldAmount = parseUnits("50", 6); // $50 yield
    await aUsdc.write.mint([adapter.address, yieldAmount]);
    await usdc.write.mint([pool.address, yieldAmount]);

    // 3. Settle
    const escrowAsCounterparty = await viem.getContractAt(
      "RestlessEscrow",
      escrow.address,
      { client: { wallet: counterparty } }
    );
    await escrowAsCounterparty.write.settleDeal([1n, "0x"]);

    // 4. Verify: counterparty gets principal + all yield
    const counterpartyBal = await usdc.read.balanceOf([counterparty.account.address]);
    assert.equal(counterpartyBal, amount + yieldAmount);

    // Depositor gets nothing (100% yield to counterparty)
    const depositorBal = await usdc.read.balanceOf([depositor.account.address]);
    assert.equal(depositorBal, 0n);
  });

  it("should complete full lifecycle: create → fund → settle (with yield, 50/50 split)", async function () {
    const { escrow, usdc, aUsdc, pool, adapter, depositor, counterparty, amount, dealHash } =
      await networkHelpers.loadFixture(deployFullStackFixture);

    const escrowAsDepositor = await viem.getContractAt(
      "RestlessEscrow",
      escrow.address,
      { client: { wallet: depositor } }
    );

    // 1. Create deal with 50% yield split
    await escrowAsDepositor.write.createDeal([
      {
        counterparty: counterparty.account.address,
        amount: amount,
        yieldSplitCounterparty: 50,
        timeout: 86400n,
        dealHash: dealHash,
      },
    ]);
    await escrowAsDepositor.write.fundDeal([1n]);

    // 2. Simulate yield
    const yieldAmount = parseUnits("100", 6); // $100 yield
    await aUsdc.write.mint([adapter.address, yieldAmount]);
    await usdc.write.mint([pool.address, yieldAmount]);

    // 3. Settle
    await escrowAsDepositor.write.settleDeal([1n, "0x"]);

    // 4. Verify: counterparty gets principal + 50% yield
    const halfYield = yieldAmount / 2n;
    const counterpartyBal = await usdc.read.balanceOf([counterparty.account.address]);
    assert.equal(counterpartyBal, amount + halfYield);

    // Depositor gets 50% yield
    const depositorBal = await usdc.read.balanceOf([depositor.account.address]);
    assert.equal(depositorBal, halfYield);
  });

  it("should complete full lifecycle: create → fund → settleWithHook (yield swapped)", async function () {
    const { escrow, usdc, aUsdc, pool, settlement, adapter, deployer, depositor, counterparty, amount, dealHash } =
      await networkHelpers.loadFixture(deployFullStackFixture);

    // Deploy a WETH mock and the hook
    const weth = await viem.deployContract("MockERC20", ["Wrapped Ether", "WETH", 18n]);

    const hook = await viem.deployContract("MockRestlessSettlementHook", [
      usdc.address,
      settlement.address,
    ]);

    // Configure hook on settlement
    await settlement.write.setHook([hook.address]);

    // Set swap rate: 1 USDC (1e6) = 0.0005 WETH (5e14)
    await hook.write.setSwapRate([weth.address, 500000000000000n]);

    // Fund hook with WETH for payouts
    const hookWethFunding = parseUnits("10", 18);
    await weth.write.mint([hook.address, hookWethFunding]);

    const escrowAsDepositor = await viem.getContractAt(
      "RestlessEscrow",
      escrow.address,
      { client: { wallet: depositor } }
    );

    // 1. Create deal with 100% yield to counterparty
    await escrowAsDepositor.write.createDeal([
      {
        counterparty: counterparty.account.address,
        amount: amount,
        yieldSplitCounterparty: 100,
        timeout: 86400n,
        dealHash: dealHash,
      },
    ]);
    await escrowAsDepositor.write.fundDeal([1n]);

    // 2. Simulate yield
    const yieldAmount = parseUnits("50", 6); // $50 yield
    await aUsdc.write.mint([adapter.address, yieldAmount]);
    await usdc.write.mint([pool.address, yieldAmount]);

    // 3. Settle via hook — counterparty wants yield in WETH
    const escrowAsCounterparty = await viem.getContractAt(
      "RestlessEscrow",
      escrow.address,
      { client: { wallet: counterparty } }
    );
    await escrowAsCounterparty.write.settleDealWithHook([1n, weth.address]);

    // 4. Verify: deal is settled
    const deal = await escrow.read.getDeal([1n]);
    assert.equal(deal.status, 2); // Settled

    // Counterparty gets principal in USDC
    const counterpartyUsdc = await usdc.read.balanceOf([counterparty.account.address]);
    assert.equal(counterpartyUsdc, amount);

    // Counterparty gets yield in WETH (50 USDC * 0.0005 = 0.025 WETH)
    const counterpartyWeth = await weth.read.balanceOf([counterparty.account.address]);
    const expectedWeth = (yieldAmount * 500000000000000n) / 1000000n;
    assert.equal(counterpartyWeth, expectedWeth);
  });

  it("should complete full lifecycle: create → fund → dispute → timeout refund", async function () {
    const { escrow, usdc, aUsdc, pool, adapter, depositor, counterparty, amount, dealHash } =
      await networkHelpers.loadFixture(deployFullStackFixture);

    const escrowAsDepositor = await viem.getContractAt(
      "RestlessEscrow",
      escrow.address,
      { client: { wallet: depositor } }
    );

    // 1. Create + fund
    await escrowAsDepositor.write.createDeal([
      {
        counterparty: counterparty.account.address,
        amount: amount,
        yieldSplitCounterparty: 100,
        timeout: 86400n,
        dealHash: dealHash,
      },
    ]);
    await escrowAsDepositor.write.fundDeal([1n]);

    // 2. Simulate some yield
    const yieldAmount = parseUnits("25", 6);
    await aUsdc.write.mint([adapter.address, yieldAmount]);
    await usdc.write.mint([pool.address, yieldAmount]);

    // 3. Dispute
    await escrowAsDepositor.write.disputeDeal([1n]);

    // 4. Fast-forward past timeout
    const publicClient = await viem.getPublicClient();
    const block = await publicClient.getBlock();
    await provider.request({
      method: "evm_setNextBlockTimestamp",
      params: [Number(block.timestamp + 86401n)],
    });
    await networkHelpers.mine();

    // 5. Claim timeout — depositor gets everything (principal + all yield)
    await escrowAsDepositor.write.claimTimeout([1n]);

    const deal = await escrow.read.getDeal([1n]);
    assert.equal(deal.status, 4); // TimedOut

    const depositorBal = await usdc.read.balanceOf([depositor.account.address]);
    assert.equal(depositorBal, amount + yieldAmount);

    // Counterparty gets nothing
    const counterpartyBal = await usdc.read.balanceOf([counterparty.account.address]);
    assert.equal(counterpartyBal, 0n);
  });
});
