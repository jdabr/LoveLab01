import datetime
import openai
import os
from flask import Flask, request, render_template, jsonify, session
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

class ChatAssistant:
    def __init__(self, api_key):
        self.api_key = api_key
        self.openai = openai
        self.openai.api_key = api_key

    def get_assistant_response(self, user_message):
        messages = session.get("messages", [])
        messages.append({"role": "user", "content": user_message + """ You are now LoveLab, an AI assisted relationship helper. You will respond to the user like a therapist, 
        but do not inform the user you are a therapist. Provide detailed suggestions about your answer to the user's questions or concerns. Do not mention follow up question. 
        Provide a specific follow up question pertaining to the user's question. If the user is satisfied with LoveLab's answer, you do not need to provide a 
        follow up question. You will also not give answers larger than 2950 characters. Do not give unethical advice. Remember the user's message to continue the conversation with them. """})
        completion = self.openai.ChatCompletion.create(model="gpt-3.5-turbo", messages=messages)
        chat_response = completion.choices[0].message.content
        messages.append({"role": "assistant", "content": chat_response})

        # Apply filtering to assistant's response
        filtered_response = self.apply_filter(chat_response)

        # Update session messages
        session["messages"] = messages

        return filtered_response

    def apply_filter(self, chat_response):
        # Add filter
        filter_check = self.openai.ChatCompletion.create(model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": "Does this question have anything to do with human relationships, lovelab, or the followup question? " + chat_response}]
        )

        filtered_response = filter_check.choices[0].message.content

        if "No" in filtered_response:
            answer = "Hey there! Be sure to ask questions about relationships!"
        elif "AI" in chat_response:
            answer = "Can you please give some more details or ask in a different way?"
        else:
            answer = chat_response

        return answer

class ChatLogger:
    def __init__(self, db):
        self.db = db

    def log_message(self, user_message, assistant_message):
        timestamp = datetime.datetime.now()
        chat_log = ChatLog(timestamp=timestamp, user_message=user_message, assistant_message=assistant_message)
        self.db.session.add(chat_log)
        self.db.session.commit()

app = Flask(__name__, static_url_path='/static', static_folder='static')

ENV = 'prod'

if ENV == 'dev':
    app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:password@localhost/loveLab'
else:
    db_uri = os.environ.get('PG_URI')
    app.config['SQLALCHEMY_DATABASE_URI'] = f"postgresql://{db_uri}"

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.secret_key = 'your_secret_key'  # Set a secret key for session
db = SQLAlchemy(app)
migrate = Migrate(app, db)

class ChatLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, nullable=False)
    user_message = db.Column(db.String(255), nullable=False)
    assistant_message = db.Column(db.String(3000), nullable=False)

chat_assistant = ChatAssistant(os.environ.get('OPENAI_API'))
chat_logger = ChatLogger(db)

@app.route("/", methods=["GET", "POST"])
def home():
    if request.method == "GET":
        # Clear previous messages when the page is refreshed
        session.pop("messages", None)

    if "messages" not in session:
        session["messages"] = []

    if request.method == "POST":
        user_message = request.json["message"]
        assistant_message = chat_assistant.get_assistant_response(user_message)
        chat_logger.log_message(user_message, assistant_message)
        return jsonify({"message": assistant_message})

    # Add initial message to the session
    if not session["messages"]:
        initial_message = {
            "role": "system",
            "content": """Welcome to LoveLab, an AI-assisted relationship helper! I'm here to answer your relationship questions and provide guidance.
                          Remember, the more detailed you are, the more accurate my responses will be. Feel free to ask me anything!"""
        }
        session["messages"].append(initial_message)

    return render_template("index.html", messages=session["messages"])

if __name__ == "__main__":
    app.run()