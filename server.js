const express = require('express');
const bodyParser = require('body-parser');
const dataStore = require('./src/data');
const { exportUsersToExcel } = require('./exportUsers');

// Create express app
const app = express();
const PORT = process.env.PORT || 3002;

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', './views');

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
    const messages = dataStore.getMessages();
    const settings = dataStore.getSettings();
    const totalMessages = messages.length;
    const uniqueContacts = dataStore.getUniqueContactsCount();
    const totalResponses = dataStore.getTotalResponsesCount();
    
    // Add QR code status
    const qrStatus = {
        available: global.qrCodeData !== null,
        expiresAt: global.qrCodeExpiry
    };

    res.render('dashboard', {
        messages,
        settings,
        totalMessages,
        uniqueContacts,
        totalResponses,
        botStatus: global.botStatus || false,
        qrStatus: qrStatus
    });
});

// Handle settings updates
app.post('/settings', (req, res) => {
    const settings = {
        replyDelay: parseInt(req.body.replyDelay) || 120,
        enableAutoReply: req.body.enableAutoReply === 'on',
        supportNumber: req.body.supportNumber || ''
    };

    dataStore.updateSettings(settings);
    res.redirect('/');
});

// Export users to Excel
app.get('/api/export-users', async (req, res) => {
    try {
        const result = await exportUsersToExcel();
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }
                
        // Set headers for file download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=users_export.xlsx');
                
        // Send the Excel file
        res.send(result.data);
    } catch (error) {
        console.error('Error exporting users:', error);
        res.status(500).json({ error: 'Failed to export users' });
    }
});

// QR Code API endpoint
app.get('/api/qr-code', (req, res) => {
    if (global.qrCodeData && global.qrCodeExpiry && Date.now() < global.qrCodeExpiry) {
        res.json({ 
            success: true, 
            qrCode: global.qrCodeData,
            expiresAt: global.qrCodeExpiry
        });
    } else {
        res.json({ 
            success: false, 
            message: 'No QR code available or expired' 
        });
    }
});

// Force QR generation endpoint
app.post('/api/generate-qr', async (req, res) => {
    try {
        const client = global.whatsappClient;
        if (!client) {
            return res.status(500).json({ success: false, error: 'WhatsApp client not available' });
        }
        
        // Destroy current session to force new QR generation
        await client.destroy();
        
        // Wait a moment then reinitialize
        setTimeout(() => {
            client.initialize();
        }, 2000);
        
        res.json({ success: true, message: 'QR code generation requested' });
    } catch (error) {
        console.error('Error generating QR:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Handle message retry
app.post('/api/retry-message', async (req, res) => {
    try {
        const { contactId, message } = req.body;

        if (!contactId || !message) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Get the client instance from the main app
        const client = global.whatsappClient;

        if (!client) {
            return res.status(500).json({ success: false, error: 'WhatsApp client not connected' });
        }

        // Send the message
        await client.sendMessage(contactId, message);

        // Update the message status in the database if needed
        // dataStore.updateMessageStatus(contactId, message.id, 'retried');

        res.json({ success: true });
    } catch (error) {
        console.error('Error retrying message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start the server
const server = app.listen(PORT, () => {
    console.log(`🌐 Web dashboard running at http://localhost:${PORT}`);
});

// Export for use in index.js
module.exports = {
    app,
    server
};