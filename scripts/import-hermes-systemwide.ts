import { homedir } from "node:os";
import path from "node:path";
import { importHermesProfile, rollbackHermesProfileImport, verifyHermesProfileImport } from "../src/lib/hermes/profile-import";

function argument(name: string, fallback?: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const sourceRoot = path.resolve(argument("--source", path.join(homedir(), ".hermes"))!);
const targetRoot = path.resolve(argument("--target", path.join(process.cwd(), "data", "hermes"))!);
const sourceProfile = argument("--profile", "default")!;
const targetProfile = argument("--target-profile", sourceProfile === "default" ? "imported-default" : sourceProfile)!;
const rollback = process.argv.includes("--rollback");
const includeSecrets = process.argv.includes("--include-secrets");
const confirmed = process.argv.includes("--confirm");

if (!confirmed) {
  throw new Error("Confirmation requise : ajoutez --confirm après avoir vérifié source, cible et politique de secrets.");
}

if (rollback) {
  const result = await rollbackHermesProfileImport(targetRoot, targetProfile);
  console.log(`Import Hermes annulé : ${result.removed}`);
} else {
  const result = await importHermesProfile({ sourceRoot, targetRoot, sourceProfile, targetProfile, includeSecrets });
  await verifyHermesProfileImport(targetRoot, targetProfile);
  console.log(`Profil Hermes importé et vérifié : ${result.target}`);
  console.log(includeSecrets ? "Secrets inclus explicitement." : "Secrets exclus (défaut sûr). Configurez-les séparément.");
}
