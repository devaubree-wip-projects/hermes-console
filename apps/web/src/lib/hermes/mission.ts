/**
 * The Console owns one delimited block inside a profile's `SOUL.md` — the file
 * Hermes injects into every system prompt (`agent/prompt_builder.py`). Everything
 * outside the markers belongs to whoever wrote it (the runtime's default identity,
 * or a human editing the profile) and is never touched here.
 *
 * Pure on purpose: the destructive part of "the Mission is the truth" is the text
 * transform, so it stays testable without a runtime.
 */

export const MISSION_BEGIN = "<!-- BEGIN:hermes-console-mission -->";
export const MISSION_END = "<!-- END:hermes-console-mission -->";

/** Raised when the block can no longer be located without risking the rest of the file. */
export class MissionBlockError extends Error {}

export const MISSION_MAX_LENGTH = 5_000;

function blockBounds(soul: string) {
  const begin = soul.indexOf(MISSION_BEGIN);
  const end = soul.indexOf(MISSION_END);
  if (begin === -1 && end === -1) return null;
  // A half-open block means the file was hand-edited and the marker pair broken.
  // Rewriting from a single marker would swallow or duplicate arbitrary content,
  // so refuse and let the caller surface a fixable error instead.
  if (begin === -1 || end === -1 || end < begin) {
    throw new MissionBlockError(
      "Le bloc mission de SOUL.md n’est plus correctement délimité. Rétablissez les marqueurs sur le runtime avant de modifier la mission depuis la Console.",
    );
  }
  if (soul.indexOf(MISSION_BEGIN, begin + MISSION_BEGIN.length) !== -1) {
    throw new MissionBlockError(
      "SOUL.md contient plusieurs blocs mission. Conservez-en un seul sur le runtime avant de modifier la mission depuis la Console.",
    );
  }
  return { begin, end: end + MISSION_END.length };
}

/** The mission currently published to the runtime, or null when the block is absent. */
export function readMission(soul: string): string | null {
  const bounds = blockBounds(soul);
  if (!bounds) return null;
  return soul
    .slice(bounds.begin + MISSION_BEGIN.length, bounds.end - MISSION_END.length)
    .trim();
}

/**
 * Return `soul` with the Console block set to `mission`. An empty mission removes
 * the block entirely, so clearing the field in the UI actually restores the
 * runtime's own identity instead of leaving a stale prompt behind.
 */
export function applyMission(soul: string, mission: string): string {
  const trimmed = mission.trim();
  if (trimmed.includes(MISSION_BEGIN) || trimmed.includes(MISSION_END)) {
    throw new MissionBlockError("La mission ne peut pas contenir les marqueurs du bloc.");
  }
  if (trimmed.length > MISSION_MAX_LENGTH) {
    throw new MissionBlockError(`La mission dépasse ${MISSION_MAX_LENGTH} caractères.`);
  }
  const bounds = blockBounds(soul);
  const block = `${MISSION_BEGIN}\n${trimmed}\n${MISSION_END}`;

  if (!bounds) {
    if (!trimmed) return soul;
    const base = soul.replace(/\s+$/, "");
    return base ? `${base}\n\n${block}\n` : `${block}\n`;
  }
  if (!trimmed) {
    // Drop the blank line that separated the block from the text above it,
    // so repeated set/clear cycles don't accumulate whitespace.
    const before = soul.slice(0, bounds.begin).replace(/\n{2,}$/, "\n");
    const after = soul.slice(bounds.end).replace(/^\n+/, "");
    return after ? `${before}${after}` : before.replace(/\s+$/, "\n");
  }
  return `${soul.slice(0, bounds.begin)}${block}${soul.slice(bounds.end)}`;
}
