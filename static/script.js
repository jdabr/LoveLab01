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
        const [icon, label] = theme === 'dark' ? ['☀️', 'Light Mode'] : ['🌙', 'Dark Mode'];
        this.toggleBtn.querySelector('[aria-hidden]').textContent = icon;
        this.toggleBtn.querySelector('.header-button-label').textContent = label;
        this.toggleBtn.setAttribute('aria-label', `Switch to ${label.toLowerCase()}`);
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
    static TERMS_VERSION = '2026-11-09.1';
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
    // newConversation tells the server to forget any earlier history before replying
    postMessage(message, newConversation) {
        return fetch('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, new_conversation: newConversation }),
        })
            .then(response => response.json()
                // Non-JSON responses (e.g. an HTML error page) become a readable error
                .catch(() => { throw new Error(`Server error (${response.status})`); }))
            .then(data => {
                if (!data || typeof data.message !== 'string') throw new Error('Invalid server response');
                return data.message;
            });
    }

    // Erases the AI's memory of the conversation on the server right away
    deleteConversation() {
        return fetch('/conversation', { method: 'DELETE' }).then(response => {
            if (!response.ok) throw new Error(`Server error (${response.status})`);
        });
    }

    // Tells the server whether to keep the AI's memory of the conversation after the browser closes
    setRemember(remember) {
        return fetch('/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ remember }),
        }).then(response => {
            if (!response.ok) throw new Error(`Server error (${response.status})`);
        });
    }
}

// Saves the visible conversation in the browser so it can be shown again later.
// - By default it uses sessionStorage: it survives a refresh but is erased when the tab closes,
//   so conversations don't linger on shared devices.
// - With "Remember this chat on this device" on, it uses localStorage instead, so it also survives
//   closing the browser or restarting the computer, and expires after rememberDays without a new message.
class ConversationStore {
    static KEY = 'lovelab.conversation';
    static REMEMBER_KEY = 'lovelab.remember';
    static MAX_MESSAGES = 200;

    constructor(rememberDays) {
        this.maxAgeMs = rememberDays * 24 * 60 * 60 * 1000;
    }

    isRemembered() {
        try {
            return localStorage.getItem(ConversationStore.REMEMBER_KEY) === 'on';
        } catch (e) { return false; /* Storage unavailable */ }
    }

    storage() {
        return this.isRemembered() ? localStorage : sessionStorage;
    }

