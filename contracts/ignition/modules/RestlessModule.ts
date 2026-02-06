import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const RestlessModule = buildModule("RestlessModule", (m) => {
  // External addresses — configured per network via ignition parameters file
  const usdcAddress = m.getParameter("usdcAddress");
  const aUsdcAddress = m.getParameter("aUsdcAddress");
  const aavePoolAddress = m.getParameter("aavePoolAddress");

  // 1. Deploy Settlement (no circular deps)
  const settlement = m.contract("Settlement", [usdcAddress]);

  // 2. Deploy AaveYieldAdapter (escrow set separately via setEscrow)
  const adapter = m.contract("AaveYieldAdapter", [
    usdcAddress,
    aUsdcAddress,
    aavePoolAddress,
  ]);

  // 3. Deploy RestlessEscrow (takes adapter + settlement addresses)
  const escrow = m.contract("RestlessEscrow", [
    usdcAddress,
    adapter,
    settlement,
  ]);

  // 4. Link adapter to escrow (one-time initialization)
  m.call(adapter, "setEscrow", [escrow]);

  // 5. Deploy RestlessSettlementHook (optional, for Uniswap v4 prize track)
  const hook = m.contract("RestlessSettlementHook", [
    usdcAddress,
    settlement,
  ]);

  return { settlement, adapter, escrow, hook };
});

export default RestlessModule;
