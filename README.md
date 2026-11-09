# LoveLab

An AI relationship-advice chat built with Flask and the OpenAI API. Talk through situations with a
partner, family, friends or coworkers and get warm, practical guidance, with no account needed.

**Live site:** [lovelab.app](https://www.lovelab.app)

![LoveLab on desktop](docs/screenshot-desktop.png)

<p align="center">
  <img src="docs/screenshot-mobile.png" alt="LoveLab on a phone" width="260">
  &nbsp;&nbsp;
  <img src="docs/screenshot-dark.png" alt="LoveLab in dark mode" width="520">
</p>

## Features

- **Chats organized by person.** Keep separate conversations about each person in your life.
- **Private by design.** No accounts, no cookies, and chats stay on your device unless you choose
  to remember them. Stored logs are anonymized.
- **Focused and safe.** Off-topic requests are gently declined, and messages about danger or
  self-harm always get a caring reply with crisis resources.
- **Responsive.** Works on phones and large monitors, in light and dark mode.

## Tech stack

Python, Flask, SQLAlchemy, PostgreSQL, the OpenAI Responses API, plain HTML/CSS/JavaScript,
pytest, and Heroku.

## Running locally

Requires Python 3.11+.

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
python dev/preview_server.py       # http://127.0.0.1:5000, with canned AI replies
```

To run tests: `python -m pytest`

## License

Copyright © 2026 Sol Innovation. All rights reserved.

This source code is public so it can be viewed and reviewed. No license is granted to copy, modify,
distribute or reuse it, in whole or in part, without written permission.
