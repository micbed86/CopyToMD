/**
 * Centralized strings for internationalization (i18n).
 * Using a global variable for compatibility with content scripts.
 */
window.camLocales = {
    en: {
        settings: {
            title: 'Copy with Formatting Settings',
            shortcut: 'Shortcut',
            recordShortcut: 'Record New Shortcut',
            recordingStatus: 'Press any key combination...',
            notificationText: 'Notification Text',
            notificationDuration: 'Notification Duration (seconds)',
            enabled: 'Extension Enabled',
            cancel: 'Cancel',
            save: 'Save and Close',
            menuItem: 'Settings'
        },
        notifications: {
            copied: 'Copied with formatting!'
        }
    }
};
