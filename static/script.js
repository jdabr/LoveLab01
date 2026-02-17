// -*- coding: utf-8 -*-

// Wait for the HTML document to finish loading before initializing the app
document.addEventListener('DOMContentLoaded', function () {
    // Only initialize ChatApp if we are on the main chat page
    if (document.getElementById('chat-form')) {
        var chatApp = new ChatApp();
        chatApp.init();
    }

    // Initialize theme manager on every page
    new ThemeManager('theme-toggle');

    // Handle hamburger separately
    const hamburger = document.getElementById('hamburger-menu');
    const mobileMenu = document.getElementById('mobile-menu');
    if (hamburger && mobileMenu) {
        hamburger.addEventListener('click', (e) => {
            e.stopPropagation();
            mobileMenu.classList.toggle('active');
        });

        // Close menu when clicking outside of it
        document.addEventListener('click', (e) => {
            if (!hamburger.contains(e.target) && !mobileMenu.contains(e.target)) {
                mobileMenu.classList.remove('active');
            }
        });
    }
});

// Manages the dark/light mode toggle and persists the user's preference
class ThemeManager {
    // Grabs the toggle button and sets up the theme on load
    constructor(toggleBtnId) {
        this.toggleBtn = document.getElementById(toggleBtnId);
        this.darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        this.init();
    }

    // Returns the saved theme from localStorage, or falls back to the OS preference
    getPreferredTheme() {
        return localStorage.getItem('theme') ||
            (this.darkMediaQuery.matches ? 'dark' : 'light');
    }

    // Sets the data-theme attribute on the HTML element and updates the button label
    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.toggleBtn.textContent = theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
    }

    // Switches between dark and light mode and saves the choice to localStorage
    toggle() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', next);
        this.applyTheme(next);
    }

    // Listens for OS-level theme changes and applies them if no manual preference is saved
    watchSystemTheme() {
        this.darkMediaQuery.addEventListener('change', (e) => {
            if (!localStorage.getItem('theme')) {
                this.applyTheme(e.matches ? 'dark' : 'light');
            }
        });
    }

    // Applies the initial theme, attaches the click listener, and starts watching for OS changes
    init() {
        this.applyTheme(this.getPreferredTheme());
        this.toggleBtn.addEventListener('click', () => this.toggle());
        this.watchSystemTheme();
    }
}

// Controls the main chat interface including messaging, form submission, and the mobile menu
class ChatApp {
    // Grabs all necessary DOM elements and initializes the message log
    constructor() {
        this.messageContainer = document.getElementById('message-container');
        this.form = document.getElementById('chat-form');
        this.inputMessage = document.getElementById('input-message');
        this.termsCheckbox = document.getElementById('terms');
        this.termsButton = document.getElementById('terms-button');
        this.termsText = document.getElementById('terms-text');
        this.mobileMenu = document.getElementById('mobile-menu');
        this.messageLog = [];
    }

    // Attaches event listeners to the form, terms button and checkbox
    init() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.termsButton.addEventListener('click', () => this.toggleTermsText());
        this.termsCheckbox.addEventListener('change', () => this.handleTermsCheckboxChange());
    }

    // Validates the form, adds the user message to the chat, and sends it to the server
    handleSubmit(e) {
        e.preventDefault();

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

    // Fetches and displays the terms and conditions in a modal popup
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

    // Hides the terms checkbox once the user has agreed
        handleTermsCheckboxChange() {
            if (this.termsCheckbox.checked) {
                this.termsCheckbox.style.display = 'none';
                document.querySelector('label[for="terms"]').style.display = 'none';
            }
        }

    // Creates a new Message instance and renders it in the chat container
    addMessage(role, content) {
        const message = new Message(role, content);
        message.display(this.messageContainer);
    }

    // Displays the animated thinking indicator while waiting for a response
    addThinkingMessage() {
        const thinkingMessage = new ThinkingMessage();
        thinkingMessage.display(this.messageContainer);
    }

    // Removes the thinking indicator once the assistant response has arrived
    removeThinkingMessage() {
        const thinkingMessage = document.getElementById('thinking-message');
        if (thinkingMessage) {
            thinkingMessage.remove();
        }
    }

    // Sends the user message to the Flask server and displays the assistant response
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

// Represents a single chat message and handles rendering it in the chat container
class Message {
    // Stores the role (user or assistant) and the message content
    constructor(role, content) {
        this.role = role;
        this.content = content;
    }

    // Creates a styled message div and appends it to the chat container
    display(container) {
        const message = document.createElement('div');
        message.className = 'message';
        message.classList.add(this.role === 'user' ? 'user-message' : 'assistant-message');
        message.innerText = this.content;

        container.appendChild(message);
        container.scrollTop = container.scrollHeight;
    }
}

// Extends Message to display an animated bouncing dots indicator instead of text
class ThinkingMessage extends Message {
    constructor() {
        super('assistant', '');
        this.id = 'thinking-message';
    }

    // Renders three animated dots in place of a text message
    display(container) {
        const message = document.createElement('div');
        message.className = 'message assistant-message thinking-message';
        message.id = 'thinking-message';
        message.innerHTML = `
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
        `;
        container.appendChild(message);
        container.scrollTop = container.scrollHeight;
    }
}

// Handles communication with the Flask backend via POST requests
class Server {
    // Sends the user message to the server and returns the assistant response
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