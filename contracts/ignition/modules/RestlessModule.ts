import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const RestlessModule = buildModule("RestlessModule", (m) => {
  // External addresses — configured per network via ignition parameters file
  const usdcAddress = m.getParameter("usdcAddress");
  const aUsdcAddress = m.getParameter("aUsdcAddress");
  const aavePoolAddress = m.getParameter("aavePoolAddress");
  const lifiDiamondAddress = m.getParameter("lifiDiamondAddress", ZERO_ADDRESS);

  // 1. Deploy Settlement (no hook yet — set after hook deployment)
  const settlement = m.contract("Settlement", [
    usdcAddress,
    lifiDiamondAddress,
    ZERO_ADDRESS, // hook set later via setHook
  ]);

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

  // 5. Deploy MockRestlessSettlementHook for testnet demo
  //    The real RestlessSettlementHook (v4 BaseHook) requires CREATE2 deployment
  //    with mined address bits — see scripts/deploy-hook.ts for production deploy.
  const hook = m.contract("MockRestlessSettlementHook", [
    usdcAddress,
    settlement,
  ]);

  // 6. Link hook to settlement
  m.call(settlement, "setHook", [hook]);

  return { settlement, adapter, escrow, hook };
});

export default RestlessModule;
