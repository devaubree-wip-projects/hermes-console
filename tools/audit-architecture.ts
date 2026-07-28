import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import ts from "typescript";

type Endpoint = {
  file: string;
  methods: string[];
  path: string;
  lines: number;
  critical: boolean;
};

const root = resolve(import.meta.dir, "..");
const webRoot = await Bun.file(join(root, "apps/web/package.json")).exists()
  ? join(root, "apps/web")
  : root;
const sourceRoot = join(webRoot, "src");
const outputRoot = join(root, "docs/audit");

function run(command: string[]) {
  const result = Bun.spawnSync(command, { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr));
  }
  return new TextDecoder().decode(result.stdout).trim();
}

const trackedFiles = run(["git", "ls-files", "--cached", "--others", "--exclude-standard"])
  .split("\n")
  .filter(Boolean)
  .filter((file) => existsSync(join(root, file)))
  .sort();

function normalizePath(path: string) {
  return path.replaceAll("\\", "/");
}

function publicPath(file: string, kind: "api" | "page") {
  const appRelative = normalizePath(relative(join(sourceRoot, "app"), join(root, file)));
  const suffix = kind === "api" ? "/route.ts" : "/page.tsx";
  const withoutFile = appRelative.endsWith(suffix)
    ? appRelative.slice(0, -suffix.length)
    : appRelative.replace(/(^|\/)(route\.ts|page\.tsx)$/, "");
  const segments = withoutFile
    .split("/")
    .filter((segment) => segment && !(segment.startsWith("(") && segment.endsWith(")")))
    .map((segment) => {
      if (/^\[\[\.\.\..+\]\]$/.test(segment)) return `*${segment.slice(5, -2)}?`;
      if (/^\[\.\.\..+\]$/.test(segment)) return `*${segment.slice(4, -1)}`;
      if (/^\[.+\]$/.test(segment)) return `:${segment.slice(1, -1)}`;
      return segment;
    });
  return `/${segments.join("/")}`.replace(/\/$/, "") || "/";
}

function isCriticalRoute(path: string) {
  // `/mail/` : ces routes détiennent un secret de relais et écrivent à des tiers
  // au nom du tenant — une régression y est visible depuis l'extérieur, et
  // définitive pour le destinataire.
  return ["/api/auth/", "/agents", "/installations", "/api/runtime/enroll", "/mail/"].some((part) =>
    path.includes(part),
  );
}

const apiRouteFiles = trackedFiles.filter(
  (file) => file.startsWith(normalizePath(relative(root, join(sourceRoot, "app/api"))) + "/") && file.endsWith("/route.ts"),
);
const pageFiles = trackedFiles.filter(
  (file) => file.startsWith(normalizePath(relative(root, join(sourceRoot, "app"))) + "/") && file.endsWith("/page.tsx"),
);

const endpoints: Endpoint[] = [];
for (const file of apiRouteFiles) {
  const content = await Bun.file(join(root, file)).text();
  const methods = [...content.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)]
    .map((match) => match[1])
    .sort();
  const path = publicPath(file, "api");
  endpoints.push({
    file,
    methods,
    path,
    lines: content.split("\n").length,
    critical: isCriticalRoute(path),
  });
}
endpoints.sort((a, b) => a.path.localeCompare(b.path));

const pages = pageFiles
  .map((file) => ({ file, path: publicPath(file, "page") }))
  .sort((a, b) => a.path.localeCompare(b.path));

const scanFiles = trackedFiles.filter(
  (file) =>
    /\.(?:ts|tsx|mjs|go|ya?ml)$/.test(file) ||
    [".env.example", "Makefile", "apps/gateway/Dockerfile"].includes(file),
);
const envReferences = new Map<string, Set<string>>();
const codeEnvPatterns = [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /process\.env\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g,
  /(?:os\.)?(?:Getenv|LookupEnv)\(\s*["']([A-Z][A-Z0-9_]*)["']\s*\)/g,
];
for (const file of scanFiles) {
  const content = await Bun.file(join(root, file)).text();
  const patterns = /(?:\.ya?ml$|Dockerfile|Makefile|\.env\.example$)/.test(file)
    ? [...codeEnvPatterns, /\$\{([A-Z][A-Z0-9_]*)(?::[-?][^}]*)?\}/g]
    : codeEnvPatterns;
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const references = envReferences.get(match[1]) ?? new Set<string>();
      references.add(file);
      envReferences.set(match[1], references);
    }
  }
}

