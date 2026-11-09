// ── Small helpers ──

// Creates an element with an optional class and text (text is always set with textContent, never HTML)
function createElement(tag, className = '', text = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

function createButton(className, text, onClick) {
    const button = createElement('button', className, text);
    button.type = 'button';
    if (onClick) button.addEventListener('click', onClick);
    return button;
}

function newId() {
    return window.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// Returns localStorage/sessionStorage, or null when the browser blocks it (e.g. some private modes)
function getStorage(name) {
    try {
        const storage = window[name];
        storage.getItem('');
        return storage;
    } catch (e) { return null; }
}

// ── Theme ──

// Manages the dark/light mode toggle and persists the user's preference
class ThemeManager {
    constructor(buttonId) {
        this.button = document.getElementById(buttonId);
        this.darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    }

    getSavedTheme() {
        return getStorage('localStorage')?.getItem('theme') ?? null;
    }

    getPreferredTheme() {
        return this.getSavedTheme() || (this.darkQuery.matches ? 'dark' : 'light');
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        const [icon, label] = theme === 'dark' ? ['☀️', 'Light Mode'] : ['🌙', 'Dark Mode'];
        this.button.querySelector('[aria-hidden]').textContent = icon;
        this.button.querySelector('.header-button-label').textContent = label;
        this.button.setAttribute('aria-label', `Switch to ${label.toLowerCase()}`);
    }

    toggle() {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        getStorage('localStorage')?.setItem('theme', next);
        this.applyTheme(next);
    }

    watchSystemTheme() {
        this.darkQuery.addEventListener('change', (e) => {
            if (!this.getSavedTheme()) this.applyTheme(e.matches ? 'dark' : 'light');
        });
    }

    init() {
        this.applyTheme(this.getPreferredTheme());
        this.button.addEventListener('click', () => this.toggle());
        this.watchSystemTheme();
    }
}

// ── Sidebar drawer (phones) ──

// On narrow screens the sidebar slides in from the left when the menu button is pressed
class SidebarDrawer {
    constructor(sidebarId, toggleId, backdropId) {
        this.sidebar = document.getElementById(sidebarId);
        this.toggleButton = document.getElementById(toggleId);
        this.backdrop = document.getElementById(backdropId);
    }

    isOpen() {
        return this.sidebar.classList.contains('open');
    }

    open() {
        this.sidebar.classList.add('open');
        this.backdrop.hidden = false;
        this.toggleButton.setAttribute('aria-expanded', 'true');
    }

    close() {
        if (!this.isOpen()) return;
        this.sidebar.classList.remove('open');
        this.backdrop.hidden = true;
        this.toggleButton.setAttribute('aria-expanded', 'false');
    }

    init() {
        if (!this.sidebar || !this.toggleButton || !this.backdrop) return;
        this.toggleButton.addEventListener('click', () => (this.isOpen() ? this.close() : this.open()));
        this.backdrop.addEventListener('click', () => this.close());
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    }
}

// ── Dialogs ──

// In-page dialogs (styled like the rest of the site) instead of the browser's confirm()/alert() pop-ups
class Modal {
    static current = null;
    static count = 0;

    // actions: [{ label, kind: 'primary' | 'secondary' | 'danger', onClick(dialog) }]. Without onClick,
    // an action just closes the dialog. Returns { body, close(result) }; onClose(result) runs on close.
    static open({ title, content = null, actions = [], onClose = null, className = '' }) {
        Modal.current?.close();
        const previousFocus = document.activeElement;
        const titleId = `modal-title-${++Modal.count}`;

        const overlay = createElement('div', 'modal');
        const box = createElement('div', `modal-content ${className}`.trim());
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.setAttribute('aria-labelledby', titleId);

        const header = createElement('div', 'modal-header');
        const heading = createElement('h2', '', title);
        heading.id = titleId;
        const closeButton = createButton('close-button', '×');
        closeButton.setAttribute('aria-label', 'Close');
        header.append(heading, closeButton);

        const body = createElement('div', 'modal-body');
        if (content) body.append(content);
        box.append(header, body);

        let closed = false;
        const onKeydown = (e) => { if (e.key === 'Escape') dialog.close(); };
        const dialog = {
            body,
            close(result) {
                if (closed) return;
                closed = true;
                overlay.remove();
                document.removeEventListener('keydown', onKeydown);
                if (Modal.current === dialog) Modal.current = null;
                previousFocus?.focus?.();
                onClose?.(result);
            },
        };

        let focusTarget = closeButton;
        if (actions.length) {
            const footer = createElement('div', 'modal-footer');
            actions.forEach(({ label, kind = 'secondary', onClick }) => {
                const button = createButton(`modal-button ${kind}`, label,
                    () => (onClick ? onClick(dialog) : dialog.close()));
                footer.append(button);
                if (kind !== 'secondary') focusTarget = button;
            });
            box.append(footer);
        }

        closeButton.addEventListener('click', () => dialog.close());
        // Clicking the dimmed backdrop (outside the box) closes the dialog
        overlay.addEventListener('click', (e) => { if (e.target === overlay) dialog.close(); });
        document.addEventListener('keydown', onKeydown);
        overlay.append(box);
        document.body.append(overlay);
        Modal.current = dialog;
        (body.querySelector('[autofocus]') || focusTarget).focus();
        return dialog;
    }

    // Resolves true if the visitor confirms, false if they cancel or close the dialog
    static confirm({ title, message, confirmLabel = 'OK', danger = false }) {
        return new Promise(resolve => {
            Modal.open({
                title,
                content: createElement('p', 'modal-message', message),
                actions: [
                    { label: 'Cancel' },
                    { label: confirmLabel, kind: danger ? 'danger' : 'primary', onClick: d => d.close(true) },
                ],
                onClose: result => resolve(result === true),
            });
        });
    }

    static alert({ title, message }) {
        return new Promise(resolve => {
            Modal.open({
                title,
                content: createElement('p', 'modal-message', message),
                actions: [{ label: 'OK', kind: 'primary' }],
                onClose: () => resolve(),
            });
        });
    }
}

// ── Terms ──

// Handles the terms and conditions agreement and modal
class TermsManager {
    // Change VERSION whenever TermsAndConditions.txt is updated so visitors are asked to agree again
    static VERSION = '2026-11-09.2';
    static STORAGE_KEY = 'termsAccepted';

    constructor(buttonId, checkboxId) {
        this.button = document.getElementById(buttonId);
        this.checkbox = document.getElementById(checkboxId);
        this.label = document.querySelector(`label[for="${checkboxId}"]`);
    }

    // Opens the terms in a dialog. onAgree (optional) runs after the visitor clicks "I agree".
    showModal(onAgree = null) {
        const actions = [{ label: 'Close' }];
        if (!this.isAgreed()) {
            actions.push({
                label: "I'm 18+ and agree",
                kind: 'primary',
                onClick: (dialog) => {
                    this.agree();
                    dialog.close();
                    onAgree?.();
                },
            });
        }
        const dialog = Modal.open({ title: 'Terms and Conditions', content: createElement('p', '', 'Loading…'), actions });
        this.loadTerms(dialog.body);
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
            if (line.startsWith('- ')) {
                if (!list) list = container.appendChild(createElement('ul'));
                list.append(createElement('li', '', line.slice(2)));
                return;
            }
            list = null;
            let tag = 'p';
            if (index === 0) tag = 'h3';  // Document title
            else if (/^\d+\.\s/.test(line)) tag = 'h4';  // Numbered section heading
            const element = createElement(tag, /^Last updated:/.test(line) ? 'terms-updated' : '', line);
            container.append(element);
        });
    }

    agree() {
        this.checkbox.checked = true;
        this.handleAgreement();
    }

    // Hides the checkbox and label once the user agrees, and remembers it on this device
    handleAgreement() {
        if (!this.checkbox.checked) return;
        this.checkbox.hidden = true;
        if (this.label) this.label.hidden = true;
        // If storage is unavailable (e.g. private mode), the agreement lasts for this page only
        getStorage('localStorage')?.setItem(TermsManager.STORAGE_KEY, TermsManager.VERSION);
    }

    restoreAgreement() {
        if (getStorage('localStorage')?.getItem(TermsManager.STORAGE_KEY) === TermsManager.VERSION) {
            this.agree();
        }
    }

    isAgreed() {
        return this.checkbox.checked;
    }

    init() {
        this.button.addEventListener('click', () => this.showModal());
        this.checkbox.addEventListener('change', () => this.handleAgreement());
        this.restoreAgreement();
    }
}

