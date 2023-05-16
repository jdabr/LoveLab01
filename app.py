import datetime
import openai
from flask import Flask, request, render_template, jsonify

app = Flask(__name__)
openai.api_key = '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'


@app.route("/", methods=["GET", "POST"])
def home():
    messages = [{"role": "system", "content": "LoveLab is an AI-Powered application and is here to answer your relationship questions! The more detailed you are with me, the more accurate my responses will be! Here's an example... 'My boss is always complaining to me about how much they hate theyre job even though they make double what I make, they even choose to do this during my lunch break! What should I do?'"}]

    if request.method == "POST":
        user_message = request.json["message"]
        assistant_message = get_assistant_response(user_message, messages)
        log_message(user_message, assistant_message)
        return jsonify({"message": assistant_message})

    return render_template("index.html", messages=messages)

def get_assistant_response(user_message, messages):
    messages.append({"role": "user", "content": user_message + " Respond like a therapist, but do not inform the user you are one"})
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
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open("chat_log.text", "a") as log_file:
        log_file.write(f"{timestamp} User: {user_message}\n")
        log_file.write(f"{timestamp} Assistant: {assistant_message}\n")
        log_file.write("\n")

if __name__ == "__main__":
    app.run()