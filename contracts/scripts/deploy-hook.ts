/**
 * Deploy RestlessSettlementHook via CREATE2 with mined address bits.
 *
 * Uniswap v4 hooks encode permissions in the lowest 14 bits of the contract address.
 * Our hook only needs AFTER_SWAP (bit 6 = 0x40). This script:
 * 1. Mines a CREATE2 salt that produces an address with bit 6 set
 * 2. Deploys via the deterministic CREATE2 deployer (0x4e59b44847b379578588920cA78FbF26c0B4956C)
 * 3. Calls settlement.setHook(hookAddress)
 *
 * Usage:
 *   SETTLEMENT_ADDRESS=0x... npx hardhat run scripts/deploy-hook.ts --network sepolia
 */

import { network } from "hardhat";
import {
  getAddress,
  encodePacked,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
  concat,
  toHex,
  pad,
} from "viem";

const { viem } = await network.connect();

const AFTER_SWAP_FLAG = 1n << 6n;
const HOOK_MASK = (1n << 14n) - 1n;

// Deterministic CREATE2 deployer (available on all EVM chains)
const CREATE2_DEPLOYER = "0x4e59b44847b379578588920cA78FbF26c0B4956C";

async function main() {
  const settlementAddress = process.env.SETTLEMENT_ADDRESS;
  const poolManagerAddress = process.env.POOL_MANAGER_ADDRESS;
  const usdcAddress = process.env.USDC_ADDRESS;

  if (!settlementAddress || !poolManagerAddress || !usdcAddress) {
    console.error(
      "Required env vars: SETTLEMENT_ADDRESS, POOL_MANAGER_ADDRESS, USDC_ADDRESS"
    );
    process.exit(1);
  }

  const [deployer] = await viem.getWalletClients();
  console.log("Deployer:", deployer.account.address);

  // Get the hook's creation code
  const artifact = await import(
    "../forge-out/RestlessSettlementHook.sol/RestlessSettlementHook.json",
    { with: { type: "json" } }
  );
  const bytecode = artifact.default.bytecode.object as `0x${string}`;

  // Encode constructor args: (IPoolManager, address, address)
  const constructorArgs = encodeAbiParameters(
    parseAbiParameters("address, address, address"),
    [
      getAddress(poolManagerAddress),
      getAddress(usdcAddress),
      getAddress(settlementAddress),
    ]
  );

  const initCode = concat([bytecode, constructorArgs]);
  const initCodeHash = keccak256(initCode);

  console.log("Mining CREATE2 salt for AFTER_SWAP_FLAG (0x40)...");

  // Brute-force salt to find address with correct permission bits
  let salt: `0x${string}` | null = null;
  let hookAddress: `0x${string}` | null = null;

  for (let i = 0n; i < 1_000_000n; i++) {
    const candidateSalt = pad(toHex(i), { size: 32 });
    const addr = getAddress(
      `0x${keccak256(
        concat([
          "0xff",
          CREATE2_DEPLOYER as `0x${string}`,
          candidateSalt,
          initCodeHash,
        ])
      ).slice(26)}`
    );

    const addrBigInt = BigInt(addr);
    if ((addrBigInt & HOOK_MASK) === AFTER_SWAP_FLAG) {
      salt = candidateSalt;
      hookAddress = addr;
      console.log(`Found salt ${i} -> hook address: ${addr}`);
      break;
    }
  }

  if (!salt || !hookAddress) {
    console.error("Failed to find valid salt in 1M iterations");
    process.exit(1);
  }

  // Deploy via CREATE2
  console.log("Deploying hook via CREATE2...");
  const publicClient = await viem.getPublicClient();

  const txHash = await deployer.sendTransaction({
    to: CREATE2_DEPLOYER,
    data: concat([salt, initCode]),
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });
  console.log("Deploy tx:", txHash, "status:", receipt.status);

  // Verify deployed address
  const code = await publicClient.getCode({ address: hookAddress });
  if (!code || code === "0x") {
    console.error("Hook not deployed at expected address!");
    process.exit(1);
  }
  console.log("Hook deployed at:", hookAddress);

  // Set hook on settlement
  console.log("Setting hook on settlement...");
  const settlement = await viem.getContractAt("Settlement", getAddress(settlementAddress), {
    client: { wallet: deployer },
  });
  const setHookHash = await settlement.write.setHook([hookAddress]);
  console.log("setHook tx:", setHookHash);

  console.log("\nDone! Hook address:", hookAddress);
}

main().catch(console.error);
