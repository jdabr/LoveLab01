    // Wait for the HTML document to finish loading
    document.addEventListener('DOMContentLoaded', function () {
    // Get references to the necessary DOM elements
    var messageContainer = document.getElementById('message-container');
    var form = document.getElementById('chat-form');
    var inputMessage = document.getElementById('input-message');
    var messageLog = []; // Array to store the message log



    // Handle form submission event
    form.addEventListener('submit', function (e) {
        e.preventDefault(); // Prevent the form from being submitted and the page from refreshing

        // Check if the terms checkbox is selected
        var termsCheckbox = document.getElementById('terms');
        if (!termsCheckbox.checked) {
            alert('Please agree to the terms and conditions to continue using the app.');
            return;
        }

        // Get the trimmed value of the user's message from the input field
        var userMessage = inputMessage.value.trim();

        // Check if the user's message is empty
        if (userMessage === '') {
            return; // Exit the function if the message is empty
        }

        // Add the user's message to the chat container and log
        addMessage('user', userMessage);
        messageLog.push({ role: 'user', content: userMessage });

        // Display the "Thinking..." message
        addThinkingMessage();

        // Send the user's message to the server for processing
        sendMessage(userMessage);

        // Clear the input field
        inputMessage.value = '';
    });

    // Get references to the terms button and terms text
    var termsButton = document.getElementById('terms-button');
    var termsText = document.getElementById('terms-text');

    // Add a click event listener to the terms button
    termsButton.addEventListener('click', function () {
        // Toggle the display of the terms text
        if (termsText.style.display === 'none') {
            termsText.style.display = 'block';
        } else {
            termsText.style.display = 'none';
        }
    });

    // Function to add a message to the chat container
    function addMessage(role, content) {
        // Create a new <div> element for the message
        var message = document.createElement('div');
        message.className = 'message';
        message.classList.add(role === 'user' ? 'user-message' : 'assistant-message');
        message.innerText = content;

        // Append the message to the message container
        messageContainer.appendChild(message);

        // Scroll to the bottom of the message container to show the latest message
        messageContainer.scrollTop = messageContainer.scrollHeight;
    }

    // Function to add a "Thinking..." message to the chat container
    function addThinkingMessage() {
        // Create a new <div> element for the thinking message
        var thinkingMessage = document.createElement('div');
        thinkingMessage.id = 'thinking-message';
        thinkingMessage.className = 'message assistant-message';
        thinkingMessage.innerText = 'Thinking...';

        // Append the thinking message to the message container
        messageContainer.appendChild(thinkingMessage);

        // Scroll to the bottom of the message container to show the latest message
        messageContainer.scrollTop = messageContainer.scrollHeight;
    }

    // Function to remove the "Thinking..." message from the chat container
    function removeThinkingMessage() {
        var thinkingMessage = document.getElementById('thinking-message');
        if (thinkingMessage) {
            thinkingMessage.remove();
        }
    }

    // Function to send a message to the server
    function sendMessage(message) {
        // Send a POST request to the server with the message as JSON data
        fetch('/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: message }),
        })
            .then(function (response) {
                // Parse the response as JSON
                return response.json();
            })
            .then(function (data) {
                // Remove the "Thinking..." message
                removeThinkingMessage();

                // Get the assistant's message from the response and add it to the chat container and log
                var assistantMessage = data.message;
                addMessage('assistant', assistantMessage);
                messageLog.push({ role: 'assistant', content: assistantMessage });
            })
            .catch(function (error) {
                // Log any errors that occur during the request
                console.error('Error:', error);
            });
    }
});