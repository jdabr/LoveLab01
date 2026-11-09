"""Tests for scrub_contact_details, which removes identifying details from stored logs."""

import pytest

from privacy import scrub_contact_details


@pytest.mark.parametrize("text, expected", [
    ("Email me at jo.smith+test@mail.example.co.uk", "Email me at [email]"),
    ("See https://example.com/profile?id=1 now", "See [link] now"),
    ("Or www.example.com", "Or [link]"),
    ("Follow @jo_smith99 on insta", "Follow [handle] on insta"),
    ("Call (555) 123-4567", "Call [number]"),
    ("Call +1 555.123.4567", "Call [number]"),
    ("Card 4111 1111 1111 1111", "Card [number]"),
])
def test_contact_details_are_replaced(text, expected):
    assert scrub_contact_details(text) == expected


@pytest.mark.parametrize("text", [
    "I'm 25 and she's 27",
    "We met in 2019 and married 2021",
    "Our anniversary is 2026-11-06",
    "Or maybe 11/06/2026",
    "He owes me 12345",
    "Meet at 10:30",
    "No contact details here at all",
])
def test_ordinary_text_is_left_alone(text):
    assert scrub_contact_details(text) == text


def test_email_is_not_also_matched_as_a_handle():
    assert scrub_contact_details("bob@example.com") == "[email]"


def test_several_details_in_one_message():
    text = "Text 555-123-4567 or email a@b.com, I'm @alex"
    assert scrub_contact_details(text) == "Text [number] or email [email], I'm [handle]"
