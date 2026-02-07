/**
 * Set up the v4 hook on Settlement and verify its state.
 * Run after deploy-hook.ts if the script exited early due to RPC timing.
 */
import { network } from "hardhat";
import { parseAbi, getAddress } from "viem";

const { viem } = await network.connect();
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
const chainId = await publicClient.getChainId();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Config per chain
const configs: Record<number, { hook: string; settlement: string; usdc: string; poolManager: string }> = {
  84532: {
    hook: "0x1D397343a67023148De2CaCA15c4C378DDc3C040",
    settlement: "0x2ED54fB830F51C5519AAfF5698dab4DAC71163b2",
    usdc: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f",
    poolManager: "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408",
  },
  11155111: {
    hook: "0x3a562c291539Cc0031E899271987d3cb51980040",
    settlement: "0x913997E266B5732Db47eD856Fe75F99983C471A8",
    usdc: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
    poolManager: "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543",
  },
};

const config = configs[chainId];
if (!config) throw new Error(`Unsupported chain: ${chainId}`);

const HOOK = getAddress(config.hook);
const SETTLEMENT = getAddress(config.settlement);

console.log(`Chain: ${chainId}`);
console.log(`Hook: ${HOOK}`);
console.log(`Settlement: ${SETTLEMENT}`);
console.log(`Deployer: ${deployer.account.address}`);

// 1. Verify hook has code
console.log("\n--- Verifying hook ---");
const hookCode = await publicClient.getCode({ address: HOOK });
if (!hookCode || hookCode === "0x") {
  console.log("Hook has NO code! Check explorer and wait for indexing.");
  process.exit(1);
}
console.log(`  Hook has code: YES (${hookCode.length} chars)`);

// Check hook state
const hookAbi = parseAbi([
  "function poolManager() view returns (address)",
  "function inputToken() view returns (address)",
  "function settlementAddress() view returns (address)",
  "function owner() view returns (address)",
]);

try {
  const pm = await publicClient.readContract({ address: HOOK, abi: hookAbi, functionName: "poolManager" });
  console.log(`  poolManager: ${pm}`);
} catch { console.log("  poolManager: read failed"); }

try {
  const it = await publicClient.readContract({ address: HOOK, abi: hookAbi, functionName: "inputToken" });
  console.log(`  inputToken: ${it}`);
} catch { console.log("  inputToken: read failed"); }

try {
  const owner = await publicClient.readContract({ address: HOOK, abi: hookAbi, functionName: "owner" });
  console.log(`  owner: ${owner}`);
  console.log(`  We are owner: ${owner.toLowerCase() === deployer.account.address.toLowerCase()}`);
} catch { console.log("  owner: read failed"); }

// 2. Check current hook on Settlement
console.log("\n--- Settlement current hook ---");
const settlementAbi = parseAbi([
  "function hook() view returns (address)",
  "function owner() view returns (address)",
  "function setHook(address _hook)",
]);

const currentHook = await publicClient.readContract({ address: SETTLEMENT, abi: settlementAbi, functionName: "hook" });
console.log(`  Current hook: ${currentHook}`);

if (currentHook.toLowerCase() === HOOK.toLowerCase()) {
  console.log("  Already set to our hook!");
} else {
  console.log(`  Needs update. Setting hook to ${HOOK}...`);
  const setHookHash = await deployer.writeContract({
    address: SETTLEMENT,
    abi: settlementAbi,
    functionName: "setHook",
    args: [HOOK],
    chain: deployer.chain,
  });
  console.log(`  setHook tx: ${setHookHash}`);
  await publicClient.waitForTransactionReceipt({ hash: setHookHash });
  await sleep(5000);

  const newHook = await publicClient.readContract({ address: SETTLEMENT, abi: settlementAbi, functionName: "hook" });
  console.log(`  Updated hook: ${newHook}`);
}

console.log("\nDone!");
