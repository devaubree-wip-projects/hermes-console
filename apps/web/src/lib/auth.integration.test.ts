import { describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

mock.module("server-only", () => ({}));

const databaseTest = process.env.DATABASE_URL ? test : test.skip;

describe("session token storage", () => {
  databaseTest("stores the sha256 hash of the token, never the raw value", async () => {
    const [{ db }, schema, { createAuthSession }, { sha256Token }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
      import("./auth"),
      import("./token-hash"),
    ]);
    const suffix = randomUUID().slice(0, 8);
    const [user] = await db
      .insert(schema.users)
      .values({
        email: `session-${suffix}@example.com`,
        name: "Session Test",
        passwordHash: "scrypt:x:y",
      })
      .returning();
    try {
      const { token } = await createAuthSession(user.id);
      const [row] = await db
        .select()
        .from(schema.authSessions)
        .where(eq(schema.authSessions.userId, user.id))
        .limit(1);
      expect(row).toBeDefined();
      // The raw token must not be persisted; only its hash is.
      expect(row!.token).not.toBe(token);
      expect(row!.token).toBe(sha256Token(token));
    } finally {
      await db.delete(schema.users).where(eq(schema.users.id, user.id));
    }
  });
});
