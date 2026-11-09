"""Tests for configuration read from environment variables: the database and the secret key."""

import pytest

import app as lovelab


@pytest.fixture
def prod(monkeypatch):
    monkeypatch.setattr(lovelab, "ENV", "prod")
    monkeypatch.delenv("PG_URI", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    return monkeypatch


def test_pg_uri_takes_priority(prod):
    prod.setenv("PG_URI", "user:pw@host:5432/db")
    prod.setenv("DATABASE_URL", "postgres://other")
    assert lovelab.database_uri() == "postgresql://user:pw@host:5432/db"


def test_heroku_postgres_scheme_is_fixed(prod):
    prod.setenv("DATABASE_URL", "postgres://user:pw@host:5432/db")
    assert lovelab.database_uri() == "postgresql://user:pw@host:5432/db"


def test_missing_database_fails_loudly(prod):
    with pytest.raises(RuntimeError, match="No database configured"):
        lovelab.database_uri()


def test_dev_uses_database_url(monkeypatch):
    monkeypatch.setattr(lovelab, "ENV", "dev")
    monkeypatch.setenv("DATABASE_URL", "postgresql://local/db")
    assert lovelab.database_uri() == "postgresql://local/db"


class TestSecretKey:
    @pytest.mark.parametrize("value", [None, "", "your_secret_key", "change-me", "too-short"])
    def test_production_refuses_a_missing_or_weak_key(self, prod, value):
        if value is None:
            prod.delenv("SECRET_KEY", raising=False)
        else:
            prod.setenv("SECRET_KEY", value)
        with pytest.raises(RuntimeError, match="SECRET_KEY must be set"):
            lovelab.secret_key()

    def test_production_uses_a_real_key(self, prod):
        prod.setenv("SECRET_KEY", "f" * 64)
        assert lovelab.secret_key() == "f" * 64

    def test_dev_without_a_key_gets_a_random_one(self, monkeypatch):
        monkeypatch.setattr(lovelab, "ENV", "dev")
        monkeypatch.delenv("SECRET_KEY", raising=False)
        first, second = lovelab.secret_key(), lovelab.secret_key()
        assert len(first) == 64 and first != second
