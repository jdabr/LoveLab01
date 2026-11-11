"""Tests for the HTTP routes: what visitors see and what the chat endpoint returns."""

import pytest

import app as lovelab


class TestHomePage:
    def test_shows_empty_chat_greeting(self, client):
        response = client.get("/")
        assert response.status_code == 200
        assert b'id="empty-state"' in response.data
        assert b'id="suggestions"' in response.data

    def test_input_limit_matches_server_limit(self, client):
        response = client.get("/")
        assert f'maxlength="{lovelab.MAX_MESSAGE_LENGTH}"'.encode() in response.data

    def test_has_chat_controls(self, client):
        html = client.get("/").data.decode()
        for element_id in ["new-chat", "delete-chat", "chat-list", "add-person", "remember-chat", "menu-button"]:
            assert f'id="{element_id}"' in html

    def test_remember_period_is_passed_to_the_page(self, client):
        assert f'data-remember-days="{lovelab.REMEMBER_DAYS}"'.encode() in client.get("/").data

    def test_head_request_succeeds(self, client):
        # Link previewers and uptime monitors check pages with HEAD.
        assert client.head("/").status_code == 200


def test_no_cookies_are_set(client, send):
    # Chat history travels in signed history tokens, so LoveLab needs no cookies at all
    assert "Set-Cookie" not in client.get("/").headers
    assert "Set-Cookie" not in send("hello").headers


def test_about_page(client):
    assert client.get("/about").status_code == 200


@pytest.mark.parametrize("path", ["/", "/about"])
def test_security_headers_on_every_page(client, path):
    headers = client.get(path).headers
    assert headers["Content-Security-Policy"] == lovelab.CSP
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

    @pytest.mark.parametrize("body", ["[1, 2]", '"hello"', "5", "true", "null", "[" * 5000 + "]" * 5000])
    def test_json_that_isnt_an_object_gets_a_readable_400(self, client, fake_openai, body):
        # These used to crash with a 500 error page
        response = client.post("/", data=body, content_type="application/json")
        assert response.status_code == 400
        assert response.json["message"] == lovelab.EMPTY_MESSAGE_REPLY
        assert not fake_openai.filter_calls

    def test_oversized_body_gets_the_too_long_reply(self, client, fake_openai):
        body = '{"message": "' + "a" * 20000 + '"}'
        response = client.post("/", data=body, content_type="application/json")
        assert response.status_code == 400
        assert response.json["message"] == lovelab.TOO_LONG_REPLY
        assert not fake_openai.filter_calls

    def test_nul_characters_are_removed(self, send, fake_openai):
        # Postgres can't store them, so the message would otherwise fail to be logged
        send("hi\x00 there")
        assert fake_openai.filter_calls[0] == [{"role": "user", "content": "hi there"}]

    def test_message_of_only_nul_characters_is_empty(self, send, fake_openai):
        response = send("\x00\x00")
        assert response.status_code == 400
        assert not fake_openai.filter_calls

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
        assert response.json["message"] in lovelab.OFF_TOPIC_REPLIES
        assert not fake_openai.reply_calls

    def test_off_topic_replies_vary(self, send, fake_openai):
        fake_openai.verdict = "NO"
        replies = {send("What's the weather?").json["message"] for _ in range(30)}
        assert len(replies) > 1

    def test_openai_failure_returns_friendly_error(self, send, fake_openai):
        fake_openai.error = TimeoutError("slow")
        response = send("hello")
        assert response.status_code == 502
        assert response.json["message"] == lovelab.SERVICE_ERROR_REPLY

    @pytest.mark.parametrize("blank", ["", "   \n  "])
    def test_blank_model_reply_asks_to_try_again(self, send, fake_openai, blank):
        # e.g. the model refused, or ran out of tokens while reasoning: never show an empty bubble
        fake_openai.reply = blank
        response = send("My partner never listens")
        assert response.status_code == 502
        assert response.json["message"] == lovelab.SERVICE_ERROR_REPLY
        assert "history" not in response.json

    def test_reply_length_is_capped(self, send, fake_openai):
        send("My partner never listens")
        assert fake_openai.reply_token_caps == [lovelab.REPLY_MAX_TOKENS]

    def test_reply_surrounding_whitespace_is_trimmed(self, send, fake_openai):
        fake_openai.reply = "\n  Some advice.  \n"
        assert send("My partner never listens").json["message"] == "Some advice."

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

    def test_rejected_requests_do_not_use_up_the_limits(self, client, send):
        # Otherwise anyone could exhaust the site-wide daily limit with free, empty requests
        per_minute = int(lovelab.CHAT_RATE_LIMIT.split(" per minute")[0])
        for _ in range(per_minute):
            assert client.post("/", json={"message": "   "}).status_code == 400
            assert client.post("/", data="[1]", content_type="application/json").status_code == 400
            assert send("a" * (lovelab.MAX_MESSAGE_LENGTH + 1)).status_code == 400
        assert send("How do I talk to my partner?").status_code == 200

    def test_failed_replies_still_count(self, send, fake_openai):
        # They reached OpenAI, which may still have cost money
        fake_openai.error = TimeoutError("slow")
        per_minute = int(lovelab.CHAT_RATE_LIMIT.split(" per minute")[0])
        for _ in range(per_minute):
            assert send("hello").status_code == 502
        assert send("hello").status_code == 429


