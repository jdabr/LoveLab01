#Flask is the main class for creating a Flask web application 
#request  contains all the information about a client's TTP request
#render_template renders an HTML template and fill is it with the provided variables 
#jsonify converts Python data structures into JSON format 
#session allows you to stire information specfifc to a user from one request to the next 
#send_file is used to send the contents of a file to the client 

import datetime 
import openai
import os
from flask import Flask, request, render_template, jsonify, session, send_file
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from openai import OpenAI
from dotenv import load_dotenv

# Load variables from a local .env file (no-op in production where it doesn't exist)
load_dotenv()

#sets up the initial state
#arguement self refers to the instance 
#api key is the parameter expected when creating the new instance

class ChatAssistant:
    def __init__(self, api_key):
        self.client = OpenAI(api_key=api_key)

    def get_assistant_response(self, user_message):
        # Filter user message before sending to model, saving unnecessary API calls
        filtered_input = self.apply_filter(user_message)
        if filtered_input != user_message:
            return filtered_input

        # Retrieve conversation history from session
        messages = session.get("messages", [])
        messages.append({"role": "user", "content": user_message})

        # Send message to model with system prompt as instructions
        completion = self.client.responses.create(
            model="o4-mini",
            instructions="""You are LoveLab, an empathetic AI assistant helping users navigate 
            personal relationships and interpersonal dynamics. Respond warmly and without judgment, 
            using reflective listening before offering advice. Gently reframe negative thought patterns 
            and offer practical, grounded guidance. Ask one thoughtful follow-up question if the user 
            seems uncertain. Never use clinical labels or harmful guidance. Keep responses under 250 words.""",
            input=messages
        )

        chat_response = completion.output_text

        # Save updated conversation history to session
        messages.append({"role": "assistant", "content": chat_response})
        session["messages"] = messages

        return chat_response

    def apply_filter(self, chat_response):
        if "as a therapist" in chat_response.lower():
            return "Hello! Can you ask or express that in a different way? It may help me understand your concerns better."

        if "AI" in chat_response or "language model" in chat_response.lower():
            return "Hello! Can you please give some more details or ask in a different way?"

        filter_check = self.client.responses.create(
            model="o4-mini",
            input=[{
                "role": "user",
                "content": f"Is the user primarily seeking insight into human relationships or interpersonal dynamics between people? Answer only Yes or No.\n\nMessage: {chat_response}"
            }]
        )

        filtered_response = filter_check.output_text.strip()

        if filtered_response.startswith("No"):
            answer = "Hey there! Be sure to ask questions about relationships!"
        else:
            answer = chat_response

        return answer

#__init__ method is the constructor for the class, when a new object is created this is what is called
#self is a reference to the instance of the class itself
#db is an argument passed to the constructor
#self.db = db set an instance variable to the db parameter that way other methods can access elf.db to interact with the database
#self refers to the instance of the class itself
#self.db.session.commit() commits the transaction which will save the 'chat_log'

class ChatLogger:
    def __init__(self, db):
        self.db = db

    def log_message(self, user_message, assistant_message, user_ip):
        timestamp = datetime.datetime.now()
        chat_log = ChatLog(timestamp=timestamp, user_message=user_message, assistant_message=assistant_message,user_ip=user_ip)
        self.db.session.add(chat_log)
        self.db.session.commit()

app = Flask(__name__, static_url_path='/static', static_folder='static')

#running in proudction environment, changes made affect actual website
#prod = real life, #dev = testing ground 

#set LOVELAB_ENV=dev in your local .env file; defaults to prod so deployments are unaffected
ENV = os.environ.get('LOVELAB_ENV', 'prod')

if ENV == 'dev':
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
        'DATABASE_URL', 'postgresql://postgres:lovelab1@localhost/LoveLab')
else:
    db_uri = os.environ.get('PG_URI')
    app.config['SQLALCHEMY_DATABASE_URI'] = f"postgresql://{db_uri}"

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.secret_key = os.environ.get('SECRET_KEY', 'your_secret_key')  # Set a secret key for session
db = SQLAlchemy(app)
migrate = Migrate(app, db)

class ChatLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, nullable=False)
    user_message = db.Column(db.String(255), nullable=False)
    assistant_message = db.Column(db.String(3000), nullable=False)
    user_ip = db.Column(db.String(45))


if not os.environ.get("OPENAI_API"):
    raise RuntimeError("OPENAI_API environment variable is not set (add it to your .env file for local development)")

chat_assistant = ChatAssistant(os.environ["OPENAI_API"]) #coming from environment variables
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
        user_ip = request.environ.get("HTTP_X_REAL_IP", request.remote_addr)
        chat_logger.log_message(user_message, assistant_message,user_ip)
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

@app.route("/about")
def about():
    return render_template("about.html")

if __name__ == "__main__":
    app.run(debug=True)