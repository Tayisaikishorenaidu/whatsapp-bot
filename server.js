const express = require('express');
const { DisconnectReason, useMultiFileAuthState, makeWASocket, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const path = require('path');
const fs = require('fs-extra');
const qrcode = require('qrcode');
const ExcelJS = require('exceljs');
const moment = require('moment');
const XLSX = require('xlsx');

// Import custom modules
const MessageHandler = require('./src/messageHandler');
const DataStore = require('./src/dataStore');
const Logger = require('./src/logger');

const app = express();
const PORT = process.env.PORT || 3004;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Global variables
let sock;
let qrCodeString = '';
let isConnected = false;
let connectionState = 'disconnected';
const dataStore = new DataStore();
const messageHandler = new MessageHandler(dataStore);
const logger = new Logger();

// Bot configuration
const BOT_CONFIG = {
    name: 'Student AI Bot',
    version: '2.0.0',
    description: 'Advanced WhatsApp Bot for Student AI Platform',
    features: [
        'Multi-language support',
        'Media handling',
        'Auto-responses',
        'Analytics dashboard',
        'Export functionality'
    ]
};

// Initialize WhatsApp connection
async function connectToWhatsApp() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
        const { version, isLatest } = await fetchLatestBaileysVersion();
        
        logger.info(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

        sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            browser: ['Student AI Bot', 'Chrome', '1.0.0'],
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            generateHighQualityLinkPreview: false, // FIXED: Disabled to prevent link-preview-js errors
            syncFullHistory: false,
            markOnlineOnConnect: true,
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                qrCodeString = await qrcode.toDataURL(qr);
                logger.info('QR Code generated');
                console.log('🔗 QR Code generated - Go to http://localhost:3000/qr to scan');
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                
                logger.warn(`Connection closed due to ${lastDisconnect?.error}. Reconnecting: ${shouldReconnect}`);
                
                if (shouldReconnect) {
                    setTimeout(connectToWhatsApp, 5000);
                }
                
                isConnected = false;
                connectionState = 'disconnected';
                qrCodeString = '';
            } else if (connection === 'open') {
                logger.success('WhatsApp connection opened successfully');
                console.log('✅ WhatsApp connection opened successfully');
                console.log('🤖 Bot is now ready to respond to messages');
                isConnected = true;
                connectionState = 'connected';
                qrCodeString = '';
            } else if (connection === 'connecting') {
                connectionState = 'connecting';
                logger.info('Connecting to WhatsApp...');
                console.log('ℹ️  Connecting to WhatsApp...');
            }
        });

        sock.ev.on('messages.upsert', async (m) => {
            try {
                const messages = m.messages;
                for (const message of messages) {
                    if (message.key.fromMe) continue;
                    
                    await messageHandler.handleMessage(sock, message);
                }
            } catch (error) {
                logger.error('Error handling message:', error);
                console.error('❌ Error handling message:', error);
            }
        });

        sock.ev.on('messages.update', (updates) => {
            for (const update of updates) {
                if (update.update.status) {
                    dataStore.updateMessageStatus(update.key.id, update.update.status);
                }
            }
        });

    } catch (error) {
        logger.error('Connection error:', error);
        console.error('❌ Connection error:', error);
        setTimeout(connectToWhatsApp, 10000);
    }
}

// Routes
app.get('/', (req, res) => {
    try {
        const stats = dataStore.getStats();
        const recentMessages = dataStore.getRecentMessages(50);
        const settings = dataStore.getSettings();

        res.render('dashboard', {
            botStatus: isConnected,
            connectionState,
            qrCode: qrCodeString,
            stats,
            messages: recentMessages,
            settings,
            config: BOT_CONFIG,
            moment,
            connectedClients: isConnected ? 1 : 0 // Adding connectedClients with a value of 1 if connected, 0 if not
        });
    } catch (error) {
        logger.error('Dashboard render error:', error);
        res.status(500).send('Dashboard error - check console');
    }
});

app.get('/qr', (req, res) => {
    try {
        res.render('qr', {
            qrCode: qrCodeString,
            connectionState,
            config: BOT_CONFIG
        });
    } catch (error) {
        logger.error('QR render error:', error);
        res.status(500).send('QR page error - check console');
    }
});

app.get('/chat/:contactId', (req, res) => {
    try {
        const { contactId } = req.params;
        const messages = dataStore.getContactMessages(contactId);
        const contact = dataStore.getContact(contactId);
        
        res.render('chat', {
            contact,
            messages,
            contactId,
            config: BOT_CONFIG,
            moment
        });
    } catch (error) {
        logger.error('Chat render error:', error);
        res.status(500).send('Chat page error - check console');
    }
});