const sourceFiles = trackedFiles.filter(
  (file) =>
    file.startsWith(normalizePath(relative(root, sourceRoot)) + "/") &&
    /\.(?:ts|tsx)$/.test(file) &&
    !file.endsWith(".d.ts"),
);
const sourceSet = new Set(sourceFiles);
const incoming = new Map(sourceFiles.map((file) => [file, new Set<string>()]));

function resolveImport(importer: string, specifier: string) {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = normalizePath(join(relative(root, sourceRoot), specifier.slice(2)));
  } else if (specifier.startsWith(".")) {
    base = normalizePath(join(dirname(importer), specifier));
  } else {
    return undefined;
  }
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ].map(normalizePath);
  return candidates.find((candidate) => sourceSet.has(candidate));
}

for (const importer of sourceFiles) {
  const content = await Bun.file(join(root, importer)).text();
  const imports = ts.preProcessFile(content, true, true).importedFiles.map((item) => item.fileName);
  for (const specifier of imports) {
    const resolved = resolveImport(importer, specifier);
    if (resolved) incoming.get(resolved)?.add(importer);
  }
}

const entrypointPattern = /\/app\/(?:.*\/)?(?:page|layout|loading|error|not-found|route)\.tsx?$/;
const unreferencedModules = sourceFiles
  .filter((file) => (incoming.get(file)?.size ?? 0) === 0)
  .filter((file) => !entrypointPattern.test(`/${file}`))
  .filter((file) => !/\.(?:test|spec)\.tsx?$/.test(file))
  .sort();

const packageFiles = trackedFiles.filter((file) => file === "package.json" || file.endsWith("/package.json"));
const scripts: Record<string, Record<string, string>> = {};
for (const file of packageFiles) {
  const pkg = await Bun.file(join(root, file)).json();
  if (pkg.scripts) scripts[file] = Object.fromEntries(Object.entries(pkg.scripts).sort(([a], [b]) => a.localeCompare(b)));
}

const migrationFiles = trackedFiles.filter((file) => /(^|\/)(drizzle|migrations?)(\/|\.|$)/i.test(file) || /migrate/i.test(file));
const keyConfigFiles = trackedFiles.filter((file) =>
  /(^|\/)(?:package\.json|bun\.lock|go\.mod|go\.sum|Makefile|Dockerfile[^/]*|compose[^/]*\.ya?ml|next\.config\.[cm]?[jt]s|tsconfig[^/]*\.json|eslint\.config\.[cm]?[jt]s|drizzle\.config\.[cm]?[jt]s|playwright\.config\.[cm]?[jt]s|\.env\.example)$/.test(file),
);

const commit = run(["git", "rev-parse", "HEAD"]);
const importGraph = sourceFiles.map((module) => ({
  module,
  incoming: [...(incoming.get(module) ?? [])].sort(),
}));
const audit = {
  schemaVersion: 1,
  commit,
  layout: webRoot === root ? "pre-monorepo" : "monorepo",
  endpoints,
  pages,
  environment: [...envReferences]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, references]) => ({ name, references: [...references].sort() })),
  scripts,
  migrations: migrationFiles,
  keyConfigFiles,
  criticalRoutes: endpoints.filter((endpoint) => endpoint.critical),
};

const schemaFile = normalizePath(relative(root, join(sourceRoot, "db/schema.ts")));
const schemaContent = await Bun.file(join(root, schemaFile)).arrayBuffer();
const schemaHasher = new Bun.CryptoHasher("sha256");
schemaHasher.update(schemaContent);
const contractSnapshot = {
  schemaVersion: 1,
  commit,
  routes: endpoints.map(({ methods, path }) => ({ methods, path })),
  databaseSchema: { file: schemaFile, sha256: schemaHasher.digest("hex") },
};

await mkdir(outputRoot, { recursive: true });
await Bun.write(join(outputRoot, "inventory.json"), `${JSON.stringify(audit, null, 2)}\n`);
await Bun.write(join(outputRoot, "import-graph.json"), `${JSON.stringify(importGraph, null, 2)}\n`);
await Bun.write(join(outputRoot, "unreferenced-modules.json"), `${JSON.stringify({ schemaVersion: 1, commit, modules: unreferencedModules }, null, 2)}\n`);
await Bun.write(join(outputRoot, "contracts-current.json"), `${JSON.stringify(contractSnapshot, null, 2)}\n`);

console.log(`Audited ${endpoints.length} API routes, ${pages.length} pages and ${sourceFiles.length} source modules.`);
console.log(`Found ${unreferencedModules.length} unreferenced module candidates; review docs/audit/unreferenced-modules.json.`);
