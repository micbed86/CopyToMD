/**
 * Content script for "Copy with Formatting (as Markdown)" Chrome Extension.
 * Handles the shortcut listener, Markdown conversion, and settings UI.
 */

(async function () {
    'use strict';

    const STORAGE_KEY = 'copyAsMarkdown_settings';
    const locales = window.camLocales || {};
    let t = locales['en']; // Zostanie nadpisane po załadowaniu ustawień

    const DEFAULT_SETTINGS = {
        isEnabled: true,
        ignoreLinks: false,
        language: 'auto',
        shortcut: {
            key: 'c',
            ctrlKey: true,
            shiftKey: true,
            altKey: false,
        },
        secondaryEnabled: false,
        secondaryShortcut: {
            key: 'x',
            ctrlKey: true,
            shiftKey: true,
            altKey: false,
        },
        notificationText: 'Copied with formatting!',
        notificationDurationS: 2.5,
    };

    let settings = {};

    function updateTranslations() {
        const langPref = settings.language || 'auto';
        let currentLang = 'en';
        if (langPref === 'auto') {
            currentLang = navigator.language.startsWith('pl') ? 'pl' : 'en';
        } else {
            currentLang = langPref;
        }
        t = locales[currentLang] || locales['en'];
        
        // Zabezpieczenie domyślnych powiadomień w przypadku zmiany języka (jeśli równe domyślnym z innego języka)
        if (settings.notificationText === locales['en'].notifications.copied || settings.notificationText === locales['pl'].notifications.copied) {
             settings.notificationText = t.notifications.copied;
        }
    }

    function injectStyles(css) {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    async function loadSettings() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(STORAGE_KEY, (result) => {
                const savedSettings = result[STORAGE_KEY] || {};
                settings = { ...DEFAULT_SETTINGS, ...savedSettings };
                settings.shortcut = { ...DEFAULT_SETTINGS.shortcut, ...savedSettings.shortcut };
                settings.secondaryShortcut = { ...DEFAULT_SETTINGS.secondaryShortcut, ...savedSettings.secondaryShortcut };
                updateTranslations();
                resolve();
            });
        });
    }

    async function saveSettings(newSettings) {
        return new Promise((resolve) => {
            chrome.storage.sync.set({ [STORAGE_KEY]: newSettings }, () => {
                settings = newSettings;
                updateTranslations();
                resolve();
            });
        });
    }

    //================================================================================
    // 1. STYLES
    //================================================================================

    const initStyles = () => {
        injectStyles(`
            /* Notification Styles */
            .copy-as-markdown-notification {
                position: fixed;
                top: 20px; right: 20px;
                background: rgba(30, 33, 36, 0.85);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-left: 4px solid #43b581;
                border-radius: 8px; padding: 16px 24px;
                color: white; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                font-size: 14px; font-weight: 500;
                display: flex; align-items: center;
                transform: translateX(400px); opacity: 0;
                transition: transform 0.4s ease-in-out, opacity 0.4s ease-in-out;
                z-index: 2147483647;
                box-shadow: 0 4px 12px rgba(1, 4, 9, 0.3);
            }
            .copy-as-markdown-notification.visible {
                opacity: 1; transform: translateX(0);
            }

            /* Settings Modal Styles */
            .cam-settings-overlay {
                position: fixed; top: 0; left: 0;
                width: 100vw; height: 100vh;
                background-color: rgba(0, 0, 0, 0.7);
                backdrop-filter: blur(4px);
                z-index: 2147483646;
                display: flex; justify-content: center; align-items: center;
                opacity: 0; transition: opacity 0.3s ease; pointer-events: none;
            }
            .cam-settings-overlay.visible {
                opacity: 1; pointer-events: all;
            }
            .cam-settings-modal {
                background: #2f3136; color: #dcddde;
                padding: 28px; border-radius: 12px;
                width: 460px; box-shadow: 0 12px 28px rgba(0,0,0,0.3);
                transform: scale(0.95); transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                max-height: 90vh; overflow-y: auto;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }
            .cam-settings-overlay.visible .cam-settings-modal {
                transform: scale(1);
            }
            .cam-settings-modal h2 {
                margin: 0 0 24px 0; font-size: 22px; font-weight: 700; color: #fff;
            }
            .cam-form-group {
                margin-bottom: 20px;
                background: rgba(0,0,0,0.15);
                padding: 16px;
                border-radius: 8px;
                border: 1px solid rgba(255,255,255,0.05);
            }
            .cam-form-group.flex {
                display: flex; align-items: center; justify-content: space-between;
            }
            .cam-form-group label {
                display: block; font-size: 13px; font-weight: 600;
                color: #b9bbbe; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;
            }
            .cam-form-group.flex label { margin-bottom: 0; }
            .cam-form-group input[type="text"], 
            .cam-form-group input[type="number"],
            .cam-select,
            .cam-form-group button {
                width: 100%; padding: 12px;
                background-color: #202225; border: 1px solid #18191c;
                border-radius: 6px; color: #dcddde; font-size: 14px;
                box-sizing: border-box; transition: border-color 0.2s ease;
            }
            .cam-form-group input[type="text"]:focus, 
            .cam-form-group input[type="number"]:focus,
            .cam-select:focus {
                border-color: #5865F2; outline: none;
            }
            .cam-select { cursor: pointer; }
            
            /* Toggle Switch Styles */
            .cam-switch {
                position: relative; display: inline-block; width: 40px; height: 22px; flex-shrink: 0;
            }
            .cam-switch input { opacity: 0; width: 0; height: 0; }
            .cam-slider {
                position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
                background-color: #4f545c; transition: .3s; border-radius: 22px;
            }
            .cam-slider:before {
                position: absolute; content: ""; height: 16px; width: 16px;
                left: 3px; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%;
            }
            .cam-switch input:checked + .cam-slider { background-color: #43b581; }
            .cam-switch input:checked + .cam-slider:before { transform: translateX(18px); }

            .cam-shortcut-display {
                display: inline-block; background-color: #202225;
                padding: 12px; border-radius: 6px; font-family: monospace;
                margin-right: 12px; border: 1px solid #18191c;
                min-width: 130px; text-align: center; flex-shrink: 0; font-size: 14px; color: #fff;
            }
            .cam-button {
                cursor: pointer; transition: all 0.2s ease;
                font-weight: 600;
            }
            .cam-button:hover { background-color: #292b2f; }
            .cam-button.recording {
                background-color: #5865F2 !important; color: #fff; border-color: #5865F2;
            }
            
            /* Action Buttons */
            .cam-actions {
                display: flex; justify-content: flex-end; gap: 12px; margin-top: 28px;
            }
            .cam-button-primary {
                background-color: #5865F2; color: #fff; border: none;
                border-radius: 6px; padding: 10px 24px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .cam-button-primary:hover { 
                background-color: #4752C4; 
                box-shadow: 0 6px 8px rgba(0,0,0,0.15);
                transform: translateY(-1px);
            }
            .cam-button-secondary {
                 background-color: transparent; border: 1px solid rgba(255,255,255,0.1);
                 border-radius: 6px; padding: 10px 24px;
            }
            .cam-button-secondary:hover { background-color: rgba(255,255,255,0.05); }
        `);
    };

    //================================================================================
    // 2. CORE FUNCTIONALITY
    //================================================================================

    const showNotification = () => {
        const existingNotification = document.querySelector('.copy-as-markdown-notification');
        if (existingNotification) existingNotification.remove();

        const notification = document.createElement('div');
        notification.className = 'copy-as-markdown-notification';
        notification.textContent = settings.notificationText;
        document.body.appendChild(notification);

        setTimeout(() => notification.classList.add('visible'), 20);

        setTimeout(() => {
            notification.classList.remove('visible');
            notification.addEventListener('transitionend', () => notification.remove(), { once: true });
        }, settings.notificationDurationS * 1000);
    };

    const isShortcutMatch = (event, shortcutInfo) => {
        if (!shortcutInfo) return false;
        return event.key.toLowerCase() === shortcutInfo.key.toLowerCase() &&
               event.ctrlKey === shortcutInfo.ctrlKey &&
               event.shiftKey === shortcutInfo.shiftKey &&
               event.altKey === shortcutInfo.altKey;
    };

    const handleCopyAsMarkdown = async (event) => {
        if (!settings.isEnabled) return;

        const isMain = isShortcutMatch(event, settings.shortcut);
        const isSecondary = settings.secondaryEnabled && isShortcutMatch(event, settings.secondaryShortcut);

        if (isMain || isSecondary) {
            event.preventDefault();
            event.stopPropagation();

            const selection = window.getSelection();
            if (!selection || !selection.rangeCount || selection.isCollapsed) return;

            if (typeof TurndownService === 'undefined') {
                console.error('TurndownService is not defined.');
                return;
            }

            // Determine if we should strip URLs
            const stripLinks = isSecondary ? true : settings.ignoreLinks;

            const turndownService = new TurndownService({
                headingStyle: 'atx',
                hr: '---',
                bulletListMarker: '*',
                codeBlockStyle: 'fenced',
                emDelimiter: '*', // Lepiej używać gwiazdki zamiast podkreślnika do kursywy
                strongDelimiter: '**'
            });

            // 1. Włączenie GFM (tabele, checkboxy, skreślenia)
            if (typeof turndownPluginGfm !== 'undefined') {
                turndownService.use(turndownPluginGfm.gfm);
            }

            // 2. Zachowanie przydatnych, skomplikowanych tagów HTML
            turndownService.keep(['details', 'summary', 'kbd', 'sub', 'sup', 'video', 'iframe']);

            // 3. Reguła wymuszająca konwersję CSS stylów italic/bold na znacznik Markdown
            // Czasem np. Google Docs nie używa <i> ani <b>, lecz <span> z odpowiednim stylem CSS.
            turndownService.addRule('cssFormatting', {
                filter: function (node) {
                    return node.nodeType === 1 && (node.style.fontStyle === 'italic' || node.style.fontWeight === 'bold' || parseInt(node.style.fontWeight) >= 600);
                },
                replacement: function (content, node, options) {
                    if (!content || !content.trim()) return content;
                    let prefix = '';
                    let suffix = '';
                    
                    if (node.style.fontWeight === 'bold' || parseInt(node.style.fontWeight) >= 600) {
                        prefix += options.strongDelimiter;
                        suffix = options.strongDelimiter + suffix;
                    }
                    if (node.style.fontStyle === 'italic') {
                        prefix += options.emDelimiter;
                        suffix = options.emDelimiter + suffix;
                    }
                    return prefix + content + suffix;
                }
            });

            // 4. Opcjonalne ignorowanie linków
            if (stripLinks) {
                turndownService.addRule('stripLinks', {
                    filter: 'a',
                    replacement: function (content) {
                        return content; // Zwraca sam tekst bez URL
                    }
                });
            }

            const range = selection.getRangeAt(0);
            const container = document.createElement('div');
            container.appendChild(range.cloneContents());

            // 5. Konwersja adresów względnych na bezwzględne
            container.querySelectorAll('a[href], img[src]').forEach(el => {
                if (el.tagName.toLowerCase() === 'a') el.href = el.href;
                if (el.tagName.toLowerCase() === 'img') el.src = el.src;
            });

            // 6. Usuwanie zbędnych elementów utrudniających parsowanie bloków kodu
            container.querySelectorAll('.copy-button, button, [aria-hidden="true"], script, style, noscript').forEach(el => el.remove());

            const markdown = turndownService.turndown(container);

            if (!markdown || !markdown.trim()) return;

            try {
                await navigator.clipboard.writeText(markdown);
                showNotification();
            } catch (err) {
                console.error('Copy as Markdown Error:', err);
            }
        }
    };

    //================================================================================
    // 3. SETTINGS MODAL
    //================================================================================

    let tempShortcut = {};
    let tempSecondaryShortcut = {};

    function buildSettingsModal() {
        if (document.getElementById('cam-settings-container')) return;

        const modalContainer = document.createElement('div');
        modalContainer.id = 'cam-settings-container';
        modalContainer.innerHTML = `
            <div class="cam-settings-overlay">
                <div class="cam-settings-modal">
                    <h2>${t.settings.title}</h2>
                    
                    <div class="cam-form-group flex" style="background: transparent; border: none; padding: 0;">
                        <label for="cam-enabled" style="font-size: 14px;">${t.settings.enabled}</label>
                        <label class="cam-switch">
                            <input type="checkbox" id="cam-enabled">
                            <span class="cam-slider"></span>
                        </label>
                    </div>

                    <div class="cam-form-group flex">
                        <label for="cam-language" style="margin-bottom: 0;">${t.settings.language}</label>
                        <select id="cam-language" class="cam-select" style="width: 200px;">
                            <option value="auto">${t.settings.languageAuto}</option>
                            <option value="en">English</option>
                            <option value="pl">Polski</option>
                        </select>
                    </div>

                    <!-- Główny skrót -->
                    <div class="cam-form-group">
                        <label>${t.settings.shortcut}</label>
                        <div style="display: flex; align-items: center; margin-bottom: 16px;">
                            <span id="cam-shortcut-display" class="cam-shortcut-display"></span>
                            <button id="cam-record-shortcut" class="cam-button">${t.settings.recordShortcut}</button>
                        </div>
                        <div class="flex">
                            <label for="cam-ignore-links" style="margin-bottom: 0; text-transform: none; color: #dcddde; font-weight: normal;">${t.settings.ignoreLinks}</label>
                            <label class="cam-switch">
                                <input type="checkbox" id="cam-ignore-links">
                                <span class="cam-slider"></span>
                            </label>
                        </div>
                    </div>

                    <!-- Dodatkowy skrót -->
                    <div class="cam-form-group">
                        <div class="flex" style="margin-bottom: 16px;">
                            <label for="cam-secondary-enabled" style="color: #fff;">${t.settings.secondaryShortcut}</label>
                            <label class="cam-switch">
                                <input type="checkbox" id="cam-secondary-enabled" title="${t.settings.secondaryEnabled}">
                                <span class="cam-slider"></span>
                            </label>
                        </div>
                        <div style="display: flex; align-items: center;">
                            <span id="cam-secondary-shortcut-display" class="cam-shortcut-display"></span>
                            <button id="cam-record-secondary-shortcut" class="cam-button">${t.settings.recordSecondaryShortcut}</button>
                        </div>
                    </div>

                    <div class="cam-form-group">
                        <label for="cam-notif-text">${t.settings.notificationText}</label>
                        <input type="text" id="cam-notif-text">
                    </div>
                    <div class="cam-form-group">
                        <label for="cam-notif-duration">${t.settings.notificationDuration}</label>
                        <input type="number" id="cam-notif-duration" step="0.1" min="0">
                    </div>
                    <div class="cam-actions">
                        <button id="cam-cancel" class="cam-button cam-button-secondary">${t.settings.cancel}</button>
                        <button id="cam-save" class="cam-button cam-button-primary">${t.settings.save}</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalContainer);

        const overlay = modalContainer.querySelector('.cam-settings-overlay');
        const recordBtn = modalContainer.querySelector('#cam-record-shortcut');
        const recordSecondaryBtn = modalContainer.querySelector('#cam-record-secondary-shortcut');

        const closeModal = () => overlay.classList.remove('visible');

        modalContainer.querySelector('#cam-save').addEventListener('click', async () => {
            const newSettings = {
                isEnabled: modalContainer.querySelector('#cam-enabled').checked,
                language: modalContainer.querySelector('#cam-language').value,
                ignoreLinks: modalContainer.querySelector('#cam-ignore-links').checked,
                shortcut: tempShortcut,
                secondaryEnabled: modalContainer.querySelector('#cam-secondary-enabled').checked,
                secondaryShortcut: tempSecondaryShortcut,
                notificationText: modalContainer.querySelector('#cam-notif-text').value,
                notificationDurationS: parseFloat(modalContainer.querySelector('#cam-notif-duration').value)
            };
            await saveSettings(newSettings);
            closeModal();

            // Przebudowanie okna aby błyskawicznie zastosować zmianę języka UI bez przeładowania strony
            setTimeout(() => {
                const container = document.getElementById('cam-settings-container');
                if (container) container.remove();
                buildSettingsModal();
            }, 350);
        });

        modalContainer.querySelector('#cam-cancel').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        const setupRecording = (buttonEl, isSecondary) => {
            buttonEl.addEventListener('click', () => {
                buttonEl.textContent = t.settings.recordingStatus;
                buttonEl.classList.add('recording');

                const handleShortcutRecord = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
                    
                    const recorded = { key: e.key.toLowerCase(), ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey };
                    
                    if (isSecondary) {
                        tempSecondaryShortcut = recorded;
                        updateShortcutDisplay('cam-secondary-shortcut-display', tempSecondaryShortcut);
                        buttonEl.textContent = t.settings.recordSecondaryShortcut;
                    } else {
                        tempShortcut = recorded;
                        updateShortcutDisplay('cam-shortcut-display', tempShortcut);
                        buttonEl.textContent = t.settings.recordShortcut;
                    }
                    
                    buttonEl.classList.remove('recording');
                    document.removeEventListener('keydown', handleShortcutRecord, true);
                };
                document.addEventListener('keydown', handleShortcutRecord, true);
            });
        };

        setupRecording(recordBtn, false);
        setupRecording(recordSecondaryBtn, true);
    }

    function updateShortcutDisplay(elementId, shortcut) {
        if (!shortcut) return;
        const parts = [];
        if (shortcut.ctrlKey) parts.push('Ctrl');
        if (shortcut.shiftKey) parts.push('Shift');
        if (shortcut.altKey) parts.push('Alt');
        parts.push(shortcut.key.toUpperCase());
        document.getElementById(elementId).textContent = parts.join(' + ');
    }

    function openSettingsModal() {
        const container = document.getElementById('cam-settings-container');
        if (!container) return;

        const overlay = container.querySelector('.cam-settings-overlay');
        if (!overlay) return;

        tempShortcut = { ...settings.shortcut };
        tempSecondaryShortcut = { ...settings.secondaryShortcut };

        document.getElementById('cam-enabled').checked = settings.isEnabled;
        document.getElementById('cam-language').value = settings.language;
        document.getElementById('cam-ignore-links').checked = settings.ignoreLinks;
        document.getElementById('cam-secondary-enabled').checked = settings.secondaryEnabled;
        
        updateShortcutDisplay('cam-shortcut-display', tempShortcut);
        updateShortcutDisplay('cam-secondary-shortcut-display', tempSecondaryShortcut);
        
        document.getElementById('cam-notif-text').value = settings.notificationText;
        document.getElementById('cam-notif-duration').value = settings.notificationDurationS;
        
        overlay.classList.add('visible');
    }

    //================================================================================
    // 4. SCRIPT INITIALIZATION
    //================================================================================

    async function initialize() {
        await loadSettings();
        initStyles();
        buildSettingsModal();

        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'open_settings') {
                openSettingsModal();
            }
        });
    }

    document.addEventListener('keydown', handleCopyAsMarkdown, true);

    initialize();

})();