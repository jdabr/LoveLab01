"""Shared test setup: the app runs against an in-memory SQLite database and a fake OpenAI client,
so tests are fast, free, and never touch real services."""

import os
import re
import types

# Must be set before `app` is imported, because app.py reads them at import time
os.environ.update(
    LOVELAB_ENV="dev",
    DATABASE_URL="sqlite://",
    OPENAI_API="sk-test-not-a-real-key",
    SECRET_KEY="test-secret-key",
    RATELIMIT_STORAGE_URI="memory://",
)

import pytest  # noqa: E402

import app as lovelab  # noqa: E402


class FakeStream:
    """Stands in for the SDK's stream of reply events: the reply arrives a word at a time. With
    fail_midway set, that error is raised after the first word."""

    def __init__(self, text, fail_midway=None):
        self.text = text
        self.fail_midway = fail_midway
        self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        self.closed = True

    def __iter__(self):
        for index, piece in enumerate(re.findall(r"\S+\s*|\s+", self.text)):
            if self.fail_midway and index == 1:
                raise self.fail_midway
            yield types.SimpleNamespace(type="response.output_text.delta", delta=piece)
        done = types.SimpleNamespace(status="completed", incomplete_details=None)
        yield types.SimpleNamespace(type="response.completed", response=done)


class FakeOpenAI:
    """Stands in for the OpenAI client. Tests set `verdict`, `reply`, `error` or `fail_midway` to control
    it, and inspect `filter_calls` / `reply_calls` / `streams` to see what would have been sent."""

    def __init__(self):
        self.verdict = "YES"
        self.reply = "Here's some thoughtful advice."
        self.error = None
        self.fail_midway = None
        self.filter_calls = []
        self.reply_calls = []
        self.store_flags = []
        self.reply_token_caps = []
        self.streams = []
        self.responses = self

    def with_options(self, **_options):
        return self

    def create(self, model, instructions, input, store=True, max_output_tokens=None, stream=False):
        self.store_flags.append(store)
        if self.error:
            raise self.error
        if instructions == lovelab.FILTER_INSTRUCTIONS:
            self.filter_calls.append(input)
            return types.SimpleNamespace(output_text=self.verdict)
        assert stream, "Replies are always streamed"
        self.reply_calls.append(input)
        self.reply_token_caps.append(max_output_tokens)
        self.streams.append(FakeStream(self.reply, self.fail_midway))
        return self.streams[-1]


@pytest.fixture
def fake_openai(monkeypatch):
    fake = FakeOpenAI()
    monkeypatch.setattr(lovelab.chat_assistant, "client", fake)
    return fake


@pytest.fixture
def app(fake_openai):
    """The Flask app with a fresh database, no rate limits and a fake OpenAI client."""
    lovelab.app.config["TESTING"] = True
    lovelab.limiter.enabled = False
    lovelab.chat_logger._cached_salt = (None, None)
    with lovelab.app.app_context():
        lovelab.db.create_all()
        yield lovelab.app
        lovelab.db.session.remove()
        lovelab.db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def send(client):
    """Post a message in one ongoing chat, the way the browser does: each reply's history token is sent
    back with the next message. Pass history=<token> (or None, for a brand-new chat) to override that."""
    chat = {"history": None}
    use_current_chat = object()

    def _send(message, history=use_current_chat, **kwargs):
        token = chat["history"] if history is use_current_chat else history
        response = client.post("/", json={"message": message, "history": token}, **kwargs)
        if response.status_code == 200:
            chat["history"] = response.json["history"]
        return response
    return _send
