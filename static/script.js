// Wait for the HTML document to finish loading
document.addEventListener('DOMContentLoaded', function () {
    var chatApp = new ChatApp();
    chatApp.init();
});

class ChatApp {
    constructor() {
        this.messageContainer = document.getElementById('message-container');
        this.form = document.getElementById('chat-form');
        this.inputMessage = document.getElementById('input-message');
        this.termsCheckbox = document.getElementById('terms');
        this.termsButton = document.getElementById('terms-button');
        this.termsText = document.getElementById('terms-text');
        this.messageLog = []; // Array to store the message log
    }

    init() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.termsButton.addEventListener('click', () => this.toggleTermsText());
        this.termsCheckbox.addEventListener('change', () => this.handleTermsCheckboxChange());
    }

    handleSubmit(e) {
        e.preventDefault(); // Prevent the form from being submitted and the page from refreshing

        if (!this.termsCheckbox.checked) {
            alert('Please agree to the terms and conditions to continue using the app.');
            return;
        }

        const userMessage = this.inputMessage.value.trim();

        if (userMessage === '') {
            return;
        }

        this.addMessage('user', userMessage);
        this.messageLog.push({ role: 'user', content: userMessage });

        this.addThinkingMessage();

        this.sendMessage(userMessage);

        this.inputMessage.value = '';
    }

    toggleTermsText() {
        fetch('static/TermsAndConditions.txt')
            .then(response => response.text())
            .then(termsContent => {
                const modal = document.createElement('div');
                modal.className = 'modal';

                const content = document.createElement('div');
                content.className = 'modal-content';

                const closeButton = document.createElement('span');
                closeButton.className = 'close-button';
                closeButton.innerHTML = '&times;';

                const termsText = document.createElement('p');
                termsText.innerText = termsContent;

                content.appendChild(closeButton);
                content.appendChild(termsText);
                modal.appendChild(content);
                document.body.appendChild(modal);

                closeButton.addEventListener('click', () => {
                    modal.remove();
                });
            })
            .catch(error => {
                console.error('Error:', error);
            });
    }

    handleTermsCheckboxChange() {
        if (this.termsCheckbox.checked) {
            this.termsCheckbox.parentElement.style.display = 'none';
        }
    }

    addMessage(role, content) {
        const message = new Message(role, content);
        message.display(this.messageContainer);
    }

    addThinkingMessage() {
        const thinkingMessage = new ThinkingMessage();
        thinkingMessage.display(this.messageContainer);
    }

    removeThinkingMessage() {
        const thinkingMessage = document.getElementById('thinking-message');
        if (thinkingMessage) {
            thinkingMessage.remove();
        }
    }

    sendMessage(message) {
        const server = new Server();
        server.postMessage(message)
            .then((assistantMessage) => {
                this.removeThinkingMessage();
                this.addMessage('assistant', assistantMessage);
                this.messageLog.push({ role: 'assistant', content: assistantMessage });
            })
            .catch((error) => {
                console.error('Error:', error);
            });
    }
}

class Message {
    constructor(role, content) {
        this.role = role;
        this.content = content;
    }

    display(container) {
        const message = document.createElement('div');
        message.className = 'message';
        message.classList.add(this.role === 'user' ? 'user-message' : 'assistant-message');
        message.innerText = this.content;

        container.appendChild(message);
        container.scrollTop = container.scrollHeight;
    }
}

class ThinkingMessage extends Message {
    constructor() {
        super('assistant', 'Thinking...');
        this.id = 'thinking-message';
    }
}

class Server {
    postMessage(message) {
        return fetch('/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: message }),
        })
            .then((response) => response.json())
            .then((data) => data.message);
    }
}