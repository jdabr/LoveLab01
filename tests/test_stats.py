"""Tests for what's recorded about each message besides its text, and for the daily summaries."""

import datetime

import pytest

import app as lovelab
from app import ChatLog, DailySummary

ADVICE = "It sounds like you both care about this. One option is to pick a calm moment to talk it through."
STREAM = {"Accept": "application/x-ndjson"}


def only_row():
    [row] = ChatLog.query.all()
    return row


class TestEachMessage:
    def test_answered(self, send, fake_openai):
        fake_openai.reply = ADVICE
        send("My partner and I keep arguing")
        row = only_row()
        assert (row.outcome, row.model, row.crisis_resources) == ("answered", lovelab.OPENAI_MODEL, False)
        assert (row.input_tokens, row.output_tokens) == (40 + 300, 2 + 120)  # The topic check plus the reply
        assert 0 <= row.first_text_ms <= row.reply_ms

    def test_off_topic(self, send, fake_openai):
        fake_openai.verdict = "NO"
        send("What's the weather?")
        row = only_row()
        assert (row.outcome, row.model) == ("off_topic", lovelab.OPENAI_FILTER_MODEL)
        assert (row.input_tokens, row.output_tokens) == (40, 2)
        assert row.assistant_message in lovelab.OFF_TOPIC_REPLIES

    def test_replies_sharing_crisis_resources_are_flagged(self, send, fake_openai):
        fake_openai.reply = "I'm so sorry you're going through this. Please call or text 988 any time."
        send("I don't feel safe at home")
        assert only_row().crisis_resources is True

    def test_a_failed_reply_is_recorded_without_any_text(self, send, fake_openai):
        fake_openai.error = TimeoutError("slow")
        send("My partner and I keep arguing")
        row = only_row()
        assert (row.outcome, row.user_message, row.assistant_message) == ("failed", None, None)
        assert row.visitor_id and row.reply_ms is not None

    def test_streamed_replies_are_recorded_the_same_way(self, client, fake_openai):
        fake_openai.reply = ADVICE
        client.post("/", json={"message": "My partner and I keep arguing"}, headers=STREAM).get_data()
        row = only_row()
        assert (row.outcome, row.input_tokens, row.output_tokens) == ("answered", 340, 122)
        assert row.first_text_ms <= row.reply_ms

    def test_turned_away_requests_are_not_recorded(self, client):
        client.post("/", json={"message": "   "})
        assert ChatLog.query.count() == 0


def add_row(day, outcome, visitor="a", tokens=(100, 50), first_text_ms=800, reply_ms=4000, crisis=False):
    text = outcome in ("answered", "off_topic")
    lovelab.db.session.add(ChatLog(
        timestamp=datetime.datetime.combine(day, datetime.time(12)), visitor_id=visitor,
        user_message="hi" if text else None, assistant_message="hello" if text else None,
        outcome=outcome, model="model", input_tokens=tokens[0], output_tokens=tokens[1],
        first_text_ms=first_text_ms, reply_ms=reply_ms, crisis_resources=crisis,
    ))


class TestDailySummary:
    @pytest.fixture
    def today(self, app):
        return datetime.datetime.now(datetime.timezone.utc).date()

    def summarize(self, app):
        return app.test_cli_runner().invoke(args=["summarize-days"]).output

    def test_totals_for_a_finished_day(self, app, today):
        yesterday = today - datetime.timedelta(days=1)
        add_row(yesterday, "answered", visitor="a", first_text_ms=500, reply_ms=3000)
        add_row(yesterday, "answered", visitor="a", first_text_ms=700, reply_ms=5000, crisis=True)
        add_row(yesterday, "off_topic", visitor="b")
        add_row(yesterday, "failed", visitor="c", tokens=(40, 2))
        add_row(yesterday, "abandoned", visitor="c")
        add_row(today, "answered", visitor="d")  # Today hasn't finished yet
        lovelab.db.session.commit()

        assert "Summarized 1 day(s)." in self.summarize(app)
        [summary] = DailySummary.query.all()
        assert summary.day == yesterday
        assert (summary.messages, summary.visitors) == (5, 3)
        assert (summary.answered, summary.off_topic, summary.failed, summary.abandoned) == (2, 1, 1, 1)
        assert summary.crisis_replies == 1
        assert (summary.input_tokens, summary.output_tokens) == (440, 202)
        assert (summary.avg_first_text_ms, summary.avg_reply_ms) == (600, 4000)  # Answered messages only

    def test_running_it_again_gives_the_same_totals(self, app, today):
        add_row(today - datetime.timedelta(days=1), "answered")
        lovelab.db.session.commit()
        self.summarize(app)
        self.summarize(app)
        [summary] = DailySummary.query.all()
        assert summary.messages == 1

    def test_logs_from_before_tracking_are_left_out(self, app, today):
        add_row(today - datetime.timedelta(days=1), None)
        lovelab.db.session.commit()
        assert "Summarized 0 day(s)." in self.summarize(app)

    def test_each_day_gets_its_own_summary(self, app, today):
        for days_ago in (3, 1):
            add_row(today - datetime.timedelta(days=days_ago), "answered")
        lovelab.db.session.commit()
        self.summarize(app)
        assert sorted(s.day for s in DailySummary.query.all()) == [today - datetime.timedelta(days=3),
                                                                   today - datetime.timedelta(days=1)]

    def test_the_first_message_of_a_day_summarizes_earlier_days(self, send, today):
        add_row(today - datetime.timedelta(days=1), "answered")
        lovelab.db.session.commit()
        send("hello")
        assert [s.day for s in DailySummary.query.all()] == [today - datetime.timedelta(days=1)]

    def test_summaries_hold_no_messages_or_visitor_ids(self):
        columns = set(DailySummary.__table__.columns.keys())
        assert not columns & {"user_message", "assistant_message", "visitor_id"}
