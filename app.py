import datetime
import openai
import os
from flask import Flask, request, render_template, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate


app = Flask(__name__, static_url_path='/static', static_folder='static')

ENV = 'prod'

if ENV == 'dev':
    app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:password@localhost/loveLab'

else:
    app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://cjdhnauiqyworu:f729fbd00f5d4fc6072dbfe47361bc225fc35a2a984662ad47770d19022980da@ec2-3-232-103-50.compute-1.amazonaws.com:5432/d4cofq8s9810n9'

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)
migrate = Migrate(app, db)

class ChatLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, nullable=False)
    user_message = db.Column(db.String(255), nullable=False)
    assistant_message = db.Column(db.String(255), nullable=False)


openai.api_key = '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'


@app.route("/", methods=["GET", "POST"])
def home():
    messages = [{"role": "system", "content": "LoveLab is an AI-Assisted application and is here to answer your relationship questions! The more detailed you are with me, the more accurate my responses will be!"}]

    if request.method == "POST":
        user_message = request.json["message"]
        assistant_message = get_assistant_response(user_message, messages)
        log_message(user_message, assistant_message)
        return jsonify({"message": assistant_message})

    return render_template("index.html", messages=messages)

def get_assistant_response(user_message, messages):
    messages.append({"role": "user", "content": user_message + " You are now LoveLab, an AI powered relationship helper. Respond to the user like a therapist, but do not inform the user you are a therapist"})
    completion = openai.ChatCompletion.create(model="gpt-3.5-turbo", messages=messages)
    chat_response = completion.choices[0].message.content
    messages.append({"role": "assistant", "content": chat_response})

    # Add filter
    filter_check = openai.ChatCompletion.create(model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": "Does this question have anything to do with human relationships? " + chat_response}]
    )

    filtered_response = filter_check.choices[0].message.content

    if "No" in filtered_response:
        answer = "Hey there! Be sure to ask questions about relationships!"
    elif "AI" in chat_response:
        answer = "Can you please give some more details?"
    else:
        answer = chat_response

    return answer

def log_message(user_message, assistant_message):
    timestamp = datetime.datetime.now()
    chat_log = ChatLog(timestamp=timestamp, user_message=user_message, assistant_message=assistant_message)
    db.session.add(chat_log)
    db.session.commit()

if __name__ == "__main__":
    app.run()