import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseUnits, getAddress, keccak256, toHex } from "viem";

const { viem, networkHelpers, provider } = await network.connect();

describe("RestlessEscrow", function () {
  async function deployFixture() {
    const [deployer, depositor, counterparty, stranger] =
      await viem.getWalletClients();

    // Deploy mock ERC20 (USDC with 6 decimals)
    const token = await viem.deployContract("MockERC20", [
      "USD Coin",
      "USDC",
      6n,
    ]);

    // Deploy mock adapter and settlement
    const adapter = await viem.deployContract("MockYieldAdapter", [
      token.address,
    ]);
    const settlement = await viem.deployContract("MockSettlement");

    // Deploy escrow
    const escrow = await viem.deployContract("RestlessEscrow", [
      token.address,
      adapter.address,
      settlement.address,
    ]);

    // Mint USDC to depositor
    const amount = parseUnits("5000", 6);
    await token.write.mint([depositor.account.address, amount]);

    // Approve escrow to spend depositor's USDC
    const tokenAsDepositor = await viem.getContractAt("MockERC20", token.address, {
      client: { wallet: depositor },
    });
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
      amount,
      dealHash,
    };
  }

  describe("createDeal", function () {
    it("should create a deal with correct parameters", async function () {
      const { escrow, depositor, counterparty, amount, dealHash } =
        await networkHelpers.loadFixture(deployFixture);

      const escrowAsDepositor = await viem.getContractAt(
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
      assert.equal(deal.depositor, getAddress(depositor.account.address));
      assert.equal(deal.counterparty, getAddress(counterparty.account.address));
      assert.equal(deal.amount, amount);
      assert.equal(deal.yieldSplitCounterparty, 100);
      assert.equal(deal.status, 0); // Created
    });

    it("should reject zero amount", async function () {
      const { escrow, depositor, counterparty, dealHash } =
        await networkHelpers.loadFixture(deployFixture);

      const escrowAsDepositor = await viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: depositor } }
      );

      await viem.assertions.revertWith(
        escrowAsDepositor.write.createDeal([
          counterparty.account.address,
          0n,
          100,
          86400n,
          dealHash,
        ]),
        "Amount must be > 0"
      );
    });

    it("should reject self as counterparty", async function () {
      const { escrow, depositor, amount, dealHash } =
        await networkHelpers.loadFixture(deployFixture);

      const escrowAsDepositor = await viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: depositor } }
      );

      await viem.assertions.revertWith(
        escrowAsDepositor.write.createDeal([
          depositor.account.address,
          amount,
          100,
          86400n,
          dealHash,
        ]),
        "Cannot escrow with self"
      );
    });

    it("should reject invalid yield split > 100", async function () {
      const { escrow, depositor, counterparty, amount, dealHash } =
        await networkHelpers.loadFixture(deployFixture);

      const escrowAsDepositor = await viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: depositor } }
      );

      await viem.assertions.revertWith(
        escrowAsDepositor.write.createDeal([
          counterparty.account.address,
          amount,
          101,
          86400n,
          dealHash,
        ]),
        "Invalid yield split"
      );
    });
  });

  describe("fundDeal", function () {
    it("should fund a deal and transfer tokens to adapter", async function () {
      const { escrow, token, adapter, depositor, counterparty, amount, dealHash } =
        await networkHelpers.loadFixture(deployFixture);

      const escrowAsDepositor = await viem.getContractAt(
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
      assert.equal(deal.status, 1); // Funded

      // Tokens should be in the adapter now
      const adapterBalance = await token.read.balanceOf([adapter.address]);
      assert.equal(adapterBalance, amount);
    });

    it("should reject funding by non-depositor", async function () {
      const { escrow, depositor, counterparty, amount, dealHash } =
        await networkHelpers.loadFixture(deployFixture);

      const escrowAsDepositor = await viem.getContractAt(
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

      const escrowAsCounterparty = await viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: counterparty } }
      );

      await viem.assertions.revertWith(
        escrowAsCounterparty.write.fundDeal([1n]),
        "Only depositor can fund"
      );
    });
  });

  describe("disputeDeal", function () {
    it("should allow either party to dispute a funded deal", async function () {
      const { escrow, depositor, counterparty, amount, dealHash } =
        await networkHelpers.loadFixture(deployFixture);

      const escrowAsDepositor = await viem.getContractAt(
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

      const escrowAsCounterparty = await viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: counterparty } }
      );

      await escrowAsCounterparty.write.disputeDeal([1n]);

      const deal = await escrow.read.getDeal([1n]);
      assert.equal(deal.status, 3); // Disputed
    });

    it("should reject dispute from stranger", async function () {
      const { escrow, depositor, counterparty, stranger, amount, dealHash } =
        await networkHelpers.loadFixture(deployFixture);

      const escrowAsDepositor = await viem.getContractAt(
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

      const escrowAsStranger = await viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: stranger } }
      );

      await viem.assertions.revertWith(
        escrowAsStranger.write.disputeDeal([1n]),
        "Only deal parties can dispute"
      );
    });
  });

  describe("settleDeal", function () {
    it("should settle a funded deal and call settlement contract", async function () {
      const { escrow, token, adapter, settlement, depositor, counterparty, amount, dealHash } =
        await networkHelpers.loadFixture(deployFixture);

      const escrowAsDepositor = await viem.getContractAt(
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

      // Counterparty settles (work delivered)
      const escrowAsCounterparty = await viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: counterparty } }
      );

      await escrowAsCounterparty.write.settleDeal([1n, "0x"]);

      const deal = await escrow.read.getDeal([1n]);
      assert.equal(deal.status, 2); // Settled

      // MockSettlement should have recorded the call
      const callCount = await settlement.read.getSettleCallCount();
      assert.equal(callCount, 1n);
    });

    it("should allow depositor to settle", async function () {
      const { escrow, depositor, counterparty, amount, dealHash } =
        await networkHelpers.loadFixture(deployFixture);

      const escrowAsDepositor = await viem.getContractAt(
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
      await escrowAsDepositor.write.settleDeal([1n, "0x"]);

      const deal = await escrow.read.getDeal([1n]);
      assert.equal(deal.status, 2); // Settled
    });

    it("should reject settlement by stranger", async function () {
      const { escrow, depositor, counterparty, stranger, amount, dealHash } =
        await networkHelpers.loadFixture(deployFixture);

      const escrowAsDepositor = await viem.getContractAt(
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

      const escrowAsStranger = await viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: stranger } }
      );

      await viem.assertions.revertWith(
        escrowAsStranger.write.settleDeal([1n, "0x"]),
        "Only deal parties can settle"
      );
    });

    it("should reject settlement of non-funded deal", async function () {
      const { escrow, depositor, counterparty, amount, dealHash } =
        await networkHelpers.loadFixture(deployFixture);

      const escrowAsDepositor = await viem.getContractAt(
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

      await viem.assertions.revertWith(
        escrowAsDepositor.write.settleDeal([1n, "0x"]),
        "Deal not in Funded state"
      );
    });
  });

  describe("settleDealSigned", function () {
    // EIP-712 domain and types for signing
    function getEIP712Config(escrowAddress: string) {
      return {
        domain: {
          name: "RestlessEscrow",
          version: "1",
          chainId: 31337, // hardhat chain id
          verifyingContract: escrowAddress as `0x${string}`,
        },
        types: {
          SettleRequest: [
            { name: "dealId", type: "uint256" },
            { name: "dealHash", type: "bytes32" },
          ],
        },
      };
    }

    it("should settle with valid dual signatures from both parties", async function () {
      const { escrow, settlement, depositor, counterparty, stranger, amount, dealHash } =
        await networkHelpers.loadFixture(deployFixture);

      const escrowAsDepositor = await viem.getContractAt(
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

      // Both parties sign the settlement
      const { domain, types } = getEIP712Config(escrow.address);
      const message = { dealId: 1n, dealHash };

      const depositorSig = await depositor.signTypedData({
        domain,
        types,
        primaryType: "SettleRequest",
        message,
      });

      const counterpartySig = await counterparty.signTypedData({
        domain,
        types,
        primaryType: "SettleRequest",
        message,
      });

      // A stranger submits both signatures — should work
      const escrowAsStranger = await viem.getContractAt(
        "RestlessEscrow",
        escrow.address,
        { client: { wallet: stranger } }
      );

      await escrowAsStranger.write.settleDealSigned([
        1n,
        "0x",
        depositorSig,
        counterpartySig,
      ]);

      const deal = await escrow.read.getDeal([1n]);
      assert.equal(deal.status, 2); // Settled
    });

    it("should reject if depositor signature is invalid", async function () {
      const { escrow, depositor, counterparty, stranger, amount, dealHash } =
        await networkHelpers.loadFixture(deployFixture);

      const escrowAsDepositor = await viem.getContractAt(
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

      const { domain, types } = getEIP712Config(escrow.address);
      const message = { dealId: 1n, dealHash };

      // Stranger signs instead of depositor
      const fakeSig = await stranger.signTypedData({
        domain,
        types,
        primaryType: "SettleRequest",
        message,
      });

      const counterpartySig = await counterparty.signTypedData({
        domain,
        types,
        primaryType: "SettleRequest",
        message,
      });

      await viem.assertions.revertWith(
        escrow.write.settleDealSigned([
          1n,
          "0x",
          fakeSig,
          counterpartySig,
        ]),
        "Invalid depositor signature"
      );
    });

    it("should reject if counterparty signature is invalid", async function () {
      const { escrow, depositor, counterparty, stranger, amount, dealHash } =
        await networkHelpers.loadFixture(deployFixture);

      const escrowAsDepositor = await viem.getContractAt(
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

      const { domain, types } = getEIP712Config(escrow.address);
      const message = { dealId: 1n, dealHash };

      const depositorSig = await depositor.signTypedData({
        domain,
        types,
        primaryType: "SettleRequest",
        message,
      });

      // Stranger signs instead of counterparty
      const fakeSig = await stranger.signTypedData({
        domain,
        types,
        primaryType: "SettleRequest",
        message,
      });

      await viem.assertions.revertWith(
        escrow.write.settleDealSigned([
          1n,
          "0x",
          depositorSig,
          fakeSig,
        ]),
        "Invalid counterparty signature"
      );
    });

    it("should reject if deal hash in signature doesn't match", async function () {
      const { escrow, depositor, counterparty, amount, dealHash } =
        await networkHelpers.loadFixture(deployFixture);

      const escrowAsDepositor = await viem.getContractAt(
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

      const { domain, types } = getEIP712Config(escrow.address);
      // Sign with wrong dealHash
      const wrongHash = keccak256(toHex("wrong-terms"));
      const message = { dealId: 1n, dealHash: wrongHash };

      const depositorSig = await depositor.signTypedData({
        domain,
        types,
        primaryType: "SettleRequest",
        message,
      });

      const counterpartySig = await counterparty.signTypedData({
        domain,
        types,
        primaryType: "SettleRequest",
        message,
      });

      // Both signed, but with wrong dealHash — sigs won't match deal's stored hash
      await viem.assertions.revertWith(
        escrow.write.settleDealSigned([
          1n,
          "0x",
          depositorSig,
          counterpartySig,
        ]),
        "Invalid depositor signature"
      );
    });
  });

  describe("claimTimeout", function () {
    it("should refund depositor after timeout", async function () {
      const { escrow, token, depositor, counterparty, amount, dealHash } =
        await networkHelpers.loadFixture(deployFixture);

      const escrowAsDepositor = await viem.getContractAt(
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
      await escrowAsDepositor.write.disputeDeal([1n]);

      // Fast-forward past timeout
      const publicClient = await viem.getPublicClient();
      const block = await publicClient.getBlock();
      const futureTimestamp = block.timestamp + 86401n;
      await provider.request({ method: "evm_setNextBlockTimestamp", params: [Number(futureTimestamp)] });
      await networkHelpers.mine();

      // Claim timeout
      await escrowAsDepositor.write.claimTimeout([1n]);

      const deal = await escrow.read.getDeal([1n]);
      assert.equal(deal.status, 4); // TimedOut

      // Depositor should get funds back
      const balance = await token.read.balanceOf([depositor.account.address]);
      assert.equal(balance, amount);
    });

    it("should reject timeout before period expires", async function () {
      const { escrow, depositor, counterparty, amount, dealHash } =
        await networkHelpers.loadFixture(deployFixture);

      const escrowAsDepositor = await viem.getContractAt(
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

      await viem.assertions.revertWith(
        escrowAsDepositor.write.claimTimeout([1n]),
        "Timeout not elapsed"
      );
    });
  });
});
