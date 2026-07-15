"""Telegram inference controls owned and deployed by Hermes Console.

This is a user plugin, deliberately installed outside the Hermes Agent source
tree.  It keeps the native provider/model picker and inserts a provider-aware
reasoning step before committing the model switch.
"""

from __future__ import annotations

import asyncio
import re
import time
from typing import Any


_PLUGIN_MARKER = "_hermes_console_control_model_picker"
_PICKER_CONTEXT: dict[tuple[int, str], dict[str, Any]] = {}
_PENDING_EFFORT: dict[tuple[int, str], dict[str, Any]] = {}
_PENDING_TTL_SECONDS = 180


def _platform_name(source: Any) -> str:
    platform = getattr(source, "platform", "")
    return str(getattr(platform, "value", platform) or "").strip().lower()


def _reasoning_options(provider: str, model: str) -> tuple[str, ...]:
    """Mirror the provider-aware policy maintained by Hermes Console."""
    normalized_provider = (provider or "").strip().lower()
    normalized_model = (model or "").strip().lower()
    if normalized_provider in {"openai", "openai-api", "openai-codex"}:
        if re.match(r"^(?:gpt-5|codex|o[134](?:-|$))", normalized_model):
            return ("low", "medium", "high", "xhigh")
        return ()

    if normalized_provider not in {"anthropic", "claude"}:
        return ()
    if re.search(r"claude-(?:opus|sonnet)-4[-.]6", normalized_model):
        return ("low", "medium", "high", "max")
    if re.search(r"(?:claude-fable|claude-(?:opus|sonnet)-4[-.](?:[789]|\d{2,}))", normalized_model):
        return ("low", "medium", "high", "xhigh", "max")
    if re.search(r"claude-(?:opus|sonnet|haiku)-(?:3|4[-.](?:0|1|5)|4-2025)", normalized_model):
        return ("low", "medium", "high", "xhigh")
    return ()


def _scope_label(is_session: bool) -> str:
    return "session Telegram" if is_session else "profil global"


def _effort_label(effort: str) -> str:
    return {
        "low": "Low",
        "medium": "Medium",
        "high": "High",
        "xhigh": "Extra high",
        "max": "Max",
    }.get(effort, effort)


def _prune_pending() -> None:
    cutoff = time.monotonic() - _PENDING_TTL_SECONDS
    for key, value in list(_PENDING_EFFORT.items()):
        if float(value.get("created_at", 0)) < cutoff:
            _PENDING_EFFORT.pop(key, None)


def _callback_user_allowed(query: Any, pending: dict[str, Any]) -> bool:
    expected = str(pending.get("user_id") or "")
    actual = str(getattr(getattr(query, "from_user", None), "id", "") or "")
    return not expected or expected == actual


async def _show_effort_picker(
    *,
    adapter: Any,
    gateway: Any,
    query: Any,
    chat_id: str,
    state: dict[str, Any],
    model_id: str,
    provider_slug: str,
) -> None:
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup

    options = _reasoning_options(provider_slug, model_id)
    if not options:
        # The Console intentionally hides reasoning for unknown/unsupported
        # pairs instead of sending an upstream parameter that may be ignored.
        await adapter._hermes_console_original_model_picker(query, f"mm:{state['model_index']}", chat_id)
        return

    session_key = str(state.get("session_key") or "")
    context = _PICKER_CONTEXT.get((id(adapter), session_key), {})
    is_session = bool(context.get("is_session"))
    source = context.get("source")
    if source is None:
        source = context.get("original_source")

    _prune_pending()
    _PENDING_EFFORT[(id(adapter), chat_id)] = {
        "created_at": time.monotonic(),
        "source": source,
        "session_key": session_key,
        "is_session": is_session,
        "model_id": model_id,
        "provider_slug": provider_slug,
        "on_model_selected": state.get("on_model_selected"),
        "user_id": str(getattr(source, "user_id", "") or ""),
    }

    rows = []
    for index in range(0, len(options), 2):
        rows.append([
            InlineKeyboardButton(
                _effort_label(effort),
                callback_data=f"mg:hc:{effort}",
            )
            for effort in options[index:index + 2]
        ])
    rows.append([
        InlineKeyboardButton("◀ Retour", callback_data="mb"),
        InlineKeyboardButton("✗ Annuler", callback_data="mx"),
    ])

    await query.edit_message_text(
        text=(
            "⚙ Configuration du modèle\n\n"
            f"Modèle : {model_id}\n"
            f"Provider : {provider_slug}\n"
            f"Portée : {_scope_label(is_session)}\n\n"
            "Choisis l’effort de raisonnement :"
        ),
        parse_mode=None,
        reply_markup=InlineKeyboardMarkup(rows),
    )
    await query.answer(text="Choisis l’effort")