// ── Server ──

// Sends a message to the server. history is the chat's signed history token (or null for a new chat).
// Resolves to { message, history }: the reply and the chat's updated history token. Rejects on errors;
// when the server explains the problem (e.g. too many messages), error.userMessage holds its explanation.
function requestReply(message, history) {
    return fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
    }).then(response => response.json()
        .catch(() => null)  // Non-JSON responses (e.g. an HTML error page)
        .then(data => {
            if (!data || typeof data.message !== 'string' || !data.message.trim()) {
                throw new Error(`Server error (${response.status})`);
            }
            if (!response.ok) throw Object.assign(new Error(data.message), { userMessage: data.message });
            return { message: data.message, history: typeof data.history === 'string' ? data.history : null };
        }));
}

// ── Saved chats ──

// The visitor's chats and the people they're about, saved only in this browser.
// - By default everything is in sessionStorage: it survives a refresh but is erased when the tab closes,
//   so conversations don't linger on shared devices.
// - With "Remember my chats on this device" on, it's in localStorage instead, so it also survives
//   closing the browser. Chats are then deleted rememberDays after their last message, and people
//   with no chats left are deleted rememberDays after they were last used. Every open tab shares that
//   copy, so each tab picks up the others' changes (see syncFromOtherTab).
// Each chat also holds its signed history token: the AI's memory of that chat (see app.py).
class ChatLibrary {
    static KEY = 'lovelab.chats';
    static REMEMBER_KEY = 'lovelab.remember';
    static LEGACY_KEY = 'lovelab.conversation';  // Single-conversation format used before multiple chats
    static MAX_CHATS = 100;
    static MAX_MESSAGES = 200;
    static TITLE_LENGTH = 48;

