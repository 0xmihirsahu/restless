/**
 * Check the current state of v4 hook integration on Base Sepolia
 */
import { network } from "hardhat";
import { parseAbi, formatUnits, getAddress } from "viem";

const { viem } = await network.connect();
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
const chainId = await publicClient.getChainId();
console.log(`Chain: ${chainId}`);

const SETTLEMENT = getAddress("0x2ED54fB830F51C5519AAfF5698dab4DAC71163b2");
const REAL_HOOK = getAddress("0xD2AB30E2911fA3ca0575661F726e0b28EC8c8040");
const MOCK_HOOK = getAddress("0x95a041F9922A781D49c5b900C817EFe446300B44");
const ESCROW = getAddress("0xDCe58c9739a9F629cdFf840F9DA15AC82495B933");
const USDC = getAddress("0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f");
const POOL_MANAGER = getAddress("0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408");

const settlementAbi = parseAbi([
  "function hook() view returns (address)",
  "function owner() view returns (address)",
  "function token() view returns (address)",
]);

console.log("\n=== Settlement Contract ===");
const hookAddr = await publicClient.readContract({ address: SETTLEMENT, abi: settlementAbi, functionName: "hook" });
console.log(`  hook(): ${hookAddr}`);
console.log(`  Is real hook: ${hookAddr.toLowerCase() === REAL_HOOK.toLowerCase()}`);
console.log(`  Is mock hook: ${hookAddr.toLowerCase() === MOCK_HOOK.toLowerCase()}`);
console.log(`  Is zero: ${hookAddr === "0x0000000000000000000000000000000000000000"}`);

const settlementOwner = await publicClient.readContract({ address: SETTLEMENT, abi: settlementAbi, functionName: "owner" });
console.log(`  owner(): ${settlementOwner}`);
console.log(`  We are owner: ${settlementOwner.toLowerCase() === deployer.account.address.toLowerCase()}`);

const settlementToken = await publicClient.readContract({ address: SETTLEMENT, abi: settlementAbi, functionName: "token" });
console.log(`  token(): ${settlementToken}`);

// Check real hook
console.log("\n=== Real V4 Hook ===");
const realHookCode = await publicClient.getCode({ address: REAL_HOOK });
console.log(`  Has code: ${realHookCode ? `YES (${realHookCode.length} chars)` : "NO"}`);

if (realHookCode && realHookCode.length > 2) {
  const hookAbi = parseAbi([
    "function poolManager() view returns (address)",
    "function inputToken() view returns (address)",
    "function settlement() view returns (address)",
    "function owner() view returns (address)",
  ]);
  try {
    const pm = await publicClient.readContract({ address: REAL_HOOK, abi: hookAbi, functionName: "poolManager" });
    console.log(`  poolManager: ${pm}`);
    console.log(`  Matches expected: ${pm.toLowerCase() === POOL_MANAGER.toLowerCase()}`);
  } catch (e: any) { console.log(`  poolManager: ERROR - ${e.shortMessage?.slice(0, 80)}`); }

  try {
    const it = await publicClient.readContract({ address: REAL_HOOK, abi: hookAbi, functionName: "inputToken" });
    console.log(`  inputToken: ${it}`);
  } catch (e: any) { console.log(`  inputToken: ERROR - ${e.shortMessage?.slice(0, 80)}`); }

  try {
    const st = await publicClient.readContract({ address: REAL_HOOK, abi: hookAbi, functionName: "settlement" });
    console.log(`  settlement: ${st}`);
    console.log(`  Matches our Settlement: ${st.toLowerCase() === SETTLEMENT.toLowerCase()}`);
  } catch (e: any) { console.log(`  settlement: ERROR - ${e.shortMessage?.slice(0, 80)}`); }

  try {
    const owner = await publicClient.readContract({ address: REAL_HOOK, abi: hookAbi, functionName: "owner" });
    console.log(`  owner: ${owner}`);
  } catch (e: any) { console.log(`  owner: ERROR - ${e.shortMessage?.slice(0, 80)}`); }
}

// Check mock hook
console.log("\n=== Mock Hook ===");
const mockHookCode = await publicClient.getCode({ address: MOCK_HOOK });
console.log(`  Has code: ${mockHookCode ? `YES (${mockHookCode.length} chars)` : "NO"}`);

if (mockHookCode && mockHookCode.length > 2) {
  const mockAbi = parseAbi([
    "function inputToken() view returns (address)",
    "function settlement() view returns (address)",
  ]);
  try {
    const it = await publicClient.readContract({ address: MOCK_HOOK, abi: mockAbi, functionName: "inputToken" });
    console.log(`  inputToken: ${it}`);
  } catch (e: any) { console.log(`  inputToken: ERROR - ${e.shortMessage?.slice(0, 80)}`); }

  try {
    const st = await publicClient.readContract({ address: MOCK_HOOK, abi: mockAbi, functionName: "settlement" });
    console.log(`  settlement: ${st}`);
    console.log(`  Matches our Settlement: ${st.toLowerCase() === SETTLEMENT.toLowerCase()}`);
  } catch (e: any) { console.log(`  settlement: ERROR - ${e.shortMessage?.slice(0, 80)}`); }
}

// Check PoolManager
console.log("\n=== Uniswap V4 PoolManager ===");
const pmCode = await publicClient.getCode({ address: POOL_MANAGER });
console.log(`  Has code: ${pmCode ? `YES (${pmCode.length} chars)` : "NO"}`);
