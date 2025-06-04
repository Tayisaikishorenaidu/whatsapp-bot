const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');

class DataStore {
    constructor() {
        this.dataDir = path.join(__dirname, '..', 'data');
        this.messagesFile = path.join(this.dataDir, 'messages.json');
        this.contactsFile = path.join(this.dataDir, 'contacts.json');
        this.settingsFile = path.join(this.dataDir, 'settings.json');

        this.messages = [];
        this.contacts = new Map();
        this.settings = this.getDefaultSettings();

        this.init();
    }

    async init() {
        try {
            await fs.ensureDir(this.dataDir);
            await this.load();
        } catch (error) {
            console.error('DataStore init error:', error);
        }
    }

    getDefaultSettings() {
        return {
            autoReply: true,
            replyDelay: 2000,
            language: 'en',
            welcomeMessage: 'Welcome to Student AI!',
            businessHours: {
                enabled: false,
                start: '09:00',
                end: '18:00',
                timezone: 'Asia/Kolkata'
            },
            features: {
                languageDetection: true,
                mediaSupport: true,
                analyticsTracking: true,
                exportFunctionality: true
            }
        };
    }

    async load() {
        try {
            // Load messages
            if (await fs.pathExists(this.messagesFile)) {
                const messagesData = await fs.readJSON(this.messagesFile);
                this.messages = Array.isArray(messagesData) ? messagesData : [];
            }

            // Load contacts
            if (await fs.pathExists(this.contactsFile)) {
                const contactsData = await fs.readJSON(this.contactsFile);
                this.contacts = new Map(Object.entries(contactsData || {}));
            }

            // Load settings
            if (await fs.pathExists(this.settingsFile)) {
                const settingsData = await fs.readJSON(this.settingsFile);
                this.settings = { ...this.getDefaultSettings(), ...settingsData };
            }

            console.log(`✅ DataStore loaded: ${this.messages.length} messages, ${this.contacts.size} contacts`);
        } catch (error) {
            console.error('DataStore load error:', error);
        }
    }

    async save() {
        try {
            await fs.writeJSON(this.messagesFile, this.messages, { spaces: 2 });
            await fs.writeJSON(this.contactsFile, Object.fromEntries(this.contacts), { spaces: 2 });
            await fs.writeJSON(this.settingsFile, this.settings, { spaces: 2 });
        } catch (error) {
            console.error('DataStore save error:', error);
        }
    }

    // Message methods
    addMessage(messageData) {
        const message = {
            id: this.generateId(),
            timestamp: Date.now(),
            datetime: moment().format('YYYY-MM-DD HH:mm:ss'),
            ...messageData
        };

        this.messages.unshift(message);

        // Keep only last 10000 messages to prevent memory issues
        if (this.messages.length > 10000) {
            this.messages = this.messages.slice(0, 10000);
        }

        // Update contact info
        this.updateContact(messageData.contactId, {
            lastMessage: message.timestamp,
            messageCount: (this.getContact(messageData.contactId)?.messageCount || 0) + 1
        });

        // Auto-save every 10 messages
        if (this.messages.length % 10 === 0) {
            this.save();
        }

        return message;
    }

    updateMessageStatus(messageId, status) {
        const message = this.messages.find(m => m.id === messageId);
        if (message) {
            message.status = status;
            message.statusTimestamp = Date.now();
        }
    }

    getRecentMessages(limit = 50, offset = 0) {
        return this.messages.slice(offset, offset + limit);
    }

    getContactMessages(contactId, limit = 100, offset = 0) {
        const contactMessages = this.messages.filter(m => m.contactId === contactId);
        return contactMessages.slice(offset, offset + limit);
    }

    getAllMessages() {
        return this.messages;
    }

    searchMessages(query, contactId = null) {
        let messages = contactId ?
            this.messages.filter(m => m.contactId === contactId) :
            this.messages;

        return messages.filter(m =>
            m.text && m.text.toLowerCase().includes(query.toLowerCase())
        );
    }

    // Contact methods
    updateContact(contactId, updates) {
        const existing = this.contacts.get(contactId) || {};
        const contact = {
            id: contactId,
            firstContact: existing.firstContact || Date.now(),
            ...existing,
            ...updates,
            lastUpdate: Date.now()
        };

        this.contacts.set(contactId, contact);
        return contact;
    }

    getContact(contactId) {
        return this.contacts.get(contactId);
    }

    getAllContacts() {
        return Array.from(this.contacts.values()).sort((a, b) =>
            (b.lastMessage || 0) - (a.lastMessage || 0)
        );
    }

    // Statistics methods
    getStats() {
        const now = moment();
        const today = now.startOf('day');
        const thisWeek = now.clone().startOf('week');
        const thisMonth = now.clone().startOf('month');

        const todayMessages = this.messages.filter(m =>
            moment(m.timestamp).isAfter(today)
        );

        const weekMessages = this.messages.filter(m =>
            moment(m.timestamp).isAfter(thisWeek)
        );

        const monthMessages = this.messages.filter(m =>
            moment(m.timestamp).isAfter(thisMonth)
        );

        const botMessages = this.messages.filter(m => m.fromBot);
        const userMessages = this.messages.filter(m => !m.fromBot);

        const languageStats = {};
        this.contacts.forEach(contact => {
            const lang = contact.language || 'unknown';
            languageStats[lang] = (languageStats[lang] || 0) + 1;
        });

        return {
            totalMessages: this.messages.length,
            totalContacts: this.contacts.size,
            botMessages: botMessages.length,
            userMessages: userMessages.length,
            todayMessages: todayMessages.length,
            weekMessages: weekMessages.length,
            monthMessages: monthMessages.length,
            languageStats,
            averageResponseTime: this.calculateAverageResponseTime(),
            topActiveContacts: this.getTopActiveContacts(5),
            messagesByHour: this.getMessagesByHour(),
            messagesByDay: this.getMessagesByDay(7)
        };
    }

