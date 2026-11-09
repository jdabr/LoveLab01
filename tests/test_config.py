"""Tests for choosing the database from environment variables."""

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
