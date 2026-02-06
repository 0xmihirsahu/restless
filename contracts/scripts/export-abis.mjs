import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactsDir = join(__dirname, "..", "artifacts", "contracts");
const outputDir = join(__dirname, "..", "..", "frontend", "src", "contracts");

const contracts = [
  { name: "RestlessEscrow", path: "RestlessEscrow.sol/RestlessEscrow.json" },
  { name: "Settlement", path: "Settlement.sol/Settlement.json" },
  { name: "AaveYieldAdapter", path: "AaveYieldAdapter.sol/AaveYieldAdapter.json" },
  { name: "RestlessSettlementHook", path: "RestlessSettlementHook.sol/RestlessSettlementHook.json" },
];

mkdirSync(outputDir, { recursive: true });

for (const contract of contracts) {
  const artifactPath = join(artifactsDir, contract.path);
  const artifact = JSON.parse(readFileSync(artifactPath, "utf-8"));

  writeFileSync(
    join(outputDir, `${contract.name}.abi.json`),
    JSON.stringify(artifact.abi, null, 2) + "\n"
  );
}

// Write barrel index
const lines = contracts.map(
  (c) => `export { default as ${c.name[0].toLowerCase() + c.name.slice(1)}Abi } from "./${c.name}.abi.json";`
);
writeFileSync(join(outputDir, "index.ts"), lines.join("\n") + "\n");

console.log(`Exported ${contracts.length} ABIs to ${outputDir}`);