    constructor(rememberDays) {
        this.maxAgeMs = rememberDays * 24 * 60 * 60 * 1000;
        this.onSaveFailed = null;  // Called when the browser refuses to save, usually because its storage is full
        for (const name of ['sessionStorage', 'localStorage']) getStorage(name)?.removeItem(ChatLibrary.LEGACY_KEY);
        this.remembered = this.isRemembered();
        this.data = this.read();
        this.pruneExpired();
    }

    // ── Storage ──

    isRemembered() {
        return getStorage('localStorage')?.getItem(ChatLibrary.REMEMBER_KEY) === 'on';
    }

    storage() {
        return getStorage(this.isRemembered() ? 'localStorage' : 'sessionStorage');
    }

    read() {
        const empty = { people: [], chats: [], activeChatId: null };
        try {
            const saved = JSON.parse(this.storage()?.getItem(ChatLibrary.KEY) ?? 'null');
            if (!saved || !Array.isArray(saved.people) || !Array.isArray(saved.chats)) return empty;
            const people = saved.people.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string');
            const personIds = new Set(people.map(p => p.id));
            const chats = saved.chats
                .filter(c => c && typeof c.id === 'string' && Array.isArray(c.messages))
                .map(c => ({
                    ...c,
                    personId: personIds.has(c.personId) ? c.personId : null,
                    messages: c.messages.filter(m =>
                        m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'),
                }));
            return { people, chats, activeChatId: typeof saved.activeChatId === 'string' ? saved.activeChatId : null };
        } catch (e) { return empty; /* Corrupted */ }
    }

    persist() {
        try {
            this.storage()?.setItem(ChatLibrary.KEY, JSON.stringify(this.data));
        } catch (e) {
            this.onSaveFailed?.();
        }
    }

    pruneExpired() {
        if (!this.isRemembered()) return;
        const cutoff = Date.now() - this.maxAgeMs;
        this.data.chats = this.data.chats.filter(c => c.updatedAt > cutoff);
        const inUse = new Set(this.data.chats.map(c => c.personId));
        this.data.people = this.data.people.filter(p => inUse.has(p.id) || p.updatedAt > cutoff);
        this.persist();
    }

    // Moves everything to the storage that matches the new setting. Other open tabs see each change in
    // order (see syncFromOtherTab), so the order matters: the chats are saved before Remember is turned
    // on, and Remember is turned off before the shared copy is removed.
    setRemembered(remember) {
        const local = getStorage('localStorage');
        if (remember) {
            try {
                local?.setItem(ChatLibrary.KEY, JSON.stringify(this.data));
                local?.setItem(ChatLibrary.REMEMBER_KEY, 'on');
                getStorage('sessionStorage')?.removeItem(ChatLibrary.KEY);
            } catch (e) {
                // Couldn't save (e.g. storage full): leave Remember off and keep this tab's copy
                local?.removeItem(ChatLibrary.REMEMBER_KEY);
                local?.removeItem(ChatLibrary.KEY);
                this.onSaveFailed?.();
            }
        } else {
            local?.removeItem(ChatLibrary.REMEMBER_KEY);
            local?.removeItem(ChatLibrary.KEY);
            this.persist();  // Into this tab's sessionStorage
        }
        this.remembered = this.isRemembered();
    }

    // Another tab changed the saved chats or the Remember setting. Without this, each tab would save over
    // the other's changes.
    syncFromOtherTab() {
        const remembered = this.isRemembered();
        if (remembered && !this.remembered) {
            // Another tab turned Remember on: keep this tab's chats as well as theirs
            this.data = ChatLibrary.merge(this.read(), this.data);
            this.persist();
        } else if (remembered) {
            this.data = this.read();  // The tabs share one copy: take the latest
        } else if (this.remembered) {
            // Another tab turned Remember off: like theirs, this tab's chats now last until it's closed
            this.persist();
        }
        this.remembered = remembered;
    }

    // Combines two libraries, keeping the most recently updated version of anything that's in both
    static merge(a, b) {
        const newest = (...lists) => [...lists.flat().reduce((byId, item) => {
            const existing = byId.get(item.id);
            if (!existing || item.updatedAt > existing.updatedAt) byId.set(item.id, item);
            return byId;
        }, new Map()).values()];
        return { people: newest(a.people, b.people), chats: newest(a.chats, b.chats), activeChatId: b.activeChatId };
    }

    // ── People ──

    getPerson(id) {
        return this.data.people.find(p => p.id === id) ?? null;
    }

    addPerson(name, relationship) {
        const person = { id: newId(), name, relationship, updatedAt: Date.now() };
        this.data.people.push(person);
        this.persist();
        return person;
    }

    updatePerson(id, name, relationship) {
        Object.assign(this.getPerson(id) ?? {}, { name, relationship, updatedAt: Date.now() });
        this.persist();
    }

    // Deletes the person and every chat about them
    deletePerson(id) {
        this.data.people = this.data.people.filter(p => p.id !== id);
        this.data.chats = this.data.chats.filter(c => c.personId !== id);
        this.persist();
    }

    chatsAbout(personId) {
        return this.data.chats.filter(c => c.personId === personId);
    }

    // ── Chats ──

    getChat(id) {
        return this.data.chats.find(c => c.id === id) ?? null;
    }

    createChat(personId) {
        const now = Date.now();
        const chat = { id: newId(), personId, title: '', messages: [], history: null, createdAt: now, updatedAt: now };
        this.data.chats.push(chat);
        // Keep the newest chats if the limit is reached
        this.data.chats = this.data.chats.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, ChatLibrary.MAX_CHATS);
        this.persist();
        return chat;
    }

