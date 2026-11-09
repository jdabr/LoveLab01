"""Tests for "Remember this chat on this device", which controls how long the session cookie lasts."""

import pytest

import app as lovelab


def session_cookie_header(response):
    return next(h for h in response.headers.getlist("Set-Cookie") if h.startswith("session="))


def set_remember(client, value):
    return client.post("/preferences", json={"remember": value})


def test_remember_on_makes_the_cookie_last_for_the_remember_period(client):
    response = set_remember(client, True)
    assert response.status_code == 200
    assert response.json == {"remember": True}
    assert "Expires=" in session_cookie_header(response)
    assert lovelab.app.config["PERMANENT_SESSION_LIFETIME"].days == lovelab.REMEMBER_DAYS


def test_remember_off_makes_the_cookie_end_with_the_browser(client):
    set_remember(client, True)
    response = set_remember(client, False)
    assert response.status_code == 200
    assert "Expires=" not in session_cookie_header(response)


def test_cookie_is_temporary_by_default(send):
    response = send("hello")
    assert "Expires=" not in session_cookie_header(response)


def test_remembered_setting_sticks_for_later_messages(client, send):
    set_remember(client, True)
    response = send("hello")
    assert "Expires=" in session_cookie_header(response)


def test_changing_the_setting_keeps_the_conversation(client, send, fake_openai):
    send("first")
    set_remember(client, True)
    send("second")
    assert fake_openai.reply_calls[-1][0] == {"role": "user", "content": "first"}


@pytest.mark.parametrize("payload", [{}, {"remember": "yes"}, {"remember": 1}, {"remember": None}])
def test_rejects_anything_but_true_or_false(client, payload):
    assert client.post("/preferences", json=payload).status_code == 400


def test_rejects_non_json(client):
    # A cross-site form can't send JSON, so this also blocks other sites from changing the setting
    response = client.post("/preferences", data="remember=true", content_type="application/x-www-form-urlencoded")
    assert response.status_code == 400


class TestDeleteChat:
    def test_erases_the_ai_memory_immediately(self, client, send):
        send("something private")
        response = client.delete("/conversation")
        assert response.status_code == 200
        with client.session_transaction() as sess:
            assert "messages" not in sess

    def test_next_message_starts_fresh(self, client, send, fake_openai):
        send("something private")
        client.delete("/conversation")
        send("hello again")
        assert fake_openai.reply_calls[-1] == [{"role": "user", "content": "hello again"}]

    def test_keeps_the_remember_setting(self, client, send):
        set_remember(client, True)
        send("something private")
        response = client.delete("/conversation")
        assert "Expires=" in session_cookie_header(response)

    def test_works_with_nothing_to_delete(self, client):
        assert client.delete("/conversation").status_code == 200

    def test_only_accepts_delete(self, client):
        assert client.post("/conversation").status_code == 405
        assert client.get("/conversation").status_code == 405

    def test_page_has_the_button(self, client):
        assert b'id="delete-chat"' in client.get("/").data


def test_page_shows_the_switch_and_remember_period(client):
    html = client.get("/").data.decode()
    assert 'id="remember-chat"' in html
    assert f'data-remember-days="{lovelab.REMEMBER_DAYS}"' in html
