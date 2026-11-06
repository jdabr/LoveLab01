"""Helpers that keep stored chat logs anonymous."""

import re

# Order matters: links and emails are replaced before handles and numbers so their parts aren't matched twice
_LINK = re.compile(r"\b(?:https?://|www\.)\S+", re.IGNORECASE)
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_HANDLE = re.compile(r"(?<![\w@])@[A-Za-z0-9_.]{2,30}")
# A run of digits that may contain spaces, dots, dashes or parentheses (e.g. "(555) 123-4567")
_NUMBER_RUN = re.compile(r"\+?\(?\d[\d\s().-]{5,}\d")
# Dates such as 2026-11-06 or 11/06/2026 are left alone
_DATE = re.compile(r"\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}")


def _replace_number(match):
    text = match.group(0)
    digit_count = sum(ch.isdigit() for ch in text)
    # Fewer than 7 digits is too short to be a phone, ID or card number (ages, years, counts)
    if digit_count < 7 or _DATE.fullmatch(text.strip()):
        return text
    return "[number]"


def scrub_contact_details(text):
    """Replace emails, phone/ID/card numbers, links and @handles with placeholders.

    Names and other free-text details can't be removed reliably, so this only targets
    the most directly identifying contact details.
    """
    text = _LINK.sub("[link]", text)
    text = _EMAIL.sub("[email]", text)
    text = _HANDLE.sub("[handle]", text)
    text = _NUMBER_RUN.sub(_replace_number, text)
    return text
