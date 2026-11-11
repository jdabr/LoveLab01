"""Run LoveLab locally for design work, with no database server, API key or OpenAI cost.

Uses a throwaway SQLite file and a fake OpenAI client that sends canned replies, and turns off
rate limits. Templates and Python changes reload automatically.

    python dev/preview_server.py          # then open http://127.0.0.1:5000
"""

import os
import sys
import tempfile
import types

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

os.environ.update(
    LOVELAB_ENV="dev",
    DATABASE_URL="sqlite:///" + os.path.join(tempfile.gettempdir(), "lovelab_preview.db").replace("\\", "/"),
    OPENAI_API="sk-preview-not-a-real-key",
    SECRET_KEY="preview-secret-key",
    RATELIMIT_STORAGE_URI="memory://",
)

import app as lovelab  # noqa: E402

SAMPLE_REPLIES = [
    "It sounds like you've been carrying this for a while, and it makes sense that you feel unsure. "
    "When a friend keeps cancelling, it's easy to wonder whether it's about you, but often it's about "
    "what's going on in their life.\n\nOne option is to start by sharing that you've missed them and "
    "asking how they're doing, before mentioning the cancellations. That opens the door without blame. "
    "Another is to wait and see whether it keeps happening.\n\nHow do you think they'd respond if you "
    "checked in with them first?",
    "That's a really thoughtful question. It might help to pick a calm moment, not right after an "
    "argument, and start with how you feel rather than what they did.",
]


class FakeOpenAI:
    """Says every message is on topic and answers with the sample replies in turn."""

    def __init__(self):
        self.responses = self
        self.count = 0

    def with_options(self, **_options):
        return self

    def create(self, model, instructions, input, **_options):
        if instructions == lovelab.FILTER_INSTRUCTIONS:
            return types.SimpleNamespace(output_text="YES")
        reply = SAMPLE_REPLIES[self.count % len(SAMPLE_REPLIES)]
        self.count += 1
        return types.SimpleNamespace(output_text=reply)


lovelab.chat_assistant.client = FakeOpenAI()
lovelab.limiter.enabled = False

with lovelab.app.app_context():
    lovelab.db.create_all()

if __name__ == "__main__":
    lovelab.app.config["TEMPLATES_AUTO_RELOAD"] = True
    lovelab.app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 5000)), debug=True)
