"""Tests that production forces HTTPS (redirect + HSTS) and local development doesn't."""

import pytest

import app as lovelab

HTTPS = {"X-Forwarded-Proto": "https"}  # What Heroku's router sends for an HTTPS visit


@pytest.fixture
def production(monkeypatch):
    monkeypatch.setattr(lovelab, "ENFORCE_HTTPS", True)


class TestProduction:
    def test_page_over_http_is_permanently_redirected_to_https(self, client, production):
        response = client.get("/about?x=1", base_url="http://www.lovelab.app")
        assert response.status_code == 301
        assert response.headers["Location"] == "https://www.lovelab.app/about?x=1"

    def test_message_over_http_is_redirected_without_being_processed(self, client, production, fake_openai):
        response = client.post("/", json={"message": "hello"}, base_url="http://www.lovelab.app")
        assert response.status_code == 308  # Keeps it a POST, so the browser can resend it over HTTPS
        assert response.headers["Location"] == "https://www.lovelab.app/"
        assert not fake_openai.filter_calls

    def test_https_requests_are_served_with_hsts(self, client, production):
        response = client.get("/", headers=HTTPS)
        assert response.status_code == 200
        assert response.headers["Strict-Transport-Security"] == lovelab.HSTS_HEADER

    def test_chat_works_over_https(self, client, production):
        response = client.post("/", json={"message": "hello"}, headers=HTTPS)
        assert response.status_code == 200

    def test_static_files_are_redirected_too(self, client, production):
        response = client.get("/static/style.css", base_url="http://www.lovelab.app")
        assert response.status_code == 301


class TestLocalDevelopment:
    def test_http_is_allowed(self, client):
        assert client.get("/").status_code == 200

    def test_no_hsts_header(self, client):
        assert "Strict-Transport-Security" not in client.get("/").headers


def test_production_enforces_https_by_default():
    # The tests run with LOVELAB_ENV=dev; anything else (including unset) means production
    assert lovelab.ENFORCE_HTTPS is (lovelab.ENV != "dev")
