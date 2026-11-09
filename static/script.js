// Manages the dark/light mode toggle and persists the user's preference
class ThemeManager {
    constructor(toggleBtnId) {
        this.toggleBtn = document.getElementById(toggleBtnId);
        this.darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    }

    getSavedTheme() {
        try {
            return localStorage.getItem('theme');
        } catch (e) { return null; /* Storage unavailable */ }
    }

    getPreferredTheme() {
        return this.getSavedTheme() || (this.darkMediaQuery.matches ? 'dark' : 'light');
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.toggleBtn.textContent = theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
    }

    toggle() {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        try {
            localStorage.setItem('theme', next);
        } catch (e) { /* Storage unavailable: the choice lasts for this page only */ }
        this.applyTheme(next);
    }

    watchSystemTheme() {
        this.darkMediaQuery.addEventListener('change', (e) => {
            if (!this.getSavedTheme()) this.applyTheme(e.matches ? 'dark' : 'light');
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
        // Keyboard support: Enter or Space opens/closes the menu
        this.hamburger.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.toggle(e); }
        });
        document.addEventListener('click', (e) => this.closeIfOutside(e));
    }
}

function createButton(className, text, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    button.addEventListener('click', onClick);
    return button;
}

// Handles the terms and conditions agreement and modal
class TermsManager {
    // Change TERMS_VERSION whenever TermsAndConditions.txt is updated so visitors are asked to agree again
    static TERMS_VERSION = '2026-11-06.2';
    static STORAGE_KEY = 'termsAccepted';

    constructor(termsButtonId, termsCheckboxId) {
        this.termsButton = document.getElementById(termsButtonId);
        this.termsCheckbox = document.getElementById(termsCheckboxId);
        this.termsLabel = document.querySelector('label[for="terms"]');
        this.modal = null;
        this.onAgree = null;
        this.onKeydown = (e) => { if (e.key === 'Escape') this.closeModal(); };
    }

    // Opens the terms in a modal. onAgree (optional) runs after the visitor clicks "I agree".
    showModal(onAgree = null) {
        if (this.modal) return;  // Already open
        this.onAgree = onAgree;
        this.previousFocus = document.activeElement;

        const { modal, body, focusTarget } = this.buildModal();
        document.body.appendChild(modal);
        document.addEventListener('keydown', this.onKeydown);
        this.modal = modal;
        focusTarget.focus();

        this.loadTerms(body);
    }

    // Builds the modal's elements; returns the backdrop, the body to fill, and the button to focus
    buildModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        // Clicking the dimmed backdrop (outside the box) closes the modal
        modal.addEventListener('click', (e) => { if (e.target === modal) this.closeModal(); });

        const content = document.createElement('div');
        content.className = 'modal-content';
        content.setAttribute('role', 'dialog');
        content.setAttribute('aria-modal', 'true');
        content.setAttribute('aria-labelledby', 'terms-title');

        const header = document.createElement('div');
        header.className = 'modal-header';
        const title = document.createElement('h2');
        title.id = 'terms-title';
        title.textContent = 'Terms and Conditions';
        const closeButton = createButton('close-button', '×', () => this.closeModal());
        closeButton.setAttribute('aria-label', 'Close');
        header.append(title, closeButton);

        const body = document.createElement('div');
        body.className = 'modal-body';
        body.textContent = 'Loading…';

        const footer = document.createElement('div');
        footer.className = 'modal-footer';
        footer.appendChild(createButton('modal-button secondary', 'Close', () => this.closeModal()));
        let agreeButton = null;
        if (!this.isAgreed()) {
            agreeButton = createButton('modal-button primary', "I'm 18+ and agree", () => this.agree());
            footer.appendChild(agreeButton);
        }

