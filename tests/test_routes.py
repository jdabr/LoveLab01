"""Tests for the HTTP routes: what visitors see and what the chat endpoint returns."""

import pytest

import app as lovelab


class TestHomePage:
    def test_shows_welcome_message(self, client):
        response = client.get("/")
        assert response.status_code == 200
        assert lovelab.WELCOME_MESSAGE.split("!")[0].encode() in response.data

    def test_input_limit_matches_server_limit(self, client):
        response = client.get("/")
        assert f'maxlength="{lovelab.MAX_MESSAGE_LENGTH}"'.encode() in response.data

    def test_reloading_starts_a_new_conversation(self, client):
        with client.session_transaction() as sess:
            sess["messages"] = [{"role": "user", "content": "old message"}]
        client.get("/")
        with client.session_transaction() as sess:
            assert "messages" not in sess


def test_about_page(client):
    assert client.get("/about").status_code == 200


@pytest.mark.parametrize("path", ["/", "/about"])
def test_security_headers_on_every_page(client, path):
    headers = client.get(path).headers
    assert headers["Content-Security-Policy"] == lovelab.CONTENT_SECURITY_POLICY
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"
    assert headers["Referrer-Policy"] == "strict-origin-when-cross-origin"


class TestChatValidation:
    @pytest.mark.parametrize("payload", [{}, {"message": ""}, {"message": "   "}, {"message": 42}, {"message": None}])
    def test_rejects_empty_or_non_text_messages(self, client, fake_openai, payload):
        response = client.post("/", json=payload)
        assert response.status_code == 400
        assert response.json["message"] == lovelab.EMPTY_MESSAGE_REPLY
        assert not fake_openai.filter_calls

    def test_rejects_non_json_body(self, client):
        response = client.post("/", data="hello", content_type="text/plain")
        assert response.status_code == 400

    def test_rejects_messages_over_the_limit(self, send, fake_openai):
        response = send("a" * (lovelab.MAX_MESSAGE_LENGTH + 1))
        assert response.status_code == 400
        assert response.json["message"] == lovelab.TOO_LONG_REPLY
        assert not fake_openai.filter_calls

    def test_accepts_messages_exactly_at_the_limit(self, send):
        assert send("a" * lovelab.MAX_MESSAGE_LENGTH).status_code == 200

    def test_strips_surrounding_whitespace(self, send, fake_openai):
        send("  hello  ")
        assert fake_openai.filter_calls[0] == [{"role": "user", "content": "hello"}]


class TestChatReplies:
    def test_on_topic_message_gets_model_reply(self, send, fake_openai):
        fake_openai.reply = "Try talking to them openly."
        response = send("My partner and I keep arguing")
        assert response.status_code == 200
        assert response.json["message"] == "Try talking to them openly."

    def test_off_topic_message_skips_the_main_model(self, send, fake_openai):
        fake_openai.verdict = "NO"
        response = send("What's the weather?")
        assert response.json["message"] == lovelab.OFF_TOPIC_REPLY
        assert not fake_openai.reply_calls

    def test_openai_failure_returns_friendly_error(self, send, fake_openai):
        fake_openai.error = TimeoutError("slow")
        response = send("hello")
        assert response.status_code == 502
        assert response.json["message"] == lovelab.SERVICE_ERROR_REPLY

    def test_logging_failure_still_returns_reply(self, send, monkeypatch):
        def broken_log(*_args):
            raise RuntimeError("database down")
        monkeypatch.setattr(lovelab.chat_logger, "log_message", broken_log)
        response = send("hello")
        assert response.status_code == 200
        assert response.json["message"]


class TestRateLimiting:
    @pytest.fixture(autouse=True)
    def enable_limits(self, app):
        lovelab.limiter.enabled = True
        lovelab.limiter.reset()
        yield
        lovelab.limiter.reset()
        lovelab.limiter.enabled = False

    def test_too_many_messages_get_a_readable_429(self, send):
        per_minute = int(lovelab.CHAT_RATE_LIMIT.split(" per minute")[0])
        for _ in range(per_minute):
            assert send("hello").status_code == 200
        response = send("hello")
        assert response.status_code == 429
        assert response.json["message"] == lovelab.RATE_LIMITED_REPLY
        assert "Retry-After" in response.headers

    def test_page_views_are_not_rate_limited(self, client):
        per_minute = int(lovelab.CHAT_RATE_LIMIT.split(" per minute")[0])
        for _ in range(per_minute + 2):
            assert client.get("/").status_code == 200