    addMessage(chatId, role, content) {
        const chat = this.getChat(chatId);
        if (!chat) return;
        chat.messages = [...chat.messages, { role, content }].slice(-ChatLibrary.MAX_MESSAGES);
        if (!chat.title && role === 'user') chat.title = ChatLibrary.titleFrom(content);
        chat.updatedAt = Date.now();
        const person = this.getPerson(chat.personId);
        if (person) person.updatedAt = chat.updatedAt;
        this.persist();
    }

    setHistory(chatId, history) {
        const chat = this.getChat(chatId);
        if (!chat) return;
        chat.history = history;
        this.persist();
    }

    deleteChat(id) {
        this.data.chats = this.data.chats.filter(c => c.id !== id);
        if (this.data.activeChatId === id) this.data.activeChatId = null;
        this.persist();
    }

    setActive(chatId) {
        this.data.activeChatId = chatId;
        this.persist();
    }

    static titleFrom(text) {
        const clean = text.replace(/\s+/g, ' ').trim();
        return clean.length > ChatLibrary.TITLE_LENGTH ? `${clean.slice(0, ChatLibrary.TITLE_LENGTH - 1)}…` : clean;
    }

    // People (and "General" for chats not about anyone), most recently active first, each with their
    // chats, newest first. People without chats are included so they can be picked; General only if used.
    groups() {
        const byRecent = (a, b) => b.updatedAt - a.updatedAt;
        const groups = this.data.people.map(person => {
            const chats = this.chatsAbout(person.id).sort(byRecent);
            return { person, chats, updatedAt: Math.max(person.updatedAt, ...chats.map(c => c.updatedAt)) };
        });
        const general = this.chatsAbout(null).sort(byRecent);
        if (general.length) groups.push({ person: null, chats: general, updatedAt: general[0].updatedAt });
        return groups.sort(byRecent);
    }
}

// ── Messages ──

// Adds text to parent, turning **bold** and *italic* into <strong> and <em>
function appendInline(parent, text) {
    const pattern = /\*\*(.+?)\*\*|\*(\S(?:.*?\S)?)\*/g;
    let last = 0;
    for (const match of text.matchAll(pattern)) {
        if (match.index > last) parent.append(text.slice(last, match.index));
        parent.append(createElement(match[1] !== undefined ? 'strong' : 'em', '', match[1] ?? match[2]));
        last = match.index + match[0].length;
    }
    if (last < text.length) parent.append(text.slice(last));
}

// Renders the light Markdown the AI writes (paragraphs, "-" and "1." lists, **bold**, *italic*, and
// "#" headings shown as bold lines). Everything is built with text nodes, so a reply can never
// inject HTML.
function renderRichText(container, text) {
    let paragraph = null;
    let list = null;
    for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
        const line = rawLine.trim();
        if (!line) {
            paragraph = null;  // A blank line ends a paragraph; lists may continue after one
            continue;
        }
        const bullet = line.match(/^[-*•]\s+(.*)$/);
        const numbered = line.match(/^(\d+)[.)]\s+(.*)$/);
        const heading = line.match(/^#{1,6}\s+(.*)$/);

        if (bullet || numbered) {
            const tag = bullet ? 'UL' : 'OL';
            if (list?.tagName !== tag) {
                list = container.appendChild(createElement(tag.toLowerCase()));
                if (numbered && numbered[1] !== '1') list.start = Number(numbered[1]);
            }
            appendInline(list.appendChild(createElement('li')), bullet ? bullet[1] : numbered[2]);
            paragraph = null;
        } else if (heading) {
            paragraph = list = null;
            appendInline(container.appendChild(createElement('p', 'reply-heading')), heading[1]);
        } else if (paragraph) {
            paragraph.append(document.createElement('br'));
            appendInline(paragraph, line);
        } else {
            list = null;
            paragraph = container.appendChild(createElement('p'));
            appendInline(paragraph, line);
        }
    }
}

// Scrolls so a new message can be read from its start: short messages scroll to the bottom, and a
// reply taller than the view is lined up with the top instead
function scrollToMessage(container, element) {
    const margin = 16;
    if (element.offsetHeight + margin * 2 <= container.clientHeight) {
        container.scrollTop = container.scrollHeight;
        return;
    }
    const top = element.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTop += top - margin;
}

// Represents a single chat message and renders it in the chat container. Errors (isError) are shown
// like replies but never saved.
class Message {
    constructor(role, content, isError = false) {
        this.role = role;
        this.content = content;
        this.isError = isError;
    }

    createElement() {
        const element = createElement('div', `message ${this.role === 'user' ? 'user-message' : 'assistant-message'}`);
        if (this.isError) element.classList.add('error-message');
        if (this.role === 'user') element.textContent = this.content;  // Line breaks kept by CSS
        else renderRichText(element, this.content);
        return element;
    }

    // Adds the message to the container and scrolls so it's visible
    display(container) {
        const element = this.createElement();
        container.appendChild(element);
        scrollToMessage(container, element);
    }
}

// Extends Message to display an animated bouncing dots indicator instead of text
class ThinkingMessage extends Message {
    constructor() {
        super('assistant', '');
    }

