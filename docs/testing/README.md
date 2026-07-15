# Validation surfaces

- `route-regression-matrix.md` freezes every public API method/path and defines the expected smoke category.
- `bun run contracts:verify` compares current routes and the Drizzle schema to `docs/audit/contract-baseline.json`.
- `bun run test` covers Web and shared contracts; `bun run test:gateway` covers the Go Edge/Relay with the race detector.
- `bun run test:e2e` covers auth/workspace routing, installations, composer behavior and Relay chat. It intentionally runs only in the
  integration canary or when explicitly started by a developer because it launches a temporary Next.js server.
