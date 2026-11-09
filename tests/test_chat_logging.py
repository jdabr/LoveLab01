"""Tests that stored chat logs stay anonymous."""

import datetime

import pytest
from sqlalchemy import event

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
    assert logged_rows()[0].assistant_message in lovelab.OFF_TOPIC_REPLIES


def test_contact_details_are_scrubbed_before_saving(send, fake_openai):
    fake_openai.reply = "Email them at help@example.com"
    send("My number is (555) 123-4567")
    [row] = logged_rows()
    assert row.user_message == "My number is [number]"
    assert row.assistant_message == "Email them at [email]"


def test_messages_are_truncated_to_column_sizes(send, fake_openai):
    fake_openai.reply = "r" * (lovelab.LOGGED_REPLY_CHARS + 50)
    send("u" * lovelab.MAX_MESSAGE_LENGTH)
    [row] = logged_rows()
    assert len(row.user_message) == lovelab.LOGGED_USER_CHARS
    assert len(row.assistant_message) == lovelab.LOGGED_REPLY_CHARS


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


def add_yesterdays_secret():
    yesterday = datetime.datetime.now(datetime.timezone.utc).date() - datetime.timedelta(days=1)
    lovelab.db.session.add(VisitorSalt(day=yesterday, salt="old-secret"))
    lovelab.db.session.commit()


def test_first_message_of_the_day_deletes_yesterdays_secret(send):
    add_yesterdays_secret()
    send("hello")
    assert [salt.day for salt in VisitorSalt.query.all()] == [datetime.datetime.now(datetime.timezone.utc).date()]


def test_any_visit_forgets_yesterdays_secret_from_memory(client):
    lovelab.chat_logger._cached_salt = (datetime.date(2000, 1, 1), "old-secret")
    client.get("/about")
    assert lovelab.chat_logger._cached_salt == (None, None)


def test_yesterdays_secret_is_also_forgotten_from_memory(app):
    lovelab.chat_logger._cached_salt = (datetime.date(2000, 1, 1), "old-secret")
    lovelab.chat_logger.delete_expired_salts()
    assert lovelab.chat_logger._cached_salt == (None, None)


def test_daily_command_deletes_old_secrets_but_keeps_todays(app):
    lovelab.chat_logger.visitor_id("203.0.113.7")  # Creates today's secret
    add_yesterdays_secret()
    result = app.test_cli_runner().invoke(args=["purge-visitor-salts"])
    assert "Deleted 1 expired visitor secret(s)." in result.output
    assert [salt.day for salt in VisitorSalt.query.all()] == [datetime.datetime.now(datetime.timezone.utc).date()]


def test_page_loads_never_touch_the_database(client):
    # So a slow or unavailable database can't slow down or break the site itself
    add_yesterdays_secret()
    statements = []
    listener = lambda *args: statements.append(args[2])  # noqa: E731
    event.listen(lovelab.db.engine, "before_cursor_execute", listener)
    try:
        for path in ["/", "/about", "/static/style.css", "/favicon.ico"]:
            assert client.get(path).status_code == 200
    finally:
        event.remove(lovelab.db.engine, "before_cursor_execute", listener)
    assert statements == []


def test_nul_characters_are_removed_before_saving(send, fake_openai):
    fake_openai.reply = "Some\x00 advice"
    send("hello")
    [row] = logged_rows()
    assert row.assistant_message == "Some advice"


class TestScrubOldLogs:
    """`flask scrub-old-logs` cleans messages that were logged before scrubbing existed."""

    @pytest.fixture
    def old_rows(self, app):
        rows = [
            ChatLog(timestamp=datetime.datetime(2025, 1, 1), user_message="Text me at 555-123-4567",
                    assistant_message="You could email them at sam@example.com"),
            ChatLog(timestamp=datetime.datetime(2025, 1, 2), user_message="Nothing private here",
                    assistant_message="Okay"),
        ]
        lovelab.db.session.add_all(rows)
        lovelab.db.session.commit()
        return rows

    def run(self, app, *args):
        return app.test_cli_runner().invoke(args=["scrub-old-logs", *args])

    def test_scrubs_contact_details_from_old_rows(self, app, old_rows):
        result = self.run(app)
        assert "Scrubbed contact details from 1 of 2 stored messages." in result.output
        first, second = logged_rows()
        assert (first.user_message, first.assistant_message) == ("Text me at [number]",
                                                                  "You could email them at [email]")
        assert (second.user_message, second.assistant_message) == ("Nothing private here", "Okay")

    def test_dry_run_changes_nothing(self, app, old_rows):
        result = self.run(app, "--dry-run")
        assert "1 of 2 stored messages contain contact details and would be scrubbed." in result.output
        assert logged_rows()[0].user_message == "Text me at 555-123-4567"

    def test_running_it_again_changes_nothing(self, app, old_rows):
        self.run(app)
        assert "Scrubbed contact details from 0 of 2 stored messages." in self.run(app).output


def test_visitor_ids_change_when_the_secret_changes(app):
    first = lovelab.chat_logger.visitor_id("203.0.113.7")
    VisitorSalt.query.delete()
    lovelab.db.session.commit()
    lovelab.chat_logger._cached_salt = (None, None)
    assert lovelab.chat_logger.visitor_id("203.0.113.7") != first