    getAnalytics() {
        const stats = this.getStats();

        return {
            ...stats,
            engagementRate: this.calculateEngagementRate(),
            conversionRate: this.calculateConversionRate(),
            popularKeywords: this.getPopularKeywords(10),
            responseTimeDistribution: this.getResponseTimeDistribution(),
            userJourney: this.getUserJourney(),
            mediaTypeStats: this.getMediaTypeStats()
        };
    }

    calculateAverageResponseTime() {
        const responses = this.messages.filter(m => m.fromBot && m.responseTime);
        if (responses.length === 0) return 0;

        const totalTime = responses.reduce((sum, m) => sum + m.responseTime, 0);
        return Math.round(totalTime / responses.length);
    }

    getTopActiveContacts(limit = 5) {
        return Array.from(this.contacts.values())
            .sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0))
            .slice(0, limit)
            .map(contact => ({
                name: contact.name || contact.phone || 'Unknown',
                messageCount: contact.messageCount || 0,
                lastMessage: contact.lastMessage
            }));
    }

    getMessagesByHour() {
        const hourlyStats = new Array(24).fill(0);

        this.messages.forEach(message => {
            const hour = moment(message.timestamp).hour();
            hourlyStats[hour]++;
        });

        return hourlyStats.map((count, hour) => ({
            hour: `${hour.toString().padStart(2, '0')}:00`,
            count
        }));
    }

    getMessagesByDay(days = 7) {
        const dailyStats = [];

        for (let i = days - 1; i >= 0; i--) {
            const date = moment().subtract(i, 'days');
            const dayStart = date.clone().startOf('day');
            const dayEnd = date.clone().endOf('day');

            const count = this.messages.filter(message => {
                const msgTime = moment(message.timestamp);
                return msgTime.isBetween(dayStart, dayEnd, null, '[]');
            }).length;

            dailyStats.push({
                date: date.format('YYYY-MM-DD'),
                day: date.format('dddd'),
                count
            });
        }

        return dailyStats;
    }

    calculateEngagementRate() {
        const totalUsers = this.contacts.size;
        const activeUsers = Array.from(this.contacts.values()).filter(
            contact => contact.messageCount > 1
        ).length;

        return totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;
    }

    calculateConversionRate() {
        const totalUsers = this.contacts.size;
        const convertedUsers = Array.from(this.contacts.values()).filter(
            contact => contact.demoRequested || contact.language
        ).length;

        return totalUsers > 0 ? Math.round((convertedUsers / totalUsers) * 100) : 0;
    }

    getPopularKeywords(limit = 10) {
        const keywords = {};

        this.messages
            .filter(m => !m.fromBot && m.text)
            .forEach(message => {
                const words = message.text.toLowerCase()
                    .split(/\s+/)
                    .filter(word => word.length > 3);

                words.forEach(word => {
                    keywords[word] = (keywords[word] || 0) + 1;
                });
            });

        return Object.entries(keywords)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([word, count]) => ({ word, count }));
    }

    getResponseTimeDistribution() {
        const distribution = {
            '<1s': 0,
            '1-5s': 0,
            '5-10s': 0,
            '10-30s': 0,
            '>30s': 0
        };

        this.messages
            .filter(m => m.fromBot && m.responseTime)
            .forEach(message => {
                const time = message.responseTime;
                if (time < 1000) distribution['<1s']++;
                else if (time < 5000) distribution['1-5s']++;
                else if (time < 10000) distribution['5-10s']++;
                else if (time < 30000) distribution['10-30s']++;
                else distribution['>30s']++;
            });

        return distribution;
    }

    getUserJourney() {
        const journey = {
            'Initial Contact': 0,
            'Language Selected': 0,
            'Video Viewed': 0,
            'Demo Requested': 0,
            'Contact Info Shared': 0
        };

        this.contacts.forEach(contact => {
            journey['Initial Contact']++;
            if (contact.language) journey['Language Selected']++;
            if (contact.videoViewed) journey['Video Viewed']++;
            if (contact.demoRequested) journey['Demo Requested']++;
            if (contact.contactInfoShared) journey['Contact Info Shared']++;
        });

        return journey;
    }

    getMediaTypeStats() {
        const mediaStats = {};

        this.messages
            .filter(m => m.mediaType)
            .forEach(message => {
                mediaStats[message.mediaType] = (mediaStats[message.mediaType] || 0) + 1;
            });

        return mediaStats;
    }

    // Settings methods
    getSettings() {
        return this.settings;
    }

    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.save();
        return this.settings;
    }

    // Utility methods
    generateId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    // Cleanup methods
    cleanupOldMessages(days = 30) {
        const cutoff = moment().subtract(days, 'days').valueOf();
        const originalLength = this.messages.length;

        this.messages = this.messages.filter(m => m.timestamp > cutoff);

        const cleaned = originalLength - this.messages.length;
        console.log(`🧹 Cleaned up ${cleaned} old messages`);

        return cleaned;
    }

    exportData() {
        return {
            messages: this.messages,
            contacts: Object.fromEntries(this.contacts),
            settings: this.settings,
            exportedAt: new Date().toISOString()
        };
    }

    importData(data) {
        if (data.messages) this.messages = data.messages;
        if (data.contacts) this.contacts = new Map(Object.entries(data.contacts));
        if (data.settings) this.settings = { ...this.getDefaultSettings(), ...data.settings };

        this.save();
    }
}

module.exports = DataStore;