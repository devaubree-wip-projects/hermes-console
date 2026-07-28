import path from "node:path";

const root = process.cwd();
const imageRepo = "nousresearch/hermes-agent";
const imageTag = process.env.HERMES_IMAGE_TAG?.trim() || "latest";
const imageRef = `${imageRepo}:${imageTag}`;
const pruneOnly = process.argv.includes("--prune-only");

async function run(command: string[], options: { quiet?: boolean } = {}) {
  const child = Bun.spawn(command, {
    cwd: root,
    env: process.env,
    stdout: options.quiet ? "pipe" : "inherit",
    stderr: options.quiet ? "pipe" : "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    const stderr = options.quiet ? await new Response(child.stderr).text() : "";
    throw new Error(
      stderr.trim()
        || `Commande échouée (${exitCode}) : ${command.join(" ")}`,
    );
  }
  if (options.quiet) {
    return new Response(child.stdout).text();
  }
  return "";
}

function normalizeImageId(id: string) {
  const trimmed = id.trim();
  return trimmed.startsWith("sha256:") ? trimmed.slice(7) : trimmed;
}

async function imageId(ref: string) {
  const output = await run(
    ["docker", "image", "inspect", ref, "--format", "{{.Id}}"],
    { quiet: true },
  );
  return normalizeImageId(output);
}

async function imagesUsedByContainers() {
  const containerIds = (await run(["docker", "ps", "-aq"], { quiet: true }))
    .trim()
    .split("\n")
    .filter(Boolean);
  const used = new Set<string>();
  for (const containerId of containerIds) {
    const inspect = await run(
      ["docker", "inspect", containerId, "--format", "{{.Image}}"],
      { quiet: true },
    );
    const id = inspect.trim();
    if (id) used.add(normalizeImageId(id));
  }
  return used;
}

async function listLocalHermesImages() {
  const output = await run(
    ["docker", "images", imageRepo, "--format", "{{.ID}}\t{{.Repository}}:{{.Tag}}"],
    { quiet: true },
  );
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, ref] = line.split("\t");
      return { id: normalizeImageId(id), ref };
    });
}

async function pullImage() {
  console.log(`Téléchargement de ${imageRef}…`);
  await run(["docker", "pull", imageRef]);
  const digest = await run(
    ["docker", "image", "inspect", imageRef, "--format", "{{index .RepoDigests 0}}"],
    { quiet: true },
  );
  if (digest.trim()) {
    console.log(`Image Hermes à jour (${digest.trim()}).`);
  } else {
    console.log(`Image Hermes à jour (${imageRef}).`);
  }
}

async function pruneOldImages() {
  const keepId = await imageId(imageRef);
  const usedIds = await imagesUsedByContainers();
  const localImages = await listLocalHermesImages();
  const removed: string[] = [];

  for (const entry of localImages) {
    if (entry.id === keepId || usedIds.has(entry.id)) continue;
    if (entry.ref === imageRef) continue;
    try {
      await run(["docker", "rmi", entry.ref], { quiet: true });
      removed.push(entry.ref);
    } catch {
      // Another tag may already have removed the layer.
    }
  }

  await run(["docker", "image", "prune", "-f"], { quiet: true });

  if (removed.length > 0) {
    console.log(`Images Hermes obsolètes supprimées : ${removed.join(", ")}`);
  } else {
    console.log("Aucune image Hermes obsolète à supprimer.");
  }
}

try {
  if (!pruneOnly) {
    await pullImage();
  }
  await pruneOldImages();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
