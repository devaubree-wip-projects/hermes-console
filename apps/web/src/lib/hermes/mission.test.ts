import { describe, expect, test } from "bun:test";
import {
  applyMission,
  MISSION_BEGIN,
  MISSION_END,
  MISSION_MAX_LENGTH,
  MissionBlockError,
  readMission,
} from "./mission";

const DEFAULT_SOUL = "You are Hermes Agent, an intelligent AI assistant created by Nous Research.\n";

describe("mission block in SOUL.md", () => {
  test("appends the block without touching the runtime's own identity", () => {
    const updated = applyMission(DEFAULT_SOUL, "Tu es un agent de prospection.");
    expect(updated.startsWith(DEFAULT_SOUL.trimEnd())).toBe(true);
    expect(updated).toContain(`${MISSION_BEGIN}\nTu es un agent de prospection.\n${MISSION_END}`);
    expect(readMission(updated)).toBe("Tu es un agent de prospection.");
  });

  test("replaces only the block on the second write", () => {
    const first = applyMission(`${DEFAULT_SOUL}\nRègles maison à conserver.\n`, "Mission A");
    const second = applyMission(first, "Mission B");
    expect(readMission(second)).toBe("Mission B");
    expect(second).toContain("Règles maison à conserver.");
    expect(second).not.toContain("Mission A");
    expect(second.match(new RegExp(MISSION_BEGIN, "g"))).toHaveLength(1);
  });

  test("an empty mission removes the block and restores the original file", () => {
    const withBlock = applyMission(DEFAULT_SOUL, "Mission temporaire");
    expect(applyMission(withBlock, "   ")).toBe(DEFAULT_SOUL);
    expect(readMission(DEFAULT_SOUL)).toBeNull();
  });

  test("set / clear cycles stay stable instead of accumulating blank lines", () => {
    let soul = DEFAULT_SOUL;
    for (let round = 0; round < 3; round += 1) {
      soul = applyMission(soul, "Mission");
      soul = applyMission(soul, "");
    }
    expect(soul).toBe(DEFAULT_SOUL);
  });

  test("refuses to rewrite a half-open block rather than swallow the file", () => {
    const mangled = `${DEFAULT_SOUL}\n${MISSION_BEGIN}\nMission orpheline\n`;
    expect(() => applyMission(mangled, "Nouvelle mission")).toThrow(MissionBlockError);
    expect(() => readMission(mangled)).toThrow(MissionBlockError);
  });

  test("refuses duplicated blocks", () => {
    const duplicated = `${MISSION_BEGIN}\nA\n${MISSION_END}\n${MISSION_BEGIN}\nB\n${MISSION_END}\n`;
    expect(() => applyMission(duplicated, "C")).toThrow(MissionBlockError);
  });

  test("refuses a mission that smuggles the markers or overflows", () => {
    expect(() => applyMission(DEFAULT_SOUL, `x ${MISSION_END} y`)).toThrow(MissionBlockError);
    expect(() => applyMission(DEFAULT_SOUL, "x".repeat(MISSION_MAX_LENGTH + 1))).toThrow(
      MissionBlockError,
    );
  });

  test("an empty mission on a file without block is a no-op", () => {
    expect(applyMission(DEFAULT_SOUL, "")).toBe(DEFAULT_SOUL);
    expect(applyMission("", "")).toBe("");
  });
});
