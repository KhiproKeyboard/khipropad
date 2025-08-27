/**
 * KhiproPad - Main Application Logic
 */

class KhiproPadApp {
    constructor() {
        this.currentDraft = null;
        this.drafts = this.loadDrafts();
        this.autoSaveTimeout = null;
        this.isConverting = false;
        
        // IME-style conversion state
        this.currentWord = '';
        this.wordStartPos = 0;
        this.isComposing = false;
        
        this.initializeElements();
        this.bindEvents();
        this.loadLastDraft();
        this.updateStats();
        this.createConversionPopup();
    }

    initializeElements() {
        // Core elements
        this.editor = document.getElementById('editor');
        this.sidebar = document.getElementById('sidebar');
        this.draftList = document.getElementById('draft-list');
        
        // Document title elements (desktop and mobile)
        this.documentTitle = document.getElementById('document-title');
        this.documentTitleMobile = document.getElementById('document-title-mobile');
        
        // Stats elements (desktop and mobile)
        this.wordCount = document.getElementById('word-count');
        this.charCount = document.getElementById('char-count');
        this.lastSaved = document.getElementById('last-saved');
        this.wordCountMobile = document.getElementById('word-count-mobile');
        this.charCountMobile = document.getElementById('char-count-mobile');
        this.lastSavedMobile = document.getElementById('last-saved-mobile');
        
        // Control elements
        this.themeToggle = document.getElementById('theme-toggle');
        this.newDraftBtn = document.getElementById('new-draft');
        this.sidebarToggle = document.getElementById('sidebar-toggle');
        this.sidebarOverlay = document.getElementById('sidebar-overlay');
    }

    bindEvents() {
        // Editor events with IME-style conversion
        this.editor.addEventListener('input', (e) => this.handleEditorInput(e));
        this.editor.addEventListener('keydown', (e) => this.handleKeyDown(e));
        this.editor.addEventListener('keyup', (e) => this.handleKeyUp(e));
        this.editor.addEventListener('click', (e) => this.handleEditorClick(e));
        this.editor.addEventListener('blur', (e) => this.handleEditorBlur(e));
        
        // Document title (both desktop and mobile)
        this.documentTitle.addEventListener('input', () => this.handleTitleChange());
        if (this.documentTitleMobile) {
            this.documentTitleMobile.addEventListener('input', () => this.handleTitleChangeMobile());
        }
        
        // Theme toggle
        this.themeToggle.addEventListener('click', () => this.toggleTheme());
        
        // Sidebar toggle (mobile)
        if (this.sidebarToggle) {
            this.sidebarToggle.addEventListener('click', () => this.toggleSidebar());
        }
        
        // Sidebar overlay (mobile)
        if (this.sidebarOverlay) {
            this.sidebarOverlay.addEventListener('click', () => this.closeSidebar());
        }
        
        // New draft
        this.newDraftBtn.addEventListener('click', () => this.createNewDraft());
        
        // Auto-save on page unload
        window.addEventListener('beforeunload', () => this.saveDraft());
    }

    handleEditorInput(e) {
        if (this.isConverting) return;
        
        const cursorPos = this.editor.selectionStart;
        let text = this.editor.value;
        
        // Convert uppercase to lowercase for better Khipro conversion
        const lowercaseText = text.toLowerCase();
        if (text !== lowercaseText) {
            // Update textarea with lowercase text
            this.editor.value = lowercaseText;
            // Restore cursor position
            this.editor.setSelectionRange(cursorPos, cursorPos);
            text = lowercaseText;
        }
        
        // Update stats
        this.updateStats();
        
        // Handle IME-style word composition
        this.updateCurrentWord(cursorPos, text);
        
        // Auto-save with debounce
        this.scheduleAutoSave();
    }
    
