"""Open LoveLab in browser windows that reload whenever a file in static/ or templates/ changes.

Start dev/preview_server.py first, then:

    python dev/live_preview.py [screenshot_dir]

Two windows open: a desktop window whose page resizes with the window (maximize it to see the
full-screen layout) and a phone-sized window. After every reload, a hidden browser also saves
screenshots at common screen sizes, light and dark, empty and mid-conversation, to screenshot_dir
(default: dev/screenshots). Close a window or press Ctrl+C to stop.
"""

import pathlib
import re
import sys
import time

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = "http://127.0.0.1:5000/"
WATCHED = [ROOT / "static", ROOT / "templates"]
SCREENSHOT_DIR = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dev" / "screenshots"

MOBILE = {"width": 390, "height": 844}
SCREENSHOT_SIZES = {
    "laptop": {"width": 1366, "height": 768},
    "fullhd": {"width": 1920, "height": 1080},
    "qhd": {"width": 2560, "height": 1440},
    "mobile": MOBILE,
}
SAMPLE_MESSAGES = [
    "My best friend keeps cancelling plans and I don't know if I should say something.",
    "How do I bring it up without starting a fight?",
]


def terms_version():
    """Read the current terms version so the preview can skip the terms modal."""
    match = re.search(r"static VERSION = '([^']+)'", (ROOT / "static" / "script.js").read_text(encoding="utf-8-sig"))
    return match.group(1) if match else ""


def new_page(browser, **context_options):
    context = browser.new_context(**context_options)
    # Skip the terms modal, and start each reload with an empty conversation so the sample
    # conversation doesn't pile up (the site keeps the conversation across refreshes)
    context.add_init_script(
        f"try {{ localStorage.setItem('termsAccepted', '{terms_version()}'); sessionStorage.clear(); }} catch (e) {{}}"
    )
    return context.new_page()


def snapshot_of_files():
    return {path: path.stat().st_mtime for folder in WATCHED for path in folder.rglob("*") if path.is_file()}


def open_page(page, retries=20):
    """Load the page, retrying while the dev server restarts."""
    for _ in range(retries):
        try:
            page.goto(URL, wait_until="networkidle")
            return True
        except PlaywrightError:
            time.sleep(0.5)
    return False


def set_theme(page, theme):
    page.evaluate("t => { localStorage.setItem('theme', t); document.documentElement.setAttribute('data-theme', t); }", theme)
    page.wait_for_timeout(450)  # Let the CSS colour transitions finish before screenshotting


def have_conversation(page):
    for message in SAMPLE_MESSAGES:
        replies = page.locator(".assistant-message:not(.thinking-message)").count()
        page.fill("#input-message", message)
        page.click("#chat-form [type=submit]")
        page.wait_for_function(
            "n => document.querySelectorAll('.assistant-message:not(.thinking-message)').length > n",
            arg=replies, timeout=10000,
        )


def reload_visible(pages):
    """Reload the windows you're watching and replay the sample conversation."""
    for name, page in pages.items():
        if page.is_closed() or not open_page(page):
            continue
        try:
            have_conversation(page)
        except PlaywrightError as error:
            print(f"[{name}] sample conversation failed: {error}")


def take_screenshots(pages):
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    for name, page in pages.items():
        if not open_page(page):
            print(f"[{name}] server not reachable at {URL}")
            continue
        for theme in ("light", "dark"):
            set_theme(page, theme)
            page.screenshot(path=SCREENSHOT_DIR / f"{name}-{theme}-empty.png")
        try:
            have_conversation(page)
        except PlaywrightError as error:
            print(f"[{name}] sample conversation failed: {error}")
        for theme in ("light", "dark"):
            set_theme(page, theme)
            page.screenshot(path=SCREENSHOT_DIR / f"{name}-{theme}-chat.png")


def refresh(visible, hidden):
    reload_visible(visible)
    take_screenshots(hidden)
    print(f"{time.strftime('%H:%M:%S')} reloaded; screenshots in {SCREENSHOT_DIR}", flush=True)


def main():
    with sync_playwright() as playwright:
        window_browser = playwright.chromium.launch(headless=False)
        visible = {
            # no_viewport: the page follows the window's size, so maximizing shows the full-screen layout
            "desktop": new_page(window_browser, no_viewport=True),
            "mobile": new_page(window_browser, viewport=MOBILE, is_mobile=True, has_touch=True),
        }

        screenshot_browser = playwright.chromium.launch()
        hidden = {
            name: new_page(screenshot_browser, viewport=size, is_mobile=name == "mobile", has_touch=name == "mobile")
            for name, size in SCREENSHOT_SIZES.items()
        }

        refresh(visible, hidden)
        last_seen = snapshot_of_files()
        try:
            while all(not page.is_closed() for page in visible.values()):
                time.sleep(0.5)
                if snapshot_of_files() != last_seen:
                    time.sleep(0.3)  # Let the editor finish writing
                    last_seen = snapshot_of_files()
                    refresh(visible, hidden)
        except KeyboardInterrupt:
            pass
        finally:
            window_browser.close()
            screenshot_browser.close()


if __name__ == "__main__":
    main()
