const fs = require('fs-extra');
const path = require('path');

// Data storage paths
const DATA_DIR = path.join(__dirname, '..', 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const MEDIA_FILE = path.join(DATA_DIR, 'media.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Ensure users file exists
if (!fs.existsSync(USERS_FILE)) {
    fs.writeJsonSync(USERS_FILE, {}, { spaces: 2 });
}

// Ensure data directory exists
fs.ensureDirSync(DATA_DIR);

// Initialize data files if they don't exist
if (!fs.existsSync(MESSAGES_FILE)) {
    fs.writeJsonSync(MESSAGES_FILE, [], { spaces: 2 });
}

if (!fs.existsSync(MEDIA_FILE)) {
    fs.writeJsonSync(MEDIA_FILE, [], { spaces: 2 });
}

if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeJsonSync(SETTINGS_FILE, {
        replyDelay: 120, // Default delay between replies in seconds
        enableAutoReply: true,
        supportNumber: '' // Default support number (empty)
    }, { spaces: 2 });
}

// Get all messages
const getMessages = () => {
    try {
        return fs.readJsonSync(MESSAGES_FILE);
    } catch (error) {
        console.error('Error reading messages file:', error);
        return [];
    }
};

// Add a new message
const addMessage = (message) => {
    try {
        let messages = getMessages();
        
        // Ensure messages is an array
        if (!Array.isArray(messages)) {
            console.warn('Messages is not an array, initializing new array');
            messages = [];
        }
        
        // Add message to beginning of array (newest first)
        messages.unshift({
            ...message,
            timestamp: message.timestamp || Date.now(),
            time: message.time || new Date().toLocaleString(),
            status: message.status || 'pending' // Default status
        });
        
        // Keep only the 100 most recent messages
        if (messages.length > 100) {
            messages = messages.slice(0, 100);
        }
        
        // Ensure directory exists before writing
        fs.ensureDirSync(DATA_DIR);
        fs.writeJsonSync(MESSAGES_FILE, messages, { spaces: 2 });
        return true;
    } catch (error) {
        console.error('Error adding message:', error);
        return false;
    }
};

// Update message status
const updateMessageStatus = (messageId, status) => {
    try {
        const messages = getMessages();
        const messageIndex = messages.findIndex(m => m.timestamp === messageId);
        
        if (messageIndex !== -1) {
            messages[messageIndex].status = status;
            messages[messageIndex].lastUpdated = new Date().toISOString();
            fs.writeJsonSync(MESSAGES_FILE, messages, { spaces: 2 });
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error updating message status:', error);
        return false;
    }
};

// Get all media
const getMedia = () => {
    try {
        return fs.readJsonSync(MEDIA_FILE);
    } catch (error) {
        console.error('Error reading media file:', error);
        return [];
    }
};

// Add new media
const addMedia = (media) => {
    try {
        const mediaList = getMedia();
        mediaList.push(media);
        fs.writeJsonSync(MEDIA_FILE, mediaList, { spaces: 2 });
        return true;
    } catch (error) {
        console.error('Error adding media:', error);
        return false;
    }
};

// Get settings
const getSettings = () => {
    try {
        return fs.readJsonSync(SETTINGS_FILE);
    } catch (error) {
        console.error('Error reading settings file:', error);
        return {
            replyDelay: 120,
            enableAutoReply: true,
            supportNumber: ''
        };
    }
};

// Update settings
const updateSettings = (settings) => {
    try {
        fs.writeJsonSync(SETTINGS_FILE, settings, { spaces: 2 });
        return true;
    } catch (error) {
        console.error('Error updating settings:', error);
        return false;
    }
};

// Get unique contacts count
const getUniqueContactsCount = () => {
    try {
        const messages = getMessages();
        const uniqueContacts = new Set();
        
        messages.forEach(message => {
            if (message.contactId) {
                uniqueContacts.add(message.contactId);
            }
        });
        
        return uniqueContacts.size;
    } catch (error) {
        console.error('Error getting unique contacts count:', error);
        return 0;
    }
};

// Get total responses count
const getTotalResponsesCount = () => {
    try {
        const messages = getMessages();
        return messages.filter(message => message.responseType).length;
    } catch (error) {
        console.error('Error getting total responses count:', error);
        return 0;
    }
};

// User management functions
const getUser = (userId) => {
    const users = fs.readJsonSync(USERS_FILE);
    return users[userId] || null;
};

const updateUser = (userId, userData) => {
    const users = fs.readJsonSync(USERS_FILE);
    users[userId] = { ...(users[userId] || {}), ...userData };
    fs.writeJsonSync(USERS_FILE, users, { spaces: 2 });
    return users[userId];
};

// Check if user has completed language selection
const hasCompletedLanguageSelection = (userId) => {
    const user = getUser(userId);
    return user && user.language;
};

module.exports = {
    getMessages,
    addMessage,
    updateMessageStatus,
    getMedia,
    addMedia,
    getSettings,
    updateSettings,
    getUniqueContactsCount,
    getTotalResponsesCount,
    getUser,
    updateUser,
    hasCompletedLanguageSelection
};
