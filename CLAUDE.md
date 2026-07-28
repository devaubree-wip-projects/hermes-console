@AGENTS.md

# Karpathy Coding Guidelines

These repository instructions follow Andrej Karpathy's engineering guidelines:
https://github.com/multica-ai/andrej-karpathy-skills

## Think Before Coding

- State assumptions explicitly and surface uncertainty or competing interpretations.
- Prefer the simplest approach that satisfies the actual request.
- Name tradeoffs before making a significant architectural or behavioral change.

## Simplicity First

- Write the minimum code needed for the requested behavior.
- Do not add speculative features, one-use abstractions, or unrequested configurability.
- If an implementation is substantially longer than necessary, simplify it.

## Surgical Changes

- Every changed line must trace back to the request.
- Match the existing style and avoid unrelated cleanup.
- Remove only the orphaned code created by the current change, unless dead-code removal was requested explicitly.

## Goal-Driven Execution

- Translate the request into observable success criteria before implementation.
- Verify behavior with the smallest authoritative tests, then expand checks in proportion to risk.
- Do not claim completion from intent or static inspection when runtime evidence is required.
