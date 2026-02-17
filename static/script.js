// -*- coding: utf-8 -*-

document.addEventListener('DOMContentLoaded', function () {
    var chatApp = new ChatApp();
    chatApp.init();

    new ThemeManager('theme-toggle');
});

class ThemeManager {
    constructor(toggleBtnId) {
        this.toggleBtn = document.getElementById(toggleBtnId);
        this.darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        this.init();
    }

    getPreferredTheme() {
        return localStorage.getItem('theme') ||
            (this.darkMediaQuery.matches ? 'dark' : 'light');
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.toggleBtn.textContent = theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
    }

    toggle() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', next);
        this.applyTheme(next);
    }

    watchSystemTheme() {
        this.darkMediaQuery.addEventListener('change', (e) => {
            if (!localStorage.getItem('theme')) {
                this.applyTheme(e.matches ? 'dark' : 'light');
            }
        });
    }

    init() {
        this.applyTheme(this.getPreferredTheme());
        this.toggleBtn.addEventListener('click', () => this.toggle());
        this.watchSystemTheme();
    }
}

class ChatApp {
    constructor() {
        this.messageContainer = document.getElementById('message-container');
        this.form = document.getElementById('chat-form');
        this.inputMessage = document.getElementById('input-message');
        this.termsCheckbox = document.getElementById('terms');
        this.termsButton = document.getElementById('terms-button');
        this.termsText = document.getElementById('terms-text');
        this.mobileMenu = document.getElementById('mobile-menu');
        this.hamburgerMenu = document.getElementById('hamburger-menu');
        this.messageLog = [];
    }

    init() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.termsButton.addEventListener('click', () => this.toggleTermsText());
        this.termsCheckbox.addEventListener('change', () => this.handleTermsCheckboxChange());
        this.hamburgerMenu.addEventListener('click', () => this.toggleMobileMenu());
    }

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

    toggleMobileMenu() {
        this.mobileMenu.classList.toggle('active');
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
        super('assistant', '');
        this.id = 'thinking-message';
    }

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