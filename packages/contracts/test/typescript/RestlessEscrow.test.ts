import { expect } from "chai";
import hre from "hardhat";
import {
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { parseUnits, getAddress, keccak256, toHex } from "viem";

describe("RestlessEscrow", function () {
  async function deployFixture() {
    const [deployer, depositor, counterparty, stranger] =
      await hre.viem.getWalletClients();
    const publicClient = await hre.viem.getPublicClient();

    // Deploy mock ERC20 (USDC with 6 decimals)
    const token = await hre.viem.deployContract("MockERC20", [
      "USD Coin",
      "USDC",
      6n,
    ]);

    // Deploy mock adapter and settlement
    const adapter = await hre.viem.deployContract("MockYieldAdapter", [
      token.address,
    ]);
    const settlement = await hre.viem.deployContract("MockSettlement");

    // Deploy escrow
    const escrow = await hre.viem.deployContract("RestlessEscrow", [
      token.address,
      adapter.address,
      settlement.address,
    ]);

    // Mint USDC to depositor
    const amount = parseUnits("5000", 6);
    await token.write.mint([depositor.account.address, amount]);

    // Approve escrow to spend depositor's USDC
    const tokenAsDepositor = await hre.viem.getContractAt(
      "MockERC20",
      token.address,
      { client: { wallet: depositor } }
    );
    await tokenAsDepositor.write.approve([escrow.address, amount]);

    const dealHash = keccak256(toHex("deal-terms-v1"));

    return {
      escrow,
      token,
      adapter,
      settlement,
      deployer,
      depositor,
      counterparty,
      stranger,
      publicClient,
      amount,
      dealHash,
    };
  }

  describe("createDeal", function () {
    it("should create a deal with correct parameters", async function () {
      const { escrow, depositor, counterparty, amount, dealHash } =
        await loadFixture(deployFixture);

      const escrowAsDepositor = await hre.viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: depositor } }
      );

      await escrowAsDepositor.write.createDeal([
        counterparty.account.address,
        amount,
        100, // 100% yield to counterparty
        86400n, // 1 day timeout
        dealHash,
      ]);

      const deal = await escrow.read.getDeal([1n]);
      expect(deal.depositor).to.equal(
        getAddress(depositor.account.address)
      );
      expect(deal.counterparty).to.equal(
        getAddress(counterparty.account.address)
      );
      expect(deal.amount).to.equal(amount);
      expect(deal.yieldSplitCounterparty).to.equal(100);
      expect(deal.status).to.equal(0); // Created
    });

    it("should reject zero amount", async function () {
      const { escrow, depositor, counterparty, dealHash } =
        await loadFixture(deployFixture);

      const escrowAsDepositor = await hre.viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: depositor } }
      );

      await expect(
        escrowAsDepositor.write.createDeal([
          counterparty.account.address,
          0n,
          100,
          86400n,
          dealHash,
        ])
      ).to.be.rejectedWith("Amount must be > 0");
    });

    it("should reject self as counterparty", async function () {
      const { escrow, depositor, amount, dealHash } =
        await loadFixture(deployFixture);

      const escrowAsDepositor = await hre.viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: depositor } }
      );

      await expect(
        escrowAsDepositor.write.createDeal([
          depositor.account.address,
          amount,
          100,
          86400n,
          dealHash,
        ])
      ).to.be.rejectedWith("Cannot escrow with self");
    });

    it("should reject invalid yield split > 100", async function () {
      const { escrow, depositor, counterparty, amount, dealHash } =
        await loadFixture(deployFixture);

      const escrowAsDepositor = await hre.viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: depositor } }
      );

      await expect(
        escrowAsDepositor.write.createDeal([
          counterparty.account.address,
          amount,
          101, // > 100
          86400n,
          dealHash,
        ])
      ).to.be.rejectedWith("Invalid yield split");
    });
  });

  describe("fundDeal", function () {
    it("should fund a deal and transfer tokens to adapter", async function () {
      const { escrow, token, adapter, depositor, counterparty, amount, dealHash } =
        await loadFixture(deployFixture);

      const escrowAsDepositor = await hre.viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: depositor } }
      );

      await escrowAsDepositor.write.createDeal([
        counterparty.account.address,
        amount,
        100,
        86400n,
        dealHash,
      ]);

      await escrowAsDepositor.write.fundDeal([1n]);

      const deal = await escrow.read.getDeal([1n]);
      expect(deal.status).to.equal(1); // Funded

      // Tokens should be in the adapter now
      const adapterBalance = await token.read.balanceOf([adapter.address]);
      expect(adapterBalance).to.equal(amount);
    });

    it("should reject funding by non-depositor", async function () {
      const { escrow, depositor, counterparty, amount, dealHash } =
        await loadFixture(deployFixture);

      const escrowAsDepositor = await hre.viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: depositor } }
      );

      await escrowAsDepositor.write.createDeal([
        counterparty.account.address,
        amount,
        100,
        86400n,
        dealHash,
      ]);

      const escrowAsCounterparty = await hre.viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: counterparty } }
      );

      await expect(
        escrowAsCounterparty.write.fundDeal([1n])
      ).to.be.rejectedWith("Only depositor can fund");
    });
  });

  describe("disputeDeal", function () {
    it("should allow either party to dispute a funded deal", async function () {
      const { escrow, depositor, counterparty, amount, dealHash } =
        await loadFixture(deployFixture);

      const escrowAsDepositor = await hre.viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: depositor } }
      );

      await escrowAsDepositor.write.createDeal([
        counterparty.account.address,
        amount,
        100,
        86400n,
        dealHash,
      ]);
      await escrowAsDepositor.write.fundDeal([1n]);

      const escrowAsCounterparty = await hre.viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: counterparty } }
      );

      await escrowAsCounterparty.write.disputeDeal([1n]);

      const deal = await escrow.read.getDeal([1n]);
      expect(deal.status).to.equal(3); // Disputed
    });

    it("should reject dispute from stranger", async function () {
      const { escrow, depositor, counterparty, stranger, amount, dealHash } =
        await loadFixture(deployFixture);

      const escrowAsDepositor = await hre.viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: depositor } }
      );

      await escrowAsDepositor.write.createDeal([
        counterparty.account.address,
        amount,
        100,
        86400n,
        dealHash,
      ]);
      await escrowAsDepositor.write.fundDeal([1n]);

      const escrowAsStranger = await hre.viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: stranger } }
      );

      await expect(
        escrowAsStranger.write.disputeDeal([1n])
      ).to.be.rejectedWith("Only deal parties can dispute");
    });
  });

  describe("claimTimeout", function () {
    it("should refund depositor after timeout", async function () {
      const { escrow, token, depositor, counterparty, amount, dealHash, publicClient } =
        await loadFixture(deployFixture);

      const escrowAsDepositor = await hre.viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: depositor } }
      );

      await escrowAsDepositor.write.createDeal([
        counterparty.account.address,
        amount,
        100,
        86400n, // 1 day timeout
        dealHash,
      ]);
      await escrowAsDepositor.write.fundDeal([1n]);

      // Dispute
      await escrowAsDepositor.write.disputeDeal([1n]);

      // Fast-forward past timeout
      await hre.network.provider.send("evm_increaseTime", [86401]);
      await hre.network.provider.send("evm_mine");

      // Claim timeout
      await escrowAsDepositor.write.claimTimeout([1n]);

      const deal = await escrow.read.getDeal([1n]);
      expect(deal.status).to.equal(4); // TimedOut

      // Depositor should get funds back
      const balance = await token.read.balanceOf([depositor.account.address]);
      expect(balance).to.equal(amount); // principal returned (mock has 0 yield by default)
    });

    it("should reject timeout before period expires", async function () {
      const { escrow, depositor, counterparty, amount, dealHash } =
        await loadFixture(deployFixture);

      const escrowAsDepositor = await hre.viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: depositor } }
      );

      await escrowAsDepositor.write.createDeal([
        counterparty.account.address,
        amount,
        100,
        86400n,
        dealHash,
      ]);
      await escrowAsDepositor.write.fundDeal([1n]);
      await escrowAsDepositor.write.disputeDeal([1n]);

      await expect(
        escrowAsDepositor.write.claimTimeout([1n])
      ).to.be.rejectedWith("Timeout not elapsed");
    });
  });
});