async def _apply_combined_selection(
    *,
    adapter: Any,
    gateway: Any,
    query: Any,
    data: str,
    chat_id: str,
) -> None:
    effort = data.removeprefix("mg:hc:").strip().lower()
    pending_key = (id(adapter), chat_id)
    pending = _PENDING_EFFORT.get(pending_key)
    if not pending:
        await query.answer(text="Sélecteur expiré — relance /model.")
        return
    if float(pending.get("created_at", 0)) < time.monotonic() - _PENDING_TTL_SECONDS:
        _PENDING_EFFORT.pop(pending_key, None)
        adapter._model_picker_state.pop(chat_id, None)
        await query.answer(text="Sélecteur expiré — relance /model.")
        return
    if effort not in _reasoning_options(
        str(pending.get("provider_slug") or ""),
        str(pending.get("model_id") or ""),
    ):
        await query.answer(text="Effort invalide.")
        return
    if not _callback_user_allowed(query, pending):
        await query.answer(text="⛔ Ce sélecteur appartient à un autre utilisateur.")
        return

    callback = pending.get("on_model_selected")
    source = pending.get("source")
    if not callable(callback) or source is None:
        _PENDING_EFFORT.pop(pending_key, None)
        await query.answer(text="Sélecteur expiré — relance /model.")
        return

    model_id = str(pending["model_id"])
    provider_slug = str(pending["provider_slug"])
    try:
        model_result = await callback(chat_id, model_id, provider_slug)
    except Exception as exc:
        _PENDING_EFFORT.pop(pending_key, None)
        adapter._model_picker_state.pop(chat_id, None)
        await query.edit_message_text(
            text=f"Impossible de changer de modèle : {exc}",
            parse_mode=None,
            reply_markup=None,
        )
        await query.answer(text="Changement impossible")
        return

    session_key = str(pending.get("session_key") or "")
    override = (getattr(gateway, "_session_model_overrides", {}) or {}).get(session_key, {})
    switched = (
        str(override.get("model") or "") == model_id
        and str(override.get("provider") or "") == provider_slug
    )
    if not switched:
        _PENDING_EFFORT.pop(pending_key, None)
        adapter._model_picker_state.pop(chat_id, None)
        await query.edit_message_text(
            text=str(model_result or "Le changement de modèle a échoué."),
            parse_mode=None,
            reply_markup=None,
        )
        await query.answer(text="Changement impossible")
        return

    from gateway.platforms.base import MessageEvent

    reasoning_text = f"/reasoning {effort}"
    if not pending.get("is_session"):
        reasoning_text += " --global"
    reasoning_event = MessageEvent(text=reasoning_text, source=source)
    reasoning_result = await gateway._handle_reasoning_command(reasoning_event)

    _PENDING_EFFORT.pop(pending_key, None)
    adapter._model_picker_state.pop(chat_id, None)
    _PICKER_CONTEXT.pop((id(adapter), session_key), None)
    await query.edit_message_text(
        text=(
            "✅ Configuration mise à jour\n\n"
            f"Modèle : {model_id}\n"
            f"Provider : {provider_slug}\n"
            f"Effort : {_effort_label(effort)}\n"
            f"Portée : {_scope_label(bool(pending.get('is_session')))}\n\n"
            f"{reasoning_result}"
        ),
        parse_mode=None,
        reply_markup=None,
    )
    await query.answer(text="Modèle et effort appliqués")