    load() {
        try {
            const saved = JSON.parse(this.storage().getItem(ConversationStore.KEY));
            if (!saved || !Array.isArray(saved.messages)) return [];
            if (this.isRemembered() && Date.now() - saved.savedAt > this.maxAgeMs) {
                this.clear();  // Expired
                return [];
            }
            return saved.messages.filter(m =>
                m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
        } catch (e) { return []; /* Storage unavailable or corrupted */ }
    }

    save(messages) {
        try {
            const saved = { savedAt: Date.now(), messages: messages.slice(-ConversationStore.MAX_MESSAGES) };
            this.storage().setItem(ConversationStore.KEY, JSON.stringify(saved));
        } catch (e) { /* Storage unavailable or full: the conversation just won't be restored */ }
    }

    add(role, content) {
        this.save([...this.load(), { role, content }]);
    }

    // Deletes the saved conversation from both kinds of storage
    clear() {
        for (const storage of ['sessionStorage', 'localStorage']) {
            try {
                window[storage].removeItem(ConversationStore.KEY);
            } catch (e) { /* Storage unavailable */ }
        }
    }

    // Moves the current conversation to the storage that matches the new setting
    setRemembered(remember) {
        const messages = this.load();
        this.clear();
        try {
            if (remember) localStorage.setItem(ConversationStore.REMEMBER_KEY, 'on');
            else localStorage.removeItem(ConversationStore.REMEMBER_KEY);
        } catch (e) { /* Storage unavailable */ }
        if (messages.length) this.save(messages);
    }

    // True once the server has replied in this conversation, so it holds matching history
    hasServerReply() {
        return this.load().some(m => m.role === 'assistant');
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
        this.newChatButton = document.getElementById('new-chat');
        this.deleteChatButton = document.getElementById('delete-chat');
        this.rememberSwitch = document.getElementById('remember-chat');
        this.rememberNote = document.getElementById('remember-note');
        this.server = new Server();
        this.store = new ConversationStore(Number(this.form.dataset.rememberDays) || 30);
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

        const newConversation = !this.store.hasServerReply();
        this.addMessage('user', userMessage);
        this.store.add('user', userMessage);
        this.updateDeleteButton();
        this.showThinking();
        this.inputMessage.value = '';
        this.setWaiting(true);

        this.server.postMessage(userMessage, newConversation)
            .then(response => {
                this.hideThinking();
                this.addMessage('assistant', response);
                this.store.add('assistant', response);
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

    // Disables Send (and Delete chat) while a reply is pending so messages can't be double-sent
    // and a reply can't arrive into a deleted chat; typing stays allowed
    setWaiting(waiting) {
        this.isWaiting = waiting;
        if (this.sendButton) this.sendButton.disabled = waiting;
        this.updateDeleteButton();
    }

    updateDeleteButton() {
        if (this.deleteChatButton) this.deleteChatButton.disabled = this.isWaiting || !this.store.load().length;
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

    // Redraws the conversation saved before a refresh, below the welcome message
    restoreConversation() {
        this.store.load().forEach(({ role, content }) => this.addMessage(role, content));
    }

    // Removes the saved conversation and every message except the welcome message (rendered first)
    clearConversation() {
        this.store.clear();
        [...this.messageContainer.children].slice(1).forEach(el => el.remove());
        this.inputMessage.value = '';
        this.updateDeleteButton();
        this.inputMessage.focus();
    }

    // Starts over; the server forgets the old conversation when the next message is sent
    startNewChat() {
        if (this.isWaiting) return;
        if (this.store.load().length && !window.confirm('Start a new chat? This conversation will be cleared.')) return;
        this.clearConversation();
    }

    // Erases the conversation from this device and the AI's memory right away
    deleteChat() {
        if (this.isWaiting || !this.store.load().length) return;
        const confirmed = window.confirm(
            'Delete this chat?\n\nIt will be erased from this device and from LoveLab\'s memory, and can\'t be '
            + 'recovered. (Anonymous copies kept by LoveLab, described in the Terms, can\'t be deleted.)');
        if (!confirmed) return;
        this.deleteChatButton.disabled = true;
        this.server.deleteConversation()
            .then(() => this.clearConversation())
            .catch(error => {
                console.error('Error deleting chat:', error);
                window.alert('Sorry, the chat couldn\'t be deleted. Please try again.');
                this.updateDeleteButton();
            });
    }

    showRememberSetting(remember) {
        if (this.rememberSwitch) this.rememberSwitch.checked = remember;
        if (this.rememberNote) this.rememberNote.hidden = !remember;
    }

    // The server is told first so the AI's memory and the saved conversation always last equally long;
    // if that fails, the switch goes back to how it was
    toggleRemember() {
        const remember = this.rememberSwitch.checked;
        this.rememberSwitch.disabled = true;
        this.server.setRemember(remember)
            .then(() => {
                this.store.setRemembered(remember);
                this.showRememberSetting(remember);
            })
            .catch(error => {
                console.error('Error saving setting:', error);
                this.showRememberSetting(!remember);
            })
            .finally(() => { this.rememberSwitch.disabled = false; });
    }

    init() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.newChatButton?.addEventListener('click', () => this.startNewChat());
        this.deleteChatButton?.addEventListener('click', () => this.deleteChat());
        this.rememberSwitch?.addEventListener('change', () => this.toggleRemember());
        this.termsManager.init();
        this.showRememberSetting(this.store.isRemembered());
        this.restoreConversation();
        this.updateDeleteButton();
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