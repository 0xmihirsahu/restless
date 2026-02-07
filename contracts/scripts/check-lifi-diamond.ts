import { network } from "hardhat";
const { viem } = await network.connect();
const pc = await viem.getPublicClient();
const code = await pc.getCode({ address: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE" });
console.log("LI.FI Diamond on Base Sepolia:", code && code !== "0x" ? `EXISTS (${code.length} chars)` : "NOT DEPLOYED");