    updateCurrentWord(cursorPos, text) {
        // Find word boundaries around cursor
        const beforeCursor = text.substring(0, cursorPos);
        const afterCursor = text.substring(cursorPos);
        
        // Find start of current word (last space or start of text)
        const wordStart = Math.max(
            beforeCursor.lastIndexOf(' '),
            beforeCursor.lastIndexOf('\n'),
            beforeCursor.lastIndexOf('\t')
        ) + 1;
        
        // Find end of current word (next space or end of text)
        const spaceAfter = afterCursor.search(/[\s\n\t]/);
        const wordEnd = spaceAfter === -1 ? text.length : cursorPos + spaceAfter;
        
        // Extract current word
        const currentWord = text.substring(wordStart, wordEnd);
        
        // Process if word contains any ASCII characters (printable characters 32-126)
        if (currentWord && /[\x20-\x7E]/.test(currentWord)) {
            this.currentWord = currentWord;
            this.wordStartPos = wordStart;
            this.isComposing = true;
            
            // Show conversion preview
            this.showConversionPreview(currentWord, cursorPos);
        } else {
            this.hideConversionPreview();
            this.isComposing = false;
        }
    }

    handleKeyDown(e) {
        // Handle commit keys (Space, Enter) during composition
        if (this.isComposing && (e.key === ' ' || e.key === 'Enter')) {
            e.preventDefault();
            this.commitCurrentWord();
            
            // Add the space or newline after commit
            if (e.key === ' ') {
                this.insertTextAtCursor(' ');
            } else if (e.key === 'Enter') {
                this.insertTextAtCursor('\n');
            }
            return;
        }
        
        // Handle Escape to cancel composition
        if (this.isComposing && e.key === 'Escape') {
            e.preventDefault();
            this.cancelComposition();
            return;
        }
        
        // Handle special key combinations
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 's':
                    e.preventDefault();
                    this.saveDraft();
                    break;
                case 'n':
                    e.preventDefault();
                    this.createNewDraft();
                    break;
            }
        }
    }
    
    handleKeyUp(e) {
        // Update cursor position for popup positioning
        if (this.isComposing) {
            this.updatePopupPosition();
        }
    }
    
    handleEditorClick(e) {
        // Hide popup when clicking elsewhere
        if (this.isComposing) {
            const cursorPos = this.editor.selectionStart;
            const text = this.editor.value;
            this.updateCurrentWord(cursorPos, text);
        }
    }
    
    handleEditorBlur(e) {
        // Commit current word when editor loses focus
        if (this.isComposing) {
            this.commitCurrentWord();
        }
    }

    handleTitleChange() {
        if (this.currentDraft) {
            const newTitle = this.documentTitle.value || 'Untitled Document';
            this.currentDraft.title = newTitle;
            // Sync with mobile input
            if (this.documentTitleMobile) {
                this.documentTitleMobile.value = newTitle;
            }
            this.scheduleAutoSave();
            this.renderDraftList();
        }
    }

    handleTitleChangeMobile() {
        if (this.currentDraft) {
            const newTitle = this.documentTitleMobile.value || 'Untitled Document';
            this.currentDraft.title = newTitle;
            // Sync with desktop input
            this.documentTitle.value = newTitle;
            this.scheduleAutoSave();
            this.renderDraftList();
        }
    }

    // IME-style conversion methods
    createConversionPopup() {
        this.popup = document.createElement('div');
        this.popup.className = 'conversion-popup';
        this.popup.style.cssText = `
            position: absolute;
            background: #2d3748;
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 16px;
            font-family: 'Anek Bangla', sans-serif;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 1000;
            display: none;
            pointer-events: none;
            border: 1px solid #4a5568;
        `;
        document.body.appendChild(this.popup);
    }

    showConversionPreview(word, cursorPos) {
        const convertedWord = convert(word);
        
        // Show preview if conversion is available, otherwise keep composing for potential future matches
        if (convertedWord !== word) {
            this.popup.textContent = convertedWord;
            this.popup.style.display = 'block';
            this.updatePopupPosition();
        } else {
            // Hide popup but keep composing state for potential longer matches
            this.popup.style.display = 'none';
        }
    }

    hideConversionPreview() {
        this.popup.style.display = 'none';
    }

    updatePopupPosition() {
        if (!this.isComposing) return;
        
        const cursorPos = this.editor.selectionStart;
        const textBeforeCursor = this.editor.value.substring(0, cursorPos);
        
        // Create a temporary element to measure text dimensions
        const measurer = document.createElement('div');
        measurer.style.cssText = `
            position: absolute;
            visibility: hidden;
            white-space: pre-wrap;
            font-family: ${getComputedStyle(this.editor).fontFamily};
            font-size: ${getComputedStyle(this.editor).fontSize};
            line-height: ${getComputedStyle(this.editor).lineHeight};
            padding: ${getComputedStyle(this.editor).padding};
            border: ${getComputedStyle(this.editor).border};
            width: ${this.editor.offsetWidth}px;
        `;
        measurer.textContent = textBeforeCursor;
        document.body.appendChild(measurer);
        
        const editorRect = this.editor.getBoundingClientRect();
        const lines = textBeforeCursor.split('\n');
        const currentLine = lines.length - 1;
        const currentColumn = lines[lines.length - 1].length;
        
        // Approximate cursor position
        const lineHeight = parseInt(getComputedStyle(this.editor).lineHeight) || 24;
        const charWidth = 8; // Approximate character width
        
        const x = editorRect.left + (currentColumn * charWidth) + 10;
        const y = editorRect.top + (currentLine * lineHeight) + lineHeight + 5;
        
        this.popup.style.left = `${x}px`;
        this.popup.style.top = `${y}px`;
        
        document.body.removeChild(measurer);
    }

    commitCurrentWord() {
        if (!this.isComposing || !this.currentWord) return;
        
        this.isConverting = true;
        
        const convertedWord = convert(this.currentWord);
        const text = this.editor.value;
        const wordEnd = this.wordStartPos + this.currentWord.length;
        
        // Replace the current word with converted text
        const newText = text.substring(0, this.wordStartPos) + 
                       convertedWord + 
                       text.substring(wordEnd);
        
        this.editor.value = newText;
        
        // Position cursor after the converted word
        const newCursorPos = this.wordStartPos + convertedWord.length;
        this.editor.setSelectionRange(newCursorPos, newCursorPos);
        
        // Reset composition state
        this.isComposing = false;
        this.currentWord = '';
        this.hideConversionPreview();
        
        this.isConverting = false;
        this.updateStats();
        this.scheduleAutoSave();
    }

    cancelComposition() {
        this.isComposing = false;
        this.currentWord = '';
        this.hideConversionPreview();
    }

    insertTextAtCursor(text) {
        const cursorPos = this.editor.selectionStart;
        const currentText = this.editor.value;
        
        this.editor.value = currentText.substring(0, cursorPos) + 
                           text + 
                           currentText.substring(cursorPos);
        
        const newCursorPos = cursorPos + text.length;
        this.editor.setSelectionRange(newCursorPos, newCursorPos);
        
        this.updateStats();
        this.scheduleAutoSave();
    }

    updateStats() {
        const text = this.editor.value;
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const chars = text.length;
        
        // Update desktop stats
        this.wordCount.textContent = `${words} words`;
        this.charCount.textContent = `${chars} characters`;
        
        // Update mobile stats
        if (this.wordCountMobile) {
            this.wordCountMobile.textContent = `${words} words`;
        }
        if (this.charCountMobile) {
            this.charCountMobile.textContent = `${chars} characters`;
        }
    }

    scheduleAutoSave() {
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            this.saveDraft();
        }, 2000); // Auto-save after 2 seconds of inactivity
    }

    saveDraft() {
        if (!this.currentDraft) return;
        
        this.currentDraft.content = this.editor.value;
        this.currentDraft.title = this.documentTitle.value || 'Untitled Document';
        this.currentDraft.lastModified = new Date().toISOString();
        
        this.saveDrafts();
        
        // Update both desktop and mobile "last saved" text
        this.lastSaved.textContent = 'Auto-saved';
        if (this.lastSavedMobile) {
            this.lastSavedMobile.textContent = 'Auto-saved';
        }
        
        // Clear the "Auto-saved" message after 2 seconds
        setTimeout(() => {
            const formattedTime = this.formatLastSaved(this.currentDraft.lastModified);
            this.lastSaved.textContent = formattedTime;
            if (this.lastSavedMobile) {
                this.lastSavedMobile.textContent = formattedTime;
            }
        }, 2000);
    }

    createNewDraft() {
        // Save current draft first
        if (this.currentDraft) {
            this.saveDraft();
        }
        
        // Create new draft with proper numbering
        const draftNumber = this.drafts.length + 1;
        const newDraft = {
            id: Date.now().toString(),
            title: `Draft ${draftNumber}`,
            content: '',
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };
        
        this.drafts.push(newDraft);
        this.currentDraft = newDraft;
        
        // Update UI
        this.editor.value = '';
        this.documentTitle.value = newDraft.title;
        this.updateStats();
        this.renderDraftList();
        this.saveDrafts();
        
        // Focus editor
        this.editor.focus();
    }

    loadDraft(draft) {
        // Save current draft first
        if (this.currentDraft) {
            this.saveDraft();
        }
        
        this.currentDraft = draft;
        this.editor.value = draft.content;
        this.rawText = draft.content; // Sync raw text with loaded content
        
        // Update both desktop and mobile title inputs
        this.documentTitle.value = draft.title;
        if (this.documentTitleMobile) {
            this.documentTitleMobile.value = draft.title;
        }
        
        this.updateStats();
        this.renderDraftList();
        
        this.editor.focus();
    }

    deleteDraft(draftId) {
        const index = this.drafts.findIndex(d => d.id === draftId);
        if (index === -1) return;
        
        const draft = this.drafts[index];
        
        // If deleting current draft, switch to another or create new
        if (this.currentDraft && this.currentDraft.id === draftId) {
            if (this.drafts.length > 1) {
                const nextDraft = this.drafts[index + 1] || this.drafts[index - 1];
                this.loadDraft(nextDraft);
            } else {
                this.createNewDraft();
            }
        }
        
        this.drafts.splice(index, 1);
        this.renderDraftList();
        this.saveDrafts();
    }

    renderDraftList() {
        this.draftList.innerHTML = '';
        
        this.drafts.forEach(draft => {
            const draftElement = document.createElement('div');
            draftElement.className = `draft-item ${this.currentDraft && this.currentDraft.id === draft.id ? 'active' : ''}`;
            
            draftElement.innerHTML = `
                <div class="flex items-center justify-between">
                    <div class="flex-1 min-w-0">
                        <h4 class="text-sm font-medium text-dark-text dark:text-dark-text-light truncate">
                            ${this.escapeHtml(draft.title)}
                        </h4>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            ${this.formatLastSaved(draft.lastModified)}
                        </p>
                    </div>
                    <button class="delete-draft ml-2 p-1 text-gray-400 hover:text-red-500 transition-colors" 
                            data-draft-id="${draft.id}">
                        <i class="fas fa-trash text-xs"></i>
                    </button>
                </div>
            `;
            
            // Click to load draft
            draftElement.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-draft')) {
                    this.loadDraft(draft);
                }
            });
            
            // Delete draft
            const deleteBtn = draftElement.querySelector('.delete-draft');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('Delete this draft?')) {
                    this.deleteDraft(draft.id);
                }
            });
            
            this.draftList.appendChild(draftElement);
        });
    }

    toggleTheme() {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.theme = isDark ? 'dark' : 'light';
        
        // Update theme icon
        const icon = this.themeToggle.querySelector('i');
        icon.className = isDark ? 'fas fa-sun text-lg' : 'fas fa-moon text-lg';
    }

    toggleSidebar() {
        const isOpen = this.sidebar.classList.contains('open');
        
        if (isOpen) {
            this.closeSidebar();
        } else {
            this.openSidebar();
        }
    }

    openSidebar() {
        this.sidebar.classList.add('open');
        this.sidebarOverlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }

    closeSidebar() {
        this.sidebar.classList.remove('open');
        this.sidebarOverlay.classList.add('hidden');
        document.body.style.overflow = ''; // Restore scrolling
    }


    loadDrafts() {
        try {
            const saved = localStorage.getItem('khipropad-drafts');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error('Error loading drafts:', e);
            return [];
        }
    }

    saveDrafts() {
        try {
            localStorage.setItem('khipropad-drafts', JSON.stringify(this.drafts));
        } catch (e) {
            console.error('Error saving drafts:', e);
        }
    }

    loadLastDraft() {
        if (this.drafts.length > 0) {
            this.loadDraft(this.drafts[0]);
        } else {
            // Create default Draft 1
            const defaultDraft = {
                id: Date.now().toString(),
                title: 'Draft 1',
                content: '',
                createdAt: new Date().toISOString(),
                lastModified: new Date().toISOString()
            };
            
            this.drafts.push(defaultDraft);
            this.currentDraft = defaultDraft;
            this.editor.value = '';
            this.documentTitle.value = defaultDraft.title;
            this.saveDrafts();
        }
        this.renderDraftList();
    }

    formatLastSaved(isoString) {
        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
        return date.toLocaleDateString();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.khiproPadApp = new KhiproPadApp();
});
