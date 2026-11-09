"""Tests that stored chat logs stay anonymous."""

import datetime

import app as lovelab
from app import ChatLog, VisitorSalt


def logged_rows():
    return ChatLog.query.order_by(ChatLog.id).all()


def test_each_exchange_is_logged(send, fake_openai):
    fake_openai.reply = "advice"
    send("question")
    [row] = logged_rows()
    assert (row.user_message, row.assistant_message) == ("question", "advice")


def test_off_topic_exchanges_are_logged_too(send, fake_openai):
    fake_openai.verdict = "NO"
    send("what's the weather")
    assert logged_rows()[0].assistant_message == lovelab.OFF_TOPIC_REPLY


def test_contact_details_are_scrubbed_before_saving(send, fake_openai):
    fake_openai.reply = "Email them at help@example.com"
    send("My number is (555) 123-4567")
    [row] = logged_rows()
    assert row.user_message == "My number is [number]"
    assert row.assistant_message == "Email them at [email]"


def test_messages_are_truncated_to_column_sizes(send, fake_openai):
    fake_openai.reply = "r" * (lovelab.LOGGED_ASSISTANT_MESSAGE_LENGTH + 50)
    send("u" * lovelab.MAX_MESSAGE_LENGTH)
    [row] = logged_rows()
    assert len(row.user_message) == lovelab.LOGGED_USER_MESSAGE_LENGTH
    assert len(row.assistant_message) == lovelab.LOGGED_ASSISTANT_MESSAGE_LENGTH


def test_ip_address_is_never_stored(send):
    send("hello", environ_base={"REMOTE_ADDR": "203.0.113.7"})
    [row] = logged_rows()
    assert "203.0.113.7" not in str(vars(row))
    assert len(row.visitor_id) == 16


def test_same_visitor_gets_the_same_id_on_the_same_day(send):
    send("one", environ_base={"REMOTE_ADDR": "203.0.113.7"})
    send("two", environ_base={"REMOTE_ADDR": "203.0.113.7"})
    send("three", environ_base={"REMOTE_ADDR": "198.51.100.9"})
    first, second, other = (row.visitor_id for row in logged_rows())
    assert first == second
    assert first != other


def test_real_client_ip_comes_from_the_proxy_header(send):
    send("one", headers={"X-Forwarded-For": "203.0.113.7"})
    send("two", environ_base={"REMOTE_ADDR": "203.0.113.7"})
    first, second = (row.visitor_id for row in logged_rows())
    assert first == second


def test_earlier_days_secrets_are_destroyed(app):
    yesterday = datetime.datetime.now(datetime.timezone.utc).date() - datetime.timedelta(days=1)
    lovelab.db.session.add(VisitorSalt(day=yesterday, salt="old-secret"))
    lovelab.db.session.commit()

    lovelab.chat_logger.visitor_id("203.0.113.7")

    remaining = VisitorSalt.query.all()
    assert [salt.day for salt in remaining] == [yesterday + datetime.timedelta(days=1)]


def test_visitor_ids_change_when_the_secret_changes(app):
    first = lovelab.chat_logger.visitor_id("203.0.113.7")
    VisitorSalt.query.delete()
    lovelab.db.session.commit()
    lovelab.chat_logger._cached_salt = (None, None)
    assert lovelab.chat_logger.visitor_id("203.0.113.7") != first
