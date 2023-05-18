import datetime
import openai
from flask import Flask, request, render_template, jsonify
import pymysql.cursors


app = Flask(__name__, static_url_path='/static', static_folder='static')
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
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Connect to the database
    connection = pymysql.connect(
        host='localhost',
        user='root',
        password='password',
        database='messages',
        cursorclass=pymysql.cursors.DictCursor
    )

    try:
        with connection.cursor() as cursor:
            # Insert the user message
            sql = "INSERT INTO chat_log (timestamp, role, content) VALUES (%s, %s, %s)"
            cursor.execute(sql, (timestamp, "user", user_message))

            # Insert the assistant message
            sql = "INSERT INTO chat_log (timestamp, role, content) VALUES (%s, %s, %s)"
            cursor.execute(sql, (timestamp, "assistant", assistant_message))

        # Commit the changes
        connection.commit()

    finally:
        # Close the connection
        connection.close()

if __name__ == "__main__":
    app.run()