    createElement() {
        const element = createElement('div', 'message assistant-message thinking-message');
        element.id = 'thinking-message';
        element.setAttribute('aria-label', 'LoveLab is typing');
        for (let i = 0; i < 3; i++) element.append(createElement('span', 'dot'));
        return element;
    }
}

// ── People ──

const RELATIONSHIPS = ['Partner', 'Dating', 'Ex', 'Family', 'Friend', 'Coworker', 'Other'];
const MAX_NAME_LENGTH = 40;

// Example questions shown in an empty chat, matched to who the chat is about. The AI isn't told the
// relationship; these are just conversation starters.
const SUGGESTIONS = {
    General: [
        'How do I make new friends as an adult?',
        'How can I set boundaries without feeling guilty?',
        'How do I tell someone they hurt me?',
    ],
    Partner: [
        'We keep having the same argument. How do we break the cycle?',
        'How can we feel closer when life gets busy?',
        "How do I bring up something that's been bothering me?",
    ],
    Dating: [
        "How can I tell if they're interested in me?",
        'When is the right time to talk about being exclusive?',
        'How do I keep a conversation going on a date?',
    ],
    Ex: [
        'Is it a good idea to stay friends with an ex?',
        'How do I stop thinking about them?',
        'Should I reply to their message?',
    ],
    Family: [
        'How do I set boundaries with a parent?',
        'How can I handle tension at family gatherings?',
        "How do I reconnect with a sibling I've drifted from?",
    ],
    Friend: [
        'My friend keeps cancelling plans. Should I say something?',
        "How do I support a friend who's going through a hard time?",
        'How do I tell a friend they hurt my feelings?',
    ],
    Coworker: [
        'How do I handle a coworker who takes credit for my work?',
        'How can I give honest feedback without making things awkward?',
        "How do I work with someone I don't get along with?",
    ],
};

// The first character as a reader sees it, so an emoji (made of several code units) isn't cut in half
function firstCharacter(text) {
    const trimmed = text.trim();
    if (window.Intl?.Segmenter) {
        for (const { segment } of new Intl.Segmenter().segment(trimmed)) return segment;
    }
    return [...trimmed][0] ?? '';
}

// A round badge with the person's initial, coloured consistently from their id
function createAvatar(person) {
    const avatar = createElement('span', 'person-avatar', person ? firstCharacter(person.name).toUpperCase() : '✦');
    avatar.setAttribute('aria-hidden', 'true');
    if (person) {
        const hash = [...person.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
        // Stepping by the golden angle spreads even near-identical ids far apart on the colour wheel
        const hue = Math.round((hash * 137.508) % 360);
        avatar.style.setProperty('--avatar-hue', hue);  // CSSOM is allowed by the Content-Security-Policy
    } else {
        avatar.classList.add('general');
    }
    return avatar;
}

function personLabel(person) {
    return person.relationship ? `${person.name} · ${person.relationship}` : person.name;
}

// The name + relationship form used to add or edit a person. onSubmit({ name, relationship }).
function createPersonForm({ person = null, submitLabel, onSubmit }) {
    const form = createElement('form', 'person-form');

    const nameLabel = createElement('label', 'field');
    nameLabel.append(createElement('span', 'field-label', 'Name or nickname'));
    const nameInput = createElement('input');
    Object.assign(nameInput, { type: 'text', maxLength: MAX_NAME_LENGTH, required: true, autocomplete: 'off' });
    nameInput.placeholder = 'e.g. Sarah, Mom, my boss';
    nameInput.value = person?.name ?? '';
    nameLabel.append(nameInput);

    const relationshipLabel = createElement('label', 'field');
    relationshipLabel.append(createElement('span', 'field-label', 'Relationship'));
    const select = createElement('select');
    RELATIONSHIPS.forEach(r => select.append(new Option(r, r, false, r === (person?.relationship ?? 'Partner'))));
    relationshipLabel.append(select);

    const submit = createElement('button', 'modal-button primary', submitLabel);
    submit.type = 'submit';

    form.append(nameLabel, relationshipLabel, submit);
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = nameInput.value.replace(/\s+/g, ' ').trim();
        if (!name) { nameInput.focus(); return; }
        onSubmit({ name, relationship: select.value });
    });
    return { form, nameInput };
}

// ── Chat app ──

// Controls the chat page: the conversation, the chat list in the sidebar, and the header buttons.
// The current chat is { chatId, personId }; chatId is null for a new chat that has no messages yet.
class ChatApp {
    constructor(drawer) {
        this.drawer = drawer;
        this.messageContainer = document.getElementById('message-container');
        this.form = document.getElementById('chat-form');
        this.input = document.getElementById('input-message');
        this.sendButton = this.form.querySelector('[type="submit"]');
        this.headerTitle = document.getElementById('header-title');
        this.newChatButton = document.getElementById('new-chat');
        this.deleteChatButton = document.getElementById('delete-chat');
        this.chatList = document.getElementById('chat-list');
        this.addPersonButton = document.getElementById('add-person');
        this.rememberSwitch = document.getElementById('remember-chat');
        this.rememberNote = document.getElementById('remember-note');
        this.emptyState = document.getElementById('empty-state');
        this.emptyTitle = document.getElementById('empty-title');
        this.suggestions = document.getElementById('suggestions');
        this.announcer = document.getElementById('chat-announcer');
        this.terms = new TermsManager('terms-button', 'terms');
        this.library = new ChatLibrary(Number(this.form.dataset.rememberDays) || 30);
        this.library.onSaveFailed = () => this.warnSaveFailed();
        this.saveWarningShown = false;
        this.current = { chatId: null, personId: null };
        this.pendingChatId = null;  // The chat waiting for a reply, if any
    }

