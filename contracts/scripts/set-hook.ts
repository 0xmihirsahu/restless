import { network } from "hardhat";
import { getAddress } from "viem";

const { viem } = await network.connect();

const settlementAddress = process.env.SETTLEMENT_ADDRESS!;
const hookAddress = process.env.HOOK_ADDRESS!;

const [deployer] = await viem.getWalletClients();
console.log("Deployer:", deployer.account.address);

const settlement = await viem.getContractAt(
  "Settlement",
  getAddress(settlementAddress),
  { client: { wallet: deployer } }
);

console.log("Setting hook to:", hookAddress);
const tx = await settlement.write.setHook([getAddress(hookAddress)]);
console.log("setHook tx:", tx);
console.log("Done!");
