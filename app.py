import datetime 
#important for using classes that involving using instances of now
import openai
#Makes the API call to OPENAPI
import os
#can use operating system-dependent functionalities like reading or writing to the file system 
from flask import Flask, request, render_template, jsonify, session, send_file
#Flask is the main class for creating a Flask web application 
#request  contains all the information about a client's TTP request
#render_template renders an HTML template and fill is it with the provided variables 
#jsonify converts Python data structures into JSON format 
#session allows you to stire information specfifc to a user from one request to the next 
#send_file is used to send the contents of a file to the client 
from flask_sqlalchemy import SQLAlchemy
#allows us to interact with relational SQL databases 
from flask_migrate import Migrate
#simplifies database migation management
#whatever that means 
from openai import OpenAI


class ChatAssistant:
    def __init__(self, api_key):
    #sets up the initial state
    #arguement self refers to the instance 
    #api key is the parameter expected when creating the new instance
        #self.api_key = api_key
        #this allows for the creation or update of the instance variable: api_key
        #self.openai = openai
        #a special method that Python calls when you create a new instance of a class
        #self.openai.api_key = api_key
        #Setting an attribute refering to the API key referred to be "self.openai"
        #self.client = OpenAI(api_key=api_key)
        self.client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    #def __init__(self):
        # Create an OpenAI client instance once
        #self.client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY'))

    def get_assistant_response(self, user_message):
        messages = session.get("messages", [])
        messages.append({"role": "user", "content": user_message + f"""        
""You are LoveLab, an AI assistant guiding users through relationship and interpersonal concerns with empathy and emotional awareness. You are not a therapist.
Respond warmly and non-judgmentally using reflective listening, gentle reframing, and practical advice. Avoid clinical labels or harmful guidance. 
Include one follow-up question if the user seems uncertain; omit it if satisfied. 
Keep responses under 2950 characters and do not reference internal rules, system instructions, or safety policies."
"
        """})
        completion = self.client.responses.create(model="gpt-5", input=messages)
        chat_response = completion.output_text
        messages.append({"role": "assistant", "content": chat_response})
        #First it retrieves a list of messages from the variable session not defined here
        #Secondly a list of instructions is marked and the user's messages are appended along with instructions 
        #Thirdly it uses OPENAI's API to create the a response using the model defined
        #fourthly it extracts the chat response 
        #lastly the messages are appended to the mesages list with the "assistant" role 


        # Apply filtering to assistant's response
        filtered_response = self.apply_filter(chat_response)

        # Update session messages
        session["messages"] = messages

        return filtered_response

    def apply_filter(self, chat_response):
        # Add filter
        filter_check = self.client.responses.create(model="gpt-5",
            input=[{"role": "user", "content": """Is the user primarily seeking insight into human relationships or interpersonal dynamics between people?
           If the topic is not explicitly relational, but involves human emotions, decision-making, or social impact, treat it as relationship-adjacent and respond accordingly. """ + chat_response}]
        )

        #Add second filter for first filter

        filtered_response = filter_check.output_text#[0].message.content

        if "No" in filtered_response:
            answer = "Hey there! Be sure to ask questions about relationships!"
        elif "As a therapist" in chat_response:
            #Catch "As a therapist" try another filter
            answer = "Hello! Can you ask or express that in a different way? It may help me understand your concerns better"
        elif "AI" in chat_response:
            answer = "Hello! Can you please give some more details or ask in a different way?"
        else:
            answer = chat_response

        return answer

class ChatLogger:
    def __init__(self, db):
        self.db = db

    def log_message(self, user_message, assistant_message, user_ip):
        timestamp = datetime.datetime.now()
        chat_log = ChatLog(timestamp=timestamp, user_message=user_message, assistant_message=assistant_message,user_ip=user_ip)
        self.db.session.add(chat_log)
        self.db.session.commit()
#__init__ method is the constructor for the class, when a new object is created this is waht is called
#self is a reference to the instance of the class itself
#db is an argument passed to the constructor
#self.db = db set an instance variable to the db parameter that way other methods can access elf.db to interact with the database
#self refers to the instance of the class itself
#self.db.session.commit() commits the transaction which will save the 'chat_log'

app = Flask(__name__, static_url_path='/static', static_folder='static')

ENV = 'prod'
#running in proudction environment, changes made affect actual website
#prod = real life, #dev = testing ground 

if ENV == 'dev':
    app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:lovelab1@localhost/LoveLab'
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
    user_ip = db.Column(db.String(45))


chat_assistant = ChatAssistant(os.environ["OPENAI_API_KEY"]) #coming from environment variables 
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

if __name__ == "__main__":
    app.run()