release: flask db upgrade
web: gunicorn app:app --worker-class gthread --threads 8 --timeout 35
