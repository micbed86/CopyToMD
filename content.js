/**
 * Content script for "Copy with Formatting (as Markdown)" Chrome Extension.
 * Handles the shortcut listener, Markdown conversion, and settings UI.
 */

(async function () {
    'use strict';

    const STORAGE_KEY = 'copyAsMarkdown_settings';

    // Access locales from global window object
    const locales = window.camLocales || {};
    const lang = 'en'; // Default language
    const t = locales[lang] || {
        settings: {
            title: 'Copy with Formatting Settings',
            shortcut: 'Shortcut',
            recordShortcut: 'Record New Shortcut',
            recordingStatus: 'Press any key combination...',
            notificationText: 'Notification Text',
            notificationDuration: 'Notification Duration (seconds)',
            enabled: 'Extension Enabled',
            cancel: 'Cancel',
            save: 'Save and Close'
        },
        notifications: {
            copied: 'Copied with formatting!'
        }
    };

    const DEFAULT_SETTINGS = {
        isEnabled: true,
        shortcut: {
            key: 'c',
            ctrlKey: true,
            shiftKey: true,
            altKey: false,
        },
        notificationText: t.notifications.copied,
        notificationDurationS: 2.5,
    };

    let settings = {};

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
                resolve();
            });
        });
    }

    async function saveSettings(newSettings) {
        return new Promise((resolve) => {
            chrome.storage.sync.set({ [STORAGE_KEY]: newSettings }, () => {
                settings = newSettings;
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
                z-index: 2147483646;
                display: flex; justify-content: center; align-items: center;
                opacity: 0; transition: opacity 0.3s ease; pointer-events: none;
            }
            .cam-settings-overlay.visible {
                opacity: 1; pointer-events: all;
            }
            .cam-settings-modal {
                background: #2f3136; color: #dcddde;
                padding: 24px; border-radius: 8px;
                width: 440px; box-shadow: 0 8px 16px rgba(0,0,0,0.24);
                transform: scale(0.95); transition: transform 0.3s ease;
            }
            .cam-settings-overlay.visible .cam-settings-modal {
                transform: scale(1);
            }
            .cam-settings-modal h2 {
                margin: 0 0 20px 0; font-size: 20px; font-weight: 600; color: #fff;
            }
            .cam-form-group {
                margin-bottom: 16px;
            }
            .cam-form-group.flex {
                display: flex; align-items: center; justify-content: space-between;
            }
            .cam-form-group label {
                display: block; font-size: 12px; font-weight: 600;
                color: #b9bbbe; text-transform: uppercase; margin-bottom: 8px;
            }
            .cam-form-group.flex label { margin-bottom: 0; }
            .cam-form-group input[type="text"], 
            .cam-form-group input[type="number"], 
            .cam-form-group button {
                width: 100%; padding: 10px;
                background-color: #202225; border: 1px solid #18191c;
                border-radius: 3px; color: #dcddde; font-size: 14px;
                box-sizing: border-box;
            }
            .cam-form-group input[type="checkbox"] {
                width: 18px; height: 18px; cursor: pointer;
            }
            .cam-shortcut-display {
                display: inline-block;
                background-color: #202225;
                padding: 10px;
                border-radius: 3px;
                font-family: monospace;
                margin-right: 10px;
                border: 1px solid #18191c;
                min-width: 120px;
                text-align: center;
            }
            .cam-button {
                cursor: pointer; transition: background-color 0.17s ease;
                font-weight: 500;
            }
            .cam-button:hover { background-color: #292b2f; }
            #cam-record-shortcut.recording {
                background-color: #7289da; color: #fff; border-color: #7289da;
            }
            .cam-actions {
                display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px;
            }
            .cam-button-primary {
                background-color: #43b581; color: #fff; border: none;
            }
            .cam-button-primary:hover { background-color: #3aa172; }
            .cam-button-secondary {
                 background-color: transparent;
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

    const handleCopyAsMarkdown = async (event) => {
        if (!settings.isEnabled || !settings.shortcut) return;

        const { key, ctrlKey, shiftKey, altKey } = settings.shortcut;
        if (event.key.toLowerCase() === key && event.ctrlKey === ctrlKey && event.shiftKey === shiftKey && event.altKey === altKey) {
            event.preventDefault();
            event.stopPropagation();

            const selection = window.getSelection();
            if (!selection || !selection.rangeCount || selection.isCollapsed) return;

            if (typeof TurndownService === 'undefined') {
                console.error('TurndownService is not defined.');
                return;
            }

            const turndownService = new TurndownService({
                headingStyle: 'atx',
                hr: '---',
                bulletListMarker: '*',
                codeBlockStyle: 'fenced'
            });
            // Overwrite escape behavior to match original script requirement
            turndownService.escape = (str) => str;

            const range = selection.getRangeAt(0);
            const container = document.createElement('div');
            container.appendChild(range.cloneContents());
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

    function buildSettingsModal() {
        if (document.getElementById('cam-settings-container')) return;

        const modalContainer = document.createElement('div');
        modalContainer.id = 'cam-settings-container';
        modalContainer.innerHTML = `
            <div class="cam-settings-overlay">
                <div class="cam-settings-modal">
                    <h2>${t.settings.title}</h2>
                    <div class="cam-form-group flex">
                        <label for="cam-enabled">${t.settings.enabled}</label>
                        <input type="checkbox" id="cam-enabled">
                    </div>
                    <div class="cam-form-group">
                        <label>${t.settings.shortcut}</label>
                        <div style="display: flex; align-items: center;">
                            <span id="cam-shortcut-display" class="cam-shortcut-display"></span>
                            <button id="cam-record-shortcut" class="cam-button">${t.settings.recordShortcut}</button>
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

        const closeModal = () => overlay.classList.remove('visible');

        modalContainer.querySelector('#cam-save').addEventListener('click', async () => {
            const newSettings = {
                isEnabled: modalContainer.querySelector('#cam-enabled').checked,
                shortcut: { ...settings.shortcut, ...tempShortcut },
                notificationText: modalContainer.querySelector('#cam-notif-text').value,
                notificationDurationS: parseFloat(modalContainer.querySelector('#cam-notif-duration').value)
            };
            await saveSettings(newSettings);
            closeModal();
        });

        modalContainer.querySelector('#cam-cancel').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        recordBtn.addEventListener('click', () => {
            recordBtn.textContent = t.settings.recordingStatus;
            recordBtn.classList.add('recording');

            const handleShortcutRecord = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
                tempShortcut = { key: e.key.toLowerCase(), ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey };
                updateShortcutDisplay(tempShortcut);
                recordBtn.textContent = t.settings.recordShortcut;
                recordBtn.classList.remove('recording');
                document.removeEventListener('keydown', handleShortcutRecord, true);
            };
            document.addEventListener('keydown', handleShortcutRecord, true);
        });
    }

    function updateShortcutDisplay(shortcut) {
        const parts = [];
        if (shortcut.ctrlKey) parts.push('Ctrl');
        if (shortcut.shiftKey) parts.push('Shift');
        if (shortcut.altKey) parts.push('Alt');
        parts.push(shortcut.key.toUpperCase());
        document.getElementById('cam-shortcut-display').textContent = parts.join(' + ');
    }

    function openSettingsModal() {
        const container = document.getElementById('cam-settings-container');
        if (!container) return;

        const overlay = container.querySelector('.cam-settings-overlay');
        if (!overlay) return;

        tempShortcut = {};
        document.getElementById('cam-enabled').checked = settings.isEnabled;
        updateShortcutDisplay(settings.shortcut);
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