    // ── Sending ──

    send() {
        if (this.pendingChatId) return;  // One message at a time
        const userMessage = this.input.value.trim();
        if (!userMessage) return;

        // Instead of blocking with an alert, show the terms; agreeing sends the message
        if (!this.terms.isAgreed()) {
            this.terms.showModal(() => this.send());
            return;
        }

        if (!this.current.chatId) {
            const chat = this.library.createChat(this.current.personId);
            this.current.chatId = chat.id;
            this.library.setActive(chat.id);
        }
        const chatId = this.current.chatId;
        const chat = this.library.getChat(chatId);

        this.addMessage('user', userMessage);
        this.library.addMessage(chatId, 'user', userMessage);
        this.input.value = '';
        this.setPending(chatId);
        this.renderSidebar();

        requestReply(userMessage, chat.history)
            .then(({ message, history }) => {
                this.library.addMessage(chatId, 'assistant', message);
                this.library.setHistory(chatId, history);
                if (this.current.chatId === chatId) {
                    this.hideThinking();
                    this.addMessage('assistant', message);
                    this.announce(message);
                }
            })
            .catch(error => {
                // Always clear the typing indicator so the chat never gets stuck. Errors are shown but
                // not saved, so they don't reappear later or replace the chat's history.
                console.error('Error:', error);
                if (this.current.chatId === chatId) {
                    const message = error.userMessage
                        || 'Sorry, something went wrong on our end. Please try again in a moment.';
                    this.hideThinking();
                    this.addMessage('assistant', message, true);
                    this.announce(message);
                }
            })
            .finally(() => {
                this.setPending(null);
                this.renderSidebar();
                this.focusInput();
            });
    }

    // Screen readers read out each reply as it arrives. (The message list itself isn't a live region, or
    // switching chats would read out the whole conversation.)
    announce(text) {
        this.announcer.textContent = '';
        // Set after a pause, so a reply identical to the last one is still announced
        setTimeout(() => { this.announcer.textContent = `LoveLab: ${text}`; }, 100);
    }

    // The browser refused to save the chats, usually because its storage for this site is full. Say so
    // once, rather than letting new messages silently disappear on the next visit.
    warnSaveFailed() {
        if (this.saveWarningShown) return;
        this.saveWarningShown = true;
        Modal.alert({
            title: 'Your chats couldn\'t be saved',
            message: 'This browser isn\'t letting LoveLab save your chats, usually because its storage is full. '
                + 'New messages won\'t be kept after you leave or refresh the page. Deleting some old chats '
                + 'may free up space.',
        });
    }

    // Disables Send (and Delete chat) while a reply is pending so messages can't be double-sent and a
    // reply can't arrive into a deleted chat; typing and switching chats stay allowed
    setPending(chatId) {
        this.pendingChatId = chatId;
        this.sendButton.disabled = Boolean(chatId);
        if (chatId && chatId === this.current.chatId) this.showThinking();
        this.updateHeader();
    }

    addMessage(role, content, isError = false) {
        this.showEmptyState(false);
        new Message(role, content, isError).display(this.messageContainer);
    }

    // An empty chat shows a greeting and example questions suited to who the chat is about
    showEmptyState(show) {
        this.emptyState.hidden = !show;
        if (!show) return;
        const person = this.library.getPerson(this.current.personId);
        this.emptyTitle.textContent = person ? `What's going on with ${person.name}?` : "What's on your mind?";
        const questions = SUGGESTIONS[person?.relationship] ?? SUGGESTIONS.General;
        this.suggestions.replaceChildren(...questions.map(question => {
            const button = createElement('button', 'suggestion', question);
            button.type = 'button';
            return button;
        }));
    }

    // Sends an example question as if the visitor typed it (agreeing to the terms first if needed)
    useSuggestion(event) {
        const button = event.target.closest('.suggestion');
        if (!button) return;
        this.input.value = button.textContent;
        this.send();
    }

    showThinking() {
        if (!document.getElementById('thinking-message')) new ThinkingMessage().display(this.messageContainer);
    }

    hideThinking() {
        document.getElementById('thinking-message')?.remove();
    }

    // ── Switching chats ──

    // Shows a chat (or, with chatId null, a new empty chat about personId)
    openChat(chatId, personId = null) {
        const chat = chatId ? this.library.getChat(chatId) : null;
        this.current = { chatId: chat?.id ?? null, personId: chat ? chat.personId : personId };
        this.library.setActive(this.current.chatId);
        this.renderMessages(chat);

        this.input.value = '';
        this.updateHeader();
        this.renderSidebar();
        this.drawer?.close();
        this.focusInput();
    }

