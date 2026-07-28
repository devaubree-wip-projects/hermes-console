import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const audit = Bun.spawnSync(["bun", "run", "tools/audit-architecture.ts"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});
if (audit.exitCode !== 0) process.exit(audit.exitCode);

type ContractSnapshot = {
  routes: Array<{ methods: string[]; path: string }>;
  databaseSchema: { sha256: string };
};

const baseline = await Bun.file(resolve(root, "docs/audit/contract-baseline.json")).json() as ContractSnapshot;
const current = await Bun.file(resolve(root, "docs/audit/contracts-current.json")).json() as ContractSnapshot;
const expected = JSON.stringify({ routes: baseline.routes, databaseSchema: baseline.databaseSchema.sha256 });
const received = JSON.stringify({ routes: current.routes, databaseSchema: current.databaseSchema.sha256 });

if (expected !== received) {
  console.error("Public route methods/paths or the database schema changed from the frozen baseline.");
  console.error("Inspect docs/audit/contract-baseline.json and docs/audit/contracts-current.json.");
  process.exit(1);
}

console.log(`Contract verification passed: ${current.routes.length} API paths and the database schema are unchanged.`);
