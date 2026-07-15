import importlib.util
import pathlib
import sys
import types
import unittest


PLUGIN_PATH = pathlib.Path(__file__).with_name("__init__.py")
SPEC = importlib.util.spec_from_file_location("hermes_console_control_tested", PLUGIN_PATH)
PLUGIN = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(PLUGIN)


class ReasoningPolicyTests(unittest.TestCase):
    def test_openai_codex_gpt_models_expose_console_efforts(self):
        self.assertEqual(
            PLUGIN._reasoning_options("openai-codex", "gpt-5.6-luna"),
            ("low", "medium", "high", "xhigh"),
        )

    def test_claude_46_does_not_offer_xhigh(self):
        self.assertEqual(
            PLUGIN._reasoning_options("anthropic", "claude-opus-4-6"),
            ("low", "medium", "high", "max"),
        )

    def test_unknown_pairs_hide_reasoning(self):
        self.assertEqual(PLUGIN._reasoning_options("google", "gemini-2.5-pro"), ())


class _Platform:
    value = "telegram"


class _Source:
    platform = _Platform()
    user_id = "42"
    chat_id = "100"


class _Event:
    def __init__(self, text="/model", source=None):
        self.text = text
        self.source = source or _Source()

    def get_command(self):
        return self.text.split()[0].lstrip("/")

    def get_command_args(self):
        return self.text.partition(" ")[2]


class _Button:
    def __init__(self, text, callback_data):
        self.text = text
        self.callback_data = callback_data


class _Markup:
    def __init__(self, rows):
        self.inline_keyboard = rows


class _Query:
    def __init__(self):
        self.from_user = types.SimpleNamespace(id=42)
        self.edits = []
        self.answers = []

    async def edit_message_text(self, **kwargs):
        self.edits.append(kwargs)

    async def answer(self, text=None):
        self.answers.append(text)


class _Adapter:
    def __init__(self):
        self._model_picker_state = {}
        self.original_calls = []

    async def _handle_model_picker_callback(self, query, data, chat_id):
        self.original_calls.append((data, chat_id))


class _Gateway:
    def __init__(self, adapter):
        self.adapters = {_Source.platform: adapter}
        self._session_model_overrides = {}
        self.reasoning_events = []

    def _normalize_source_for_session_key(self, source):
        return source

    def _session_key_for_source(self, source):
        return f"telegram:{source.chat_id}:{source.user_id}"

    async def _handle_reasoning_command(self, event):
        self.reasoning_events.append(event.text)
        return "Effort appliqué"


class TelegramPickerFlowTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        PLUGIN._PICKER_CONTEXT.clear()
        PLUGIN._PENDING_EFFORT.clear()
        telegram = types.ModuleType("telegram")
        telegram.InlineKeyboardButton = _Button
        telegram.InlineKeyboardMarkup = _Markup
        sys.modules["telegram"] = telegram

        gateway_base = types.ModuleType("gateway.platforms.base")
        gateway_base.MessageEvent = _Event
        sys.modules["gateway"] = types.ModuleType("gateway")
        sys.modules["gateway.platforms"] = types.ModuleType("gateway.platforms")
        sys.modules["gateway.platforms.base"] = gateway_base

    def tearDown(self):
        for name in ("telegram", "gateway.platforms.base", "gateway.platforms", "gateway"):
            sys.modules.pop(name, None)

    async def test_model_selection_is_staged_until_effort_is_selected(self):
        adapter = _Adapter()
        gateway = _Gateway(adapter)
        await PLUGIN._pre_gateway_dispatch(_Event(), gateway)
        session_key = "telegram:100:42"

        async def on_model_selected(_chat_id, model_id, provider_slug):
            gateway._session_model_overrides[session_key] = {
                "model": model_id,
                "provider": provider_slug,
            }
            return "Modèle appliqué"

        adapter._model_picker_state["100"] = {
            "session_key": session_key,
            "model_list": ["gpt-5.6-luna"],
            "selected_provider": "openai-codex",
            "on_model_selected": on_model_selected,
        }
        query = _Query()

        await adapter._handle_model_picker_callback(query, "mm:0", "100")

        self.assertEqual(gateway._session_model_overrides, {})
        effort_callbacks = [
            button.callback_data
            for row in query.edits[-1]["reply_markup"].inline_keyboard
            for button in row
        ]
        self.assertIn("mg:hc:high", effort_callbacks)

        await adapter._handle_model_picker_callback(query, "mg:hc:high", "100")

        self.assertEqual(
            gateway._session_model_overrides[session_key],
            {"model": "gpt-5.6-luna", "provider": "openai-codex"},
        )
        self.assertEqual(gateway.reasoning_events, ["/reasoning high --global"])
        self.assertIn("Effort : High", query.edits[-1]["text"])
        self.assertNotIn("100", adapter._model_picker_state)


if __name__ == "__main__":
    unittest.main()