    // Shows a chat's saved messages, or the greeting if it has none
    renderMessages(chat) {
        this.messageContainer.querySelectorAll('.message').forEach(element => element.remove());
        this.showEmptyState(!chat?.messages.length);
        chat?.messages.forEach(({ role, content }) => this.addMessage(role, content));
        if (chat && chat.id === this.pendingChatId) this.showThinking();
    }

    // Another tab changed the saved chats: catch up without disturbing anything being typed here
    handleStorageEvent(event) {
        const local = getStorage('localStorage');
        if (!local || event.storageArea !== local) return;
        if (![ChatLibrary.KEY, ChatLibrary.REMEMBER_KEY, null].includes(event.key)) return;  // null: storage cleared

        this.library.syncFromOtherTab();
        this.showRememberSetting(this.library.isRemembered());
        const { chatId, personId } = this.current;
        const chat = chatId ? this.library.getChat(chatId) : null;
        if (chatId && !chat) {
            // This chat was deleted in the other tab: start a new one about the same person, if they're still here
            this.current = { chatId: null, personId: this.library.getPerson(personId) ? personId : null };
            this.renderMessages(null);
        } else if (!chatId && personId && !this.library.getPerson(personId)) {
            // A new chat about someone who was deleted in the other tab
            this.current.personId = null;
            this.renderMessages(null);
        } else if (chat) {
            this.current.personId = chat.personId;
            // Redraw only if the other tab added messages to this chat
            if (chat.messages.length !== this.shownMessageCount()) this.renderMessages(chat);
        }
        this.updateHeader();
        this.renderSidebar();
    }

    // How many of the chat's saved messages are on screen (errors and the typing indicator aren't saved)
    shownMessageCount() {
        return this.messageContainer.querySelectorAll('.message:not(.thinking-message):not(.error-message)').length;
    }

    // Opens a chat after choosing who it's about
    async startNewChat() {
        const choice = await this.choosePerson();
        if (choice !== undefined) this.openChat(null, choice);
    }

    // Resolves to a person id, null for "General", or undefined if the visitor cancels
    choosePerson() {
        return new Promise(resolve => {
            let chosen;
            const content = createElement('div', 'person-picker');
            content.append(createElement('p', 'picker-hint',
                'Chats about the same person are kept together. Names stay on this device; LoveLab isn\'t told who a chat is about.'));

            const options = createElement('div', 'picker-options');
            const pick = (personId) => { chosen = personId; dialog.close(); };
            this.library.groups().filter(g => g.person).forEach(({ person }) => {
                const option = createButton('picker-option', '', () => pick(person.id));
                option.append(createAvatar(person), createElement('span', 'picker-option-label', personLabel(person)));
                options.append(option);
            });
            const general = createButton('picker-option', '', () => pick(null));
            general.append(createAvatar(null), createElement('span', 'picker-option-label', 'General: not about anyone in particular'));
            options.append(general);
            content.append(options);

            content.append(createElement('p', 'picker-divider', 'Or add someone new'));
            const { form } = createPersonForm({
                submitLabel: 'Add and start chat',
                onSubmit: ({ name, relationship }) => pick(this.library.addPerson(name, relationship).id),
            });
            content.append(form);

            const dialog = Modal.open({
                title: 'Who is this chat about?',
                content,
                className: 'modal-narrow',
                onClose: () => resolve(chosen),
            });
        });
    }

    addPerson() {
        const { form, nameInput } = createPersonForm({
            submitLabel: 'Add and start chat',
            onSubmit: ({ name, relationship }) => {
                const person = this.library.addPerson(name, relationship);
                dialog.close();
                this.openChat(null, person.id);
            },
        });
        const dialog = Modal.open({ title: 'Add a person', content: form, className: 'modal-narrow' });
        nameInput.focus();
    }

    editPerson(personId) {
        const person = this.library.getPerson(personId);
        if (!person) return;
        const { form, nameInput } = createPersonForm({
            person,
            submitLabel: 'Save',
            onSubmit: ({ name, relationship }) => {
                this.library.updatePerson(personId, name, relationship);
                dialog.close();
                this.updateHeader();
                this.renderSidebar();
            },
        });
        const remove = createButton('text-button danger', `Delete ${person.name} and their chats`, () => {
            dialog.close();
            this.deletePerson(personId);
        });
        const content = createElement('div');
        content.append(form, remove);
        const dialog = Modal.open({ title: `Edit ${person.name}`, content, className: 'modal-narrow' });
        nameInput.focus();
    }

    async deletePerson(personId) {
        const person = this.library.getPerson(personId);
        const chats = this.library.chatsAbout(personId);
        if (!person) return;
        if (chats.some(c => c.id === this.pendingChatId)) {
            await Modal.alert({ title: 'Please wait', message: 'LoveLab is still replying in one of these chats.' });
            return;
        }
        const count = chats.length === 1 ? '1 chat' : `${chats.length} chats`;
        const confirmed = await Modal.confirm({
            title: `Delete ${person.name}?`,
            message: `${person.name} and ${count} about them will be erased from this device, along with LoveLab's memory of `
                + 'those chats. This can\'t be undone. (Anonymous copies kept by LoveLab, described in the Terms, can\'t be deleted.)',
            confirmLabel: 'Delete',
            danger: true,
        });
        if (!confirmed) return;
        const wasCurrent = this.current.personId === personId;
        this.library.deletePerson(personId);
        if (wasCurrent) this.openChat(null, null);
        else this.renderSidebar();
    }