app.get('/analytics', (req, res) => {
    try {
        const analytics = dataStore.getAnalytics();
        res.render('analytics', {
            analytics,
            config: BOT_CONFIG,
            moment
        });
    } catch (error) {
        logger.error('Analytics render error:', error);
        res.status(500).send('Analytics page error - check console');
    }
});

// API Routes
app.get('/api/status', (req, res) => {
    res.json({
        connected: isConnected,
        state: connectionState,
        hasQR: !!qrCodeString,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        botConfig: BOT_CONFIG
    });
});

app.get('/api/stats', (req, res) => {
    try {
        res.json(dataStore.getStats());
    } catch (error) {
        logger.error('API stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/messages', (req, res) => {
    try {
        const { limit = 50, offset = 0, contactId } = req.query;
        
        let messages;
        if (contactId) {
            messages = dataStore.getContactMessages(contactId, parseInt(limit), parseInt(offset));
        } else {
            messages = dataStore.getRecentMessages(parseInt(limit), parseInt(offset));
        }
        
        res.json(messages);
    } catch (error) {
        logger.error('API messages error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/contacts', (req, res) => {
    try {
        // Get all contacts and filter out group chats
        const allContacts = dataStore.getAllContacts();
        
        // Create a Map to ensure unique contacts by phone number
        const uniqueContacts = new Map();
        
        allContacts.forEach(contact => {
            // Skip group chats and status broadcasts
            if (contact.id.includes('@g.us') || contact.id.includes('@broadcast')) {
                return;
            }
            
            // Use phone number as the unique identifier
            const phoneNumber = contact.id.split('@')[0];
            
            // Only keep the most recent contact info if there are duplicates
            if (!uniqueContacts.has(phoneNumber) || 
                (contact.lastMessage > (uniqueContacts.get(phoneNumber).lastMessage || 0))) {
                uniqueContacts.set(phoneNumber, contact);
            }
        });
        
        // Convert Map values to array and sort by last message time (newest first)
        const uniqueContactsArray = Array.from(uniqueContacts.values()).sort((a, b) => 
            (b.lastMessage || 0) - (a.lastMessage || 0)
        );
        
        res.json(uniqueContactsArray);
    } catch (error) {
        logger.error('API contacts error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/send-message', async (req, res) => {
    try {
        const { contactId, message, mediaPath } = req.body;
        
        if (!sock || !isConnected) {
            return res.status(400).json({ error: 'Bot not connected' });
        }

        const result = await messageHandler.sendMessage(sock, contactId, message);
        res.json({ success: result, result });
    } catch (error) {
        logger.error('Send message error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/broadcast', async (req, res) => {
    try {
        const { message, contacts, mediaPath } = req.body;
        
        if (!sock || !isConnected) {
            return res.status(400).json({ error: 'Bot not connected' });
        }

        const results = await messageHandler.broadcastMessage(sock, message, contacts, mediaPath);
        res.json({ success: true, results });
    } catch (error) {
        logger.error('Broadcast error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/export-contacts', async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Contacts');

        // Add headers
        worksheet.columns = [
            { header: 'Name', key: 'name', width: 20 },
            { header: 'Phone Number', key: 'phone', width: 15 },
            { header: 'Language', key: 'language', width: 10 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'First Contact', key: 'firstContact', width: 20 },
            { header: 'Last Contact', key: 'lastContact', width: 20 },
            { header: 'Message Count', key: 'messageCount', width: 15 },
            { header: 'Demo Requested', key: 'demoRequested', width: 15 },
            { header: 'Trigger Message', key: 'triggerMessage', width: 30 }
        ];

        // Get all messages to find trigger messages
        const allMessages = dataStore.getAllMessages();
        const triggerPhrases = [
            'hello', 'hi', 'hey', 'info', 'more info', 'information', 'details', 
            'tell me more', 'about', 'student ai', 'can i get info', 'get more info',
            'info please', 'information please', 'what is student ai', 'about student ai'
        ];

        // Find contacts who sent trigger messages
        const triggerContacts = new Map();
        
        allMessages.forEach(message => {
            if (!message.fromBot && message.text) {
                const messageText = message.text.toLowerCase();
                const isTrigger = triggerPhrases.some(phrase => messageText.includes(phrase));
                
                if (isTrigger) {
                    const contactId = message.contactId;
                    if (!triggerContacts.has(contactId)) {
                        const contact = dataStore.getContact(contactId);
                        if (contact) {
                            triggerContacts.set(contactId, {
                                ...contact,
                                triggerMessage: message.text.substring(0, 50) + (message.text.length > 50 ? '...' : '')
                            });
                        }
                    }
                }
            }
        });

        // Convert map values to array and sort by last message time (newest first)
        const contacts = Array.from(triggerContacts.values()).sort((a, b) => 
            (b.lastMessage || 0) - (a.lastMessage || 0)
        );

        // Add rows to worksheet
        contacts.forEach(contact => {
            worksheet.addRow({
                name: contact.name || 'Unknown',
                phone: contact.phone || contact.id.split('@')[0],
                language: contact.language || 'Not set',
                status: contact.status || 'Active',
                firstContact: contact.firstContact ? moment(contact.firstContact).format('YYYY-MM-DD HH:mm:ss') : '',
                lastContact: contact.lastContact ? moment(contact.lastContact).format('YYYY-MM-DD HH:mm:ss') : '',
                messageCount: contact.messageCount || 0,
                demoRequested: contact.demoRequested ? 'Yes' : 'No',
                triggerMessage: contact.triggerMessage || ''
            });
        });

        // Style the headers
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF25D366' }
        };

        // Set proper headers for Excel file download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=contacts_${moment().format('YYYY-MM-DD')}.xlsx`);
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // Write the workbook to the response
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        logger.error('Export contacts error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/export-messages', async (req, res) => {
    try {
        // Get all messages and filter for messages from triggered contacts
        const allMessages = dataStore.getAllMessages();
        const triggeredMessages = allMessages.filter(message => 
            dataStore.isTriggeredContact(message.contactId)
        );

        // Prepare data for xlsx
        const ws_data = [
            ['Timestamp', 'Contact Name', 'Phone Number', 'Message Type', 'Message', 'Media Type', 'Language', 'Status'],
            ...triggeredMessages.map(message => [
                moment(message.timestamp).format('YYYY-MM-DD HH:mm:ss'),
                message.contactName || 'Unknown',
                message.phone,
                message.fromBot ? 'Bot' : 'User',
                message.text || '[Media Message]',
                message.mediaType || '',
                message.language || '',
                message.status || 'delivered'
            ])
        ];

        // Create workbook and worksheet using xlsx
        const ws = XLSX.utils.aoa_to_sheet(ws_data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Messages');

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=messages_${moment().format('YYYY-MM-DD')}.xlsx`);
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // Write the workbook to a buffer and send
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
        res.status(200).send(wbout);

    } catch (error) {
        logger.error('Export messages error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/settings', (req, res) => {
    try {
        const settings = req.body;
        dataStore.updateSettings(settings);
        res.json({ success: true });
    } catch (error) {
        logger.error('Update settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/restart', async (req, res) => {
    try {
        logger.info('Restarting bot connection...');
        console.log('🔄 Restarting bot connection...');
        
        if (sock) {
            sock.ws.close();
        }
        
        setTimeout(connectToWhatsApp, 2000);
        res.json({ success: true, message: 'Bot restart initiated' });
    } catch (error) {
        logger.error('Restart error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/logout', async (req, res) => {
    try {
        if (sock) {
            await sock.logout();
        }
        
        // Clear auth files
        await fs.remove('./auth_info_baileys');
        
        isConnected = false;
        connectionState = 'disconnected';
        qrCodeString = '';
        
        logger.info('Logged out successfully');
        console.log('✅ Logged out successfully');
        
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        logger.error('Logout error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    logger.error('Express error:', error);
    console.error('❌ Express error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('404', { config: BOT_CONFIG });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Shutting down gracefully...');
    console.log('\n🛑 Shutting down gracefully...');
    
    if (messageHandler) {
        messageHandler.cleanup();
    }
    
    if (sock) {
        sock.ws.close();
    }
    
    await dataStore.save();
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server
app.listen(PORT, () => {
    logger.success(`Server running on port ${PORT}`);
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`ℹ️  Dashboard: http://localhost:${PORT}`);
    console.log(`ℹ️  QR Code: http://localhost:${PORT}/qr`);
    
    // Create required directories
    fs.ensureDirSync('public/media/images');
    fs.ensureDirSync('public/media/videos');
    fs.ensureDirSync('public/media/audio');
    fs.ensureDirSync('public/media/documents');
    fs.ensureDirSync('data');
    fs.ensureDirSync('logs');
    
    console.log('📁 Required directories created');
    
    // Start WhatsApp connection
    connectToWhatsApp();
});

module.exports = app;