        content.append(header, body, footer);
        modal.appendChild(content);
        return { modal, body, focusTarget: agreeButton || closeButton };
    }

    loadTerms(body) {
        fetch('/static/TermsAndConditions.txt')
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.text();
            })
            .then(text => this.renderTerms(body, text))
            .catch(error => {
                console.error('Error loading terms:', error);
                body.textContent = 'Sorry, the terms could not be loaded. Please try again.';
            });
    }

    // Turns the plain-text terms into headings, paragraphs and bullet lists (using textContent only, never HTML)
    renderTerms(container, text) {
        container.textContent = '';
        let list = null;
        text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).forEach((line, index) => {
            let el;
            if (line.startsWith('- ')) {
                if (!list) {
                    list = document.createElement('ul');
                    container.appendChild(list);
                }
                el = document.createElement('li');
                el.textContent = line.slice(2);
                list.appendChild(el);
                return;
            }
            list = null;
            if (index === 0) {
                el = document.createElement('h3');  // Document title
            } else if (/^\d+\.\s/.test(line)) {
                el = document.createElement('h4');  // Numbered section heading
            } else {
                el = document.createElement('p');
                if (/^Last updated:/.test(line)) el.className = 'terms-updated';
            }
            el.textContent = line;
            container.appendChild(el);
        });
    }

    closeModal() {
        if (!this.modal) return;
        this.modal.remove();
        this.modal = null;
        this.onAgree = null;
        document.removeEventListener('keydown', this.onKeydown);
        this.previousFocus?.focus?.();
    }

    agree() {
        const callback = this.onAgree;
        this.termsCheckbox.checked = true;
        this.handleAgreement();
        this.closeModal();
        if (callback) callback();
    }

    // Hides the checkbox and label once the user agrees, and remembers it on this device
    handleAgreement() {
        if (!this.termsCheckbox.checked) return;
        this.termsCheckbox.style.display = 'none';
        if (this.termsLabel) this.termsLabel.style.display = 'none';
        try {
            localStorage.setItem(TermsManager.STORAGE_KEY, TermsManager.TERMS_VERSION);
        } catch (e) { /* Storage unavailable (e.g. private mode): agreement lasts for this page only */ }
    }

    restoreAgreement() {
        try {
            if (localStorage.getItem(TermsManager.STORAGE_KEY) === TermsManager.TERMS_VERSION) {
                this.termsCheckbox.checked = true;
                this.handleAgreement();
            }
        } catch (e) { /* Storage unavailable */ }
    }

    isAgreed() {
        return this.termsCheckbox.checked;
    }

    init() {
        this.termsButton.addEventListener('click', () => this.showModal());
        this.termsCheckbox.addEventListener('change', () => this.handleAgreement());
        this.restoreAgreement();
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

    createElement() {
        const el = document.createElement('div');
        el.className = `message ${this.role === 'user' ? 'user-message' : 'assistant-message'}`;
        el.innerText = this.content;
        return el;
    }

    // Adds the message to the container and scrolls so it's visible
    display(container) {
        container.appendChild(this.createElement());
        container.scrollTop = container.scrollHeight;
    }
}

// Extends Message to display an animated bouncing dots indicator instead of text
class ThinkingMessage extends Message {
    constructor() {
        super('assistant', '');
    }

    createElement() {
        const el = document.createElement('div');
        el.className = 'message assistant-message thinking-message';
        el.id = 'thinking-message';
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('span');
            dot.className = 'dot';
            el.appendChild(dot);
        }
        return el;
    }
}

// Controls the main chat interface — delegates responsibilities to focused managers
class ChatApp {
    constructor() {
        this.messageContainer = document.getElementById('message-container');
        this.form = document.getElementById('chat-form');
        this.inputMessage = document.getElementById('input-message');
        this.termsManager = new TermsManager('terms-button', 'terms');
        this.sendButton = this.form.querySelector('[type="submit"]');
        this.server = new Server();
        this.isWaiting = false;
    }

    handleSubmit(e) {
        e.preventDefault();
        this.send();
    }

    send() {
        if (this.isWaiting) return;  // One message at a time

        const userMessage = this.inputMessage.value.trim();
        if (!userMessage) return;

        // Instead of blocking with an alert, show the terms; agreeing sends the message
        if (!this.termsManager.isAgreed()) {
            this.termsManager.showModal(() => this.send());
            return;
        }

        this.addMessage('user', userMessage);
        this.showThinking();
        this.inputMessage.value = '';
        this.setWaiting(true);

        this.server.postMessage(userMessage)
            .then(response => {
                this.hideThinking();
                this.addMessage('assistant', response);
            })
            .catch(error => {
                // Always clear the typing indicator so the chat never gets stuck
                console.error('Error:', error);
                this.hideThinking();
                this.addMessage('assistant', "Sorry, something went wrong on our end. Please try again in a moment.");
            })
            .finally(() => {
                this.setWaiting(false);
                this.inputMessage.focus();
            });
    }

    // Disables Send while a reply is pending so messages can't be double-sent; typing stays allowed
    setWaiting(waiting) {
        this.isWaiting = waiting;
        if (this.sendButton) this.sendButton.disabled = waiting;
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
        // Focus the message box on desktop only; on phones it would pop the keyboard open on page load
        if (window.matchMedia('(pointer: fine)').matches) this.inputMessage.focus();
    }
}

// ── Entry point ──
document.addEventListener('DOMContentLoaded', () => {
    new ThemeManager('theme-toggle').init();
    new MobileMenuManager('hamburger-menu', 'mobile-menu').init();

    if (document.getElementById('chat-form')) {
        new ChatApp().init();
    }
});