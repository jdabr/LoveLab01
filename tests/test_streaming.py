"""Tests for streamed replies: when the browser asks, the reply is sent as it's written."""

import json

import pytest

import app as lovelab
from app import ChatLog

STREAM = {"Accept": "application/x-ndjson"}
ADVICE = "It sounds like you both care about this. One option is to pick a calm moment to talk it through."


def stream(client, message, history=None, **headers):
    response = client.post("/", json={"message": message, "history": history}, headers={**STREAM, **headers})
    lines = [json.loads(line) for line in response.get_data(as_text=True).splitlines() if line.strip()]
    return response, lines


def test_reply_arrives_in_pieces_then_finishes(client, fake_openai):
    fake_openai.reply = ADVICE
    response, lines = stream(client, "My partner and I keep arguing")
    assert response.status_code == 200
    assert response.mimetype == "application/x-ndjson"
    *pieces, finished = lines
    assert len(pieces) > 1 and all(list(piece) == ["text"] for piece in pieces)
    assert "".join(piece["text"] for piece in pieces) == ADVICE
    assert finished["message"] == ADVICE
    assert isinstance(finished["history"], str) and "followUps" in finished


def test_history_token_carries_on_to_the_next_message(client, fake_openai):
    _, lines = stream(client, "My partner and I keep arguing")
    stream(client, "What could I do?", history=lines[-1]["history"])
    assert [m["role"] for m in fake_openai.reply_calls[-1]] == ["user", "assistant", "user"]


def test_finished_replies_are_logged(client, fake_openai):
    fake_openai.reply = ADVICE
    stream(client, "My partner and I keep arguing")
    [row] = ChatLog.query.all()
    assert row.assistant_message == ADVICE and row.visitor_id


def test_off_topic_reply_is_a_single_finished_line(client, fake_openai):
    fake_openai.verdict = "NO"
    _, lines = stream(client, "What's the weather?")
    assert len(lines) == 1 and lines[0]["message"] in lovelab.OFF_TOPIC_REPLIES


def test_failure_before_any_text_is_a_normal_error(client, fake_openai):
    fake_openai.error = TimeoutError("slow")
    response, _ = stream(client, "hello")
    assert response.status_code == 502
    assert response.json["message"] == lovelab.SERVICE_ERROR_REPLY


@pytest.mark.parametrize("blank", ["", "   \n  "])
def test_blank_reply_is_a_normal_error(client, fake_openai, blank):
    fake_openai.reply = blank
    response, _ = stream(client, "hello")
    assert response.status_code == 502


def test_failure_partway_ends_with_an_error_and_is_not_logged(client, fake_openai):
    fake_openai.reply = ADVICE
    fake_openai.fail_midway = TimeoutError("connection dropped")
    response, lines = stream(client, "My partner and I keep arguing")
    assert response.status_code == 200  # The reply had already started
    assert lines[0] == {"text": "It "}
    assert lines[-1] == {"error": lovelab.SERVICE_ERROR_REPLY}
    assert ChatLog.query.count() == 0


def test_leaving_partway_stops_the_model(client, fake_openai):
    fake_openai.reply = ADVICE
    response = client.post("/", json={"message": "hello"}, headers=STREAM, buffered=False)
    next(iter(response.response))  # The first piece arrives...
    response.close()  # ...then the visitor closes the page
    assert fake_openai.streams[-1].closed
    assert ChatLog.query.count() == 0


def test_streamed_replies_are_not_compressed(client, fake_openai):
    # They mix the visitor's own text with their signed history (the BREACH attack; see app.py)
    response, _ = stream(client, "hello", **{"Accept-Encoding": "gzip, deflate, br, zstd"})
    assert "Content-Encoding" not in response.headers


def test_streamed_requests_count_toward_rate_limits(client, fake_openai):
    lovelab.limiter.enabled = True
    lovelab.limiter.reset()
    try:
        per_minute = int(lovelab.CHAT_RATE_LIMIT.split(" per minute")[0])
        for _ in range(per_minute):
            assert stream(client, "hello")[0].status_code == 200
        assert stream(client, "hello")[0].status_code == 429
    finally:
        lovelab.limiter.reset()
        lovelab.limiter.enabled = False


def test_without_asking_to_stream_the_reply_is_plain_json(send):
    assert send("hello").mimetype == "application/json"
