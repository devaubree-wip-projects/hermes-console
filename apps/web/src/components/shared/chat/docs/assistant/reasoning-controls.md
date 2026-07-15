# Reasoning / effort controls by provider

UI source: `constants/reasoning-config.ts` (`getReasoningControlConfig`).

## OpenAI

| Control | Values |
| --- | --- |
| **Reasoning** | `low`, `medium`, `high` |

API: `providerOptions.openai.reasoningEffort`

## Claude (Anthropic)

Adaptive thinking + `output_config.effort`. **Ultracode** (Claude Code) is **not** a separate API level — it pairs `xhigh` with multi-agent permissions.

| Model | Effort levels | Default | Notes |
| --- | --- | --- | --- |
| Opus 4.8, 4.8 Fast | low, medium, high, **xhigh**, max | high | Adaptive only; manual `budget_tokens` → 400 |
| Opus 4.7, 4.7 Fast | low, medium, high, **xhigh**, max | high | Same as 4.8 |
| Opus 4.6 | low, medium, high, max | high | No **xhigh** |
| Sonnet 4.6 | low, medium, high, max | **medium** | No **xhigh**; medium recommended for agentic work |
| Haiku 4.5 | — (hidden) | — | Effort API unsupported; legacy `budget_tokens` only |

Sources:

- [Effort](https://platform.claude.com/docs/en/build-with-claude/effort)
- [Adaptive thinking](https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking)

## Gemini

| Control | Values |
| --- | --- |
| **Thinking** | Flash: off, auto, low, medium, high — Pro: auto, low, medium, high |

## Ollama

No reasoning control in the composer.