def _patch_telegram_adapter(adapter: Any, gateway: Any) -> None:
    if getattr(adapter, _PLUGIN_MARKER, False):
        return

    original = adapter._handle_model_picker_callback
    adapter._hermes_console_original_model_picker = original

    async def wrapped(query: Any, data: str, chat_id: str) -> None:
        pending_key = (id(adapter), chat_id)
        if data.startswith("mg:hc:"):
            await _apply_combined_selection(
                adapter=adapter,
                gateway=gateway,
                query=query,
                data=data,
                chat_id=chat_id,
            )
            return

        if data.startswith(("mb", "mx")):
            _PENDING_EFFORT.pop(pending_key, None)
            current_state = adapter._model_picker_state.get(chat_id) or {}
            if data.startswith("mx"):
                _PICKER_CONTEXT.pop(
                    (id(adapter), str(current_state.get("session_key") or "")),
                    None,
                )
            await original(query, data, chat_id)
            return

        if not data.startswith(("mm:", "mc:")):
            await original(query, data, chat_id)
            return

        state = adapter._model_picker_state.get(chat_id)
        if not state:
            await original(query, data, chat_id)
            return
        try:
            model_index = int(data.split(":", 1)[1])
            model_id = state.get("model_list", [])[model_index]
        except (ValueError, IndexError, TypeError):
            await original(query, data, chat_id)
            return
        provider_slug = str(state.get("selected_provider") or "")
        options = _reasoning_options(provider_slug, str(model_id))
        if not options:
            await original(query, data, chat_id)
            return

        # Preserve Hermes' native expensive-model confirmation.  The confirmed
        # mc:<index> callback returns here and then advances to effort selection.
        if data.startswith("mm:"):
            try:
                from hermes_cli.model_cost_guard import expensive_model_warning

                warning = await asyncio.to_thread(
                    expensive_model_warning,
                    model_id,
                    provider=provider_slug,
                )
            except Exception:
                warning = None
            if warning is not None:
                await original(query, data, chat_id)
                return

        state["model_index"] = model_index
        await _show_effort_picker(
            adapter=adapter,
            gateway=gateway,
            query=query,
            chat_id=chat_id,
            state=state,
            model_id=str(model_id),
            provider_slug=provider_slug,
        )

    adapter._handle_model_picker_callback = wrapped
    setattr(adapter, _PLUGIN_MARKER, True)


async def _pre_gateway_dispatch(event: Any, gateway: Any, **_: Any) -> None:
    if _platform_name(getattr(event, "source", None)) != "telegram":
        return None
    if str(event.get_command() or "").strip().lower() != "model":
        return None

    source = event.source
    adapter = gateway.adapters.get(source.platform)
    if adapter is None or not hasattr(adapter, "_handle_model_picker_callback"):
        return None
    _patch_telegram_adapter(adapter, gateway)

    raw_args = event.get_command_args().strip()
    try:
        from hermes_cli.model_switch import parse_model_flags

        model_input, explicit_provider, _, _, is_session = parse_model_flags(raw_args)
    except Exception:
        model_input = ""
        explicit_provider = ""
        is_session = "--session" in raw_args.split()
    if model_input or explicit_provider:
        return None

    try:
        normalized_source = await asyncio.to_thread(
            gateway._normalize_source_for_session_key,
            source,
        )
    except Exception:
        normalized_source = source
    session_key = gateway._session_key_for_source(normalized_source)
    _PICKER_CONTEXT[(id(adapter), session_key)] = {
        "is_session": bool(is_session),
        "source": normalized_source,
        "original_source": source,
    }
    return None


def register(ctx: Any) -> None:
    ctx.register_hook("pre_gateway_dispatch", _pre_gateway_dispatch)
