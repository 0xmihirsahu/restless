/**
 * Decode the settle transaction to prove the v4 swap actually happened.
 */
import { network } from "hardhat";
import { decodeEventLog, parseAbi } from "viem";

const { viem } = await network.connect();
const pc = await viem.getPublicClient();

// The settle tx from the demo
const receipt = await pc.getTransactionReceipt({
  hash: "0xd7a4113a9cefdcf6509c0fcc091cfce95cb5aaa9745e4b7cb09f926042136f52",
});

const known: Record<string, string> = {
  "0xdce58c9739a9f629cdff840f9da15ac82495b933": "ESCROW",
  "0xf2b99e27196809afd35a5c1e1f0747a0540e51b6": "ADAPTER",
  "0x2ed54fb830f51c5519aaff5698dab4dac71163b2": "SETTLEMENT",
  "0x1d397343a67023148de2caca15c4c378ddc3c040": "HOOK",
  "0x05e73354cfdd6745c338b50bcfdfaa6fa03408": "POOL_MANAGER",
  "0xba50cd2a20f6da35d788639e581bca8d0b5d4d5f": "USDC",
  "0x4200000000000000000000000000000000000006": "WETH",
  "0x10f1a9d11cdf50041f3f8cb7191cbe2f31750acc": "aUSDC",
  "0x8bab6d1b75f19e9ed9fce8b9bd338844ff79ae27": "AAVE_POOL",
};

// Known event signatures
const eventSigs: Record<string, string> = {
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": "Transfer(from, to, amount)",
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": "Approval(owner, spender, amount)",
  "0x3be3541fc42237d611b30329040571c21d3af20931fca69cf50a44494e131049": "Swap(id, sender, amount0, amount1, ...)",
  "0x40e7c1e00e8354300c7940fe07a04e37ad678e00": "YieldSwapped",
};

console.log(`Settle tx: ${receipt.transactionHash}`);
console.log(`Status: ${receipt.status}`);
console.log(`Gas used: ${receipt.gasUsed}`);
console.log(`Logs: ${receipt.logs.length}\n`);

for (let i = 0; i < receipt.logs.length; i++) {
  const log = receipt.logs[i];
  const label = known[log.address.toLowerCase()] ?? log.address.slice(0, 14) + "...";
  const eventName = log.topics[0] ? (eventSigs[log.topics[0]] ?? log.topics[0].slice(0, 14) + "...") : "no-topic";

  console.log(`[${i}] ${label} → ${eventName}`);

  // Decode Transfer events
  if (log.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef") {
    const from = "0x" + (log.topics[1]?.slice(26) ?? "?");
    const to = "0x" + (log.topics[2]?.slice(26) ?? "?");
    const fromLabel = known[from.toLowerCase()] ?? from.slice(0, 10) + "...";
    const toLabel = known[to.toLowerCase()] ?? to.slice(0, 10) + "...";
    const amount = BigInt(log.data);
    const tokenLabel = known[log.address.toLowerCase()] ?? log.address.slice(0, 10);
    const decimals = log.address.toLowerCase() === "0x4200000000000000000000000000000000000006" ? 18 : 6;
    const formatted = decimals === 18
      ? `${Number(amount) / 1e18}`
      : `${Number(amount) / 1e6}`;
    console.log(`     ${fromLabel} → ${toLabel}: ${formatted} ${tokenLabel}`);
  }

  // Decode Swap events (v4 PoolManager)
  if (log.topics[0] === "0x3be3541fc42237d611b30329040571c21d3af20931fca69cf50a44494e131049") {
    console.log(`     *** UNISWAP V4 SWAP EVENT ***`);
    console.log(`     Pool ID: ${log.topics[1]}`);
    console.log(`     Data: ${log.data.slice(0, 130)}...`);
  }

  console.log();
}
