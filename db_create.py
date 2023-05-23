def test_connection(self):
    with app.app_context():
        from app import db
        db.create_all()