    async deleteChat(chatId = this.current.chatId) {
        const chat = this.library.getChat(chatId);
        if (!chat || chatId === this.pendingChatId) return;
        const confirmed = await Modal.confirm({
            title: 'Delete this chat?',
            message: 'It will be erased from this device, along with LoveLab\'s memory of it, and can\'t be recovered. '
                + '(Anonymous copies kept by LoveLab, described in the Terms, can\'t be deleted.)',
            confirmLabel: 'Delete',
            danger: true,
        });
        if (!confirmed) return;
        this.library.deleteChat(chatId);
        if (this.current.chatId === chatId) this.openChat(null, chat.personId);
        else this.renderSidebar();
    }

    // ── Rendering ──

    updateHeader() {
        const person = this.library.getPerson(this.current.personId);
        this.headerTitle.textContent = person ? personLabel(person) : 'LoveLab';
        this.deleteChatButton.disabled = !this.current.chatId || this.current.chatId === this.pendingChatId;
    }

    renderSidebar() {
        const groups = this.library.groups();
        this.chatList.replaceChildren();
        if (!groups.length) {
            this.chatList.append(createElement('p', 'chat-list-empty',
                'Your chats will appear here. Add the people in your life to keep chats about each of them together.'));
            return;
        }
        groups.forEach(({ person, chats }) => this.chatList.append(this.renderGroup(person, chats)));
    }

    renderGroup(person, chats) {
        const group = createElement('section', 'person-group');
        const personId = person?.id ?? null;
        const row = createElement('div', 'person-row');
        if (personId === this.current.personId && !this.current.chatId) row.classList.add('active');

        const label = createElement('span', 'person-label');
        label.append(createElement('span', 'person-name', person ? person.name : 'General'));
        if (person?.relationship) label.append(createElement('span', 'person-relationship', person.relationship));
        row.append(createAvatar(person), label);

        const name = person ? person.name : 'General';
        const newChat = createButton('icon-button', '＋');
        Object.assign(newChat.dataset, { action: 'new-chat', personId: personId ?? '' });
        newChat.setAttribute('aria-label', `New chat about ${name}`);
        newChat.title = 'New chat';
        row.append(newChat);
        if (person) {
            const edit = createButton('icon-button', '⋯');
            Object.assign(edit.dataset, { action: 'edit-person', personId });
            edit.setAttribute('aria-label', `Edit ${name}`);
            edit.title = 'Edit';
            row.append(edit);
        }
        group.append(row);

        if (chats.length) {
            const list = createElement('ul', 'chat-items');
            chats.forEach(chat => {
                const item = createElement('li', `chat-item${chat.id === this.current.chatId ? ' active' : ''}`);
                const open = createButton('chat-open', chat.title || 'New chat');
                open.dataset.action = 'open-chat';
                open.dataset.chatId = chat.id;
                if (chat.id === this.current.chatId) open.setAttribute('aria-current', 'true');
                const remove = createButton('icon-button chat-delete', '×');
                Object.assign(remove.dataset, { action: 'delete-chat', chatId: chat.id });
                remove.setAttribute('aria-label', `Delete chat "${chat.title}"`);
                remove.title = 'Delete chat';
                item.append(open, remove);
                list.append(item);
            });
            group.append(list);
        }
        return group;
    }

    // One click handler for the whole chat list
    handleChatListClick(e) {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const { action, chatId, personId } = target.dataset;
        if (action === 'open-chat') this.openChat(chatId);
        else if (action === 'new-chat') this.openChat(null, personId || null);
        else if (action === 'edit-person') this.editPerson(personId);
        else if (action === 'delete-chat') this.deleteChat(chatId);
    }

    showRememberSetting(remember) {
        this.rememberSwitch.checked = remember;
        this.rememberNote.hidden = !remember;
    }

    // Focus the message box on desktop only; on phones it would pop the keyboard open
    focusInput() {
        if (window.matchMedia('(pointer: fine)').matches) this.input.focus();
    }

    init() {
        this.form.addEventListener('submit', (e) => { e.preventDefault(); this.send(); });
        this.newChatButton.addEventListener('click', () => this.startNewChat());
        this.deleteChatButton.addEventListener('click', () => this.deleteChat());
        this.addPersonButton.addEventListener('click', () => this.addPerson());
        this.chatList.addEventListener('click', (e) => this.handleChatListClick(e));
        this.suggestions.addEventListener('click', (e) => this.useSuggestion(e));
        window.addEventListener('storage', (e) => this.handleStorageEvent(e));
        this.rememberSwitch.addEventListener('change', () => {
            this.library.setRemembered(this.rememberSwitch.checked);
            this.showRememberSetting(this.library.isRemembered());  // Stays off if the browser blocks storage
        });
        this.terms.init();
        this.showRememberSetting(this.library.isRemembered());
        this.openChat(this.library.data.activeChatId);
    }
}

// ── Entry point ──
document.addEventListener('DOMContentLoaded', () => {
    new ThemeManager('theme-toggle').init();
    const drawer = new SidebarDrawer('sidebar', 'menu-button', 'sidebar-backdrop');
    drawer.init();

    if (document.getElementById('chat-form')) {
        new ChatApp(drawer).init();
    }
});
