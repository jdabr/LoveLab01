// -*- coding: utf-8 -*-

// ── Single Responsibility: each class has one clear job ──

// Manages the dark/light mode toggle and persists the user's preference
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
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', next);
        this.applyTheme(next);
    }

    watchSystemTheme() {
        this.darkMediaQuery.addEventListener('change', (e) => {
            if (!localStorage.getItem('theme')) this.applyTheme(e.matches ? 'dark' : 'light');
        });
    }

    init() {
        this.applyTheme(this.getPreferredTheme());
        this.toggleBtn.addEventListener('click', () => this.toggle());
        this.watchSystemTheme();
    }
}

// Handles opening and closing the mobile navigation menu
class MobileMenuManager {
    constructor(hamburgerMenuId, mobileMenuId) {
        this.hamburger = document.getElementById(hamburgerMenuId);
        this.mobileMenu = document.getElementById(mobileMenuId);
    }

    // Returns false if either element is missing, preventing errors on pages without a menu
    isAvailable() {
        return this.hamburger !== null && this.mobileMenu !== null;
    }

    toggle(e) {
        e.stopPropagation();
        this.mobileMenu.classList.toggle('active');
    }

    closeIfOutside(e) {
        if (!this.hamburger.contains(e.target) && !this.mobileMenu.contains(e.target)) {
            this.mobileMenu.classList.remove('active');
        }
    }

    init() {
        if (!this.isAvailable()) return;
        this.hamburger.addEventListener('click', (e) => this.toggle(e));
        document.addEventListener('click', (e) => this.closeIfOutside(e));
    }
}

// Handles fetching and displaying the terms and conditions modal
class TermsManager {
    constructor(termsButtonId, termsCheckboxId) {
        this.termsButton = document.getElementById(termsButtonId);
        this.termsCheckbox = document.getElementById(termsCheckboxId);
        this.termsLabel = document.querySelector('label[for="terms"]');
    }

    // Fetches terms content and renders it inside a modal popup
    showModal() {
        fetch('static/TermsAndConditions.txt')
            .then(response => response.text())
            .then(content => {
                const modal = document.createElement('div');
                modal.className = 'modal';

                const modalContent = document.createElement('div');
                modalContent.className = 'modal-content';

                const closeButton = document.createElement('span');
                closeButton.className = 'close-button';
                closeButton.innerHTML = '&times;';
                closeButton.addEventListener('click', () => modal.remove());

                const termsText = document.createElement('p');
                termsText.innerText = content;

                modalContent.appendChild(closeButton);
                modalContent.appendChild(termsText);
                modal.appendChild(modalContent);
                document.body.appendChild(modal);
            })
            .catch(error => console.error('Error loading terms:', error));
    }

    // Hides the checkbox and label once the user agrees
    handleAgreement() {
        if (this.termsCheckbox.checked) {
            this.termsCheckbox.style.display = 'none';
            if (this.termsLabel) this.termsLabel.style.display = 'none';
        }
    }

    isAgreed() {
        return this.termsCheckbox.checked;
    }

    init() {
        this.termsButton.addEventListener('click', () => this.showModal());
        this.termsCheckbox.addEventListener('change', () => this.handleAgreement());
    }
}

// Handles communication with the Flask backend
class Server {
    postMessage(message) {
        return fetch('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message }),
        })
            .then(response => response.json()
                // Non-JSON responses (e.g. an HTML error page) become a readable error
                .catch(() => { throw new Error(`Server error (${response.status})`); }))
            .then(data => {
                if (!data || typeof data.message !== 'string') throw new Error('Invalid server response');
                return data.message;
            });
    }
}

// Represents a single chat message and renders it in the chat container
class Message {
    constructor(role, content) {
        this.role = role;
        this.content = content;
    }

    display(container) {
        const el = document.createElement('div');
        el.className = `message ${this.role === 'user' ? 'user-message' : 'assistant-message'}`;
        el.innerText = this.content;
        container.appendChild(el);
        container.scrollTop = container.scrollHeight;
    }
}

// Extends Message to display an animated bouncing dots indicator instead of text
class ThinkingMessage extends Message {
    constructor() {
        super('assistant', '');
    }

    display(container) {
        const el = document.createElement('div');
        el.className = 'message assistant-message thinking-message';
        el.id = 'thinking-message';
        el.innerHTML = `
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
        `;
        container.appendChild(el);
        container.scrollTop = container.scrollHeight;
    }
}

// Controls the main chat interface — delegates responsibilities to focused managers
class ChatApp {
    constructor() {
        this.messageContainer = document.getElementById('message-container');
        this.form = document.getElementById('chat-form');
        this.inputMessage = document.getElementById('input-message');
        this.termsManager = new TermsManager('terms-button', 'terms');
        this.server = new Server();
        this.messageLog = [];
    }

    handleSubmit(e) {
        e.preventDefault();

        if (!this.termsManager.isAgreed()) {
            alert('Please agree to the terms and conditions to continue using the app.');
            return;
        }

        const userMessage = this.inputMessage.value.trim();
        if (!userMessage) return;

        this.addMessage('user', userMessage);
        this.messageLog.push({ role: 'user', content: userMessage });
        this.showThinking();
        this.inputMessage.value = '';

        this.server.postMessage(userMessage)
            .then(response => {
                this.hideThinking();
                this.addMessage('assistant', response);
                this.messageLog.push({ role: 'assistant', content: response });
            })
            .catch(error => {
                // Always clear the typing indicator so the chat never gets stuck
                console.error('Error:', error);
                this.hideThinking();
                this.addMessage('assistant', "Sorry, something went wrong on our end. Please try again in a moment.");
            });
    }

    addMessage(role, content) {
        new Message(role, content).display(this.messageContainer);
    }

    showThinking() {
        new ThinkingMessage().display(this.messageContainer);
    }

    hideThinking() {
        document.getElementById('thinking-message')?.remove();
    }

    init() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.termsManager.init();
    }
}

// ── Entry point ──
document.addEventListener('DOMContentLoaded', () => {
    new ThemeManager('theme-toggle');
    new MobileMenuManager('hamburger-menu', 'mobile-menu').init();

    if (document.getElementById('chat-form')) {
        new ChatApp().init();
    }
});