"""Shared test setup: the app runs against an in-memory SQLite database and a fake OpenAI client,
so tests are fast, free, and never touch real services."""

import os
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


class FakeOpenAI:
    """Stands in for the OpenAI client. Tests set `verdict`, `reply` or `error` to control it,
    and inspect `filter_calls` / `reply_calls` to see what would have been sent."""

    def __init__(self):
        self.verdict = "YES"
        self.reply = "Here's some thoughtful advice."
        self.error = None
        self.filter_calls = []
        self.reply_calls = []
        self.responses = self

    def with_options(self, **_options):
        return self

    def create(self, model, instructions, input):
        if self.error:
            raise self.error
        if instructions == lovelab.FILTER_INSTRUCTIONS:
            self.filter_calls.append(input)
            return types.SimpleNamespace(output_text=self.verdict)
        self.reply_calls.append(input)
        return types.SimpleNamespace(output_text=self.reply)


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
    """Post a chat message and return the response."""
    def _send(message, **kwargs):
        return client.post("/", json={"message": message}, **kwargs)
    return _send