class TestStaticExtras:
    @pytest.mark.parametrize("path, content_type", [("/favicon.ico", "image/"), ("/apple-touch-icon.png", "image/png")])
    def test_root_icons_are_served(self, client, path, content_type):
        response = client.get(path)
        assert response.status_code == 200
        assert response.content_type.startswith(content_type)

    def test_pages_are_compressed(self, client):
        response = client.get("/static/script.js", headers={"Accept-Encoding": "gzip, deflate, br, zstd"})
        assert response.headers.get("Content-Encoding") in ("gzip", "br", "deflate", "zstd")

    def test_chat_replies_are_not_compressed(self, client, send):
        response = send("How do I talk to my partner about chores?", headers={"Accept-Encoding": "gzip"})
        assert response.status_code == 200
        assert "Content-Encoding" not in response.headers


class TestFollowUps:
    """The browser suggests follow-ups (like "Help me see their side") under advice, and nowhere else."""

    ADVICE = "It sounds like you both want the same thing, even if it doesn't feel that way. " * 5

    def test_advice_offers_follow_ups(self, send, fake_openai):
        fake_openai.reply = self.ADVICE
        assert send("My partner and I keep arguing about chores").json["followUps"] is True

    def test_short_replies_do_not(self, send, fake_openai):
        # Usually LoveLab asking what's going on, where follow-ups like "Help me see their side" don't fit
        fake_openai.reply = "Hi! What's been on your mind lately?"
        assert send("hi").json["followUps"] is False

    def test_focused_questions_before_advice_do_not(self, send, fake_openai):
        # Asking about their situation first can run past 300 characters, but it isn't advice yet
        fake_openai.reply = ("That sounds really draining, especially when the same fights keep coming back and "
                             "you can't seem to get past them. I'd like to understand it a little better before "
                             "suggesting anything: what do the fights usually start over, and how do they tend "
                             "to end? Is this something new between you two, or has it been building for a while?")
        assert len(fake_openai.reply) > 300 and len(fake_openai.reply.split()) < lovelab.FOLLOW_UP_MIN_WORDS
        assert send("My partner and I keep fighting").json["followUps"] is False

    def test_off_topic_replies_do_not(self, send, fake_openai):
        fake_openai.verdict = "NO"
        assert send("What's the weather?").json["followUps"] is False

    @pytest.mark.parametrize("resource", ["call or text 988", "call 911", "call 1-800-799-7233",
                                          "visit findahelpline.com"])
    def test_replies_sharing_crisis_resources_do_not(self, send, fake_openai, resource):
        # The focus should stay on getting help
        fake_openai.reply = f"{self.ADVICE} Please {resource} right away."
        assert send("I don't feel safe at home").json["followUps"] is False


def test_crisis_resources_cover_other_countries():
    assert "findahelpline.com" in lovelab.REPLY_INSTRUCTIONS


def test_replies_teach_approaches_rather_than_supply_wording():
    # LoveLab lays out options and teaches approaches; the words people use are their own
    rules = " ".join(lovelab.REPLY_INSTRUCTIONS.lower().split())  # Ignore line wrapping
    assert "never write out words, phrases or quotes" in rules
    assert "never write messages, texts, emails or scripts" in rules


def test_replies_are_personal_short_and_conversational():
    rules = " ".join(lovelab.REPLY_INSTRUCTIONS.lower().split())
    assert "reflect the specific details they've shared" in rules
    assert "ask one or two focused questions about their situation before giving advice" in rules
    assert "usually 80 to 150 words, and never more than 200" in rules
