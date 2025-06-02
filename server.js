const express = require('express');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');
const dataStore = require('./src/data');
const { exportUsersToExcel } = require('./exportUsers');

// WebSocket server for real-time updates
const setupWebSocket = (server) => {
  // Create WebSocket server on the same HTTP server
  const wss = new WebSocket.Server({ noServer: true });
  const clients = new Set();

  // Handle upgrade requests
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('New WebSocket client connected');

    // Send current status when a new client connects
    if (global.botStatus !== undefined) {
      ws.send(JSON.stringify({
        type: 'status',
        status: global.botStatus ? 'connected' : 'disconnected',
        message: global.botStatus ? 'WhatsApp is connected and ready' : 'WhatsApp is not connected',
        timestamp: new Date().toISOString()
      }));
    }

    ws.on('close', () => {
      clients.delete(ws);
      console.log('WebSocket client disconnected');
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  // Function to broadcast to all connected clients
  const broadcast = (data) => {
    if (clients.size === 0) return;
    
    const message = JSON.stringify(data);
    clients.forEach(client => {
      try {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
      }
    });
  };

  return { broadcast };
};

// Create express app
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Setup WebSocket server
const { broadcast } = setupWebSocket(server);

// Make broadcast function available globally
global.broadcastStatus = (data) => broadcast(data);

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

    res.render('dashboard', {
        messages,
        settings,
        totalMessages,
        uniqueContacts,
        totalResponses,
        botStatus: global.botStatus || false
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
// Add this route to your Express server

// Route to display QR code
app.get('/qr', (req, res) => {
  if (global.currentQR) {
    res.send(`
      <html>
        <head><title>WhatsApp QR Code</title></head>
        <body style="text-align: center; padding: 50px;">
          <h1>📱 Scan with WhatsApp</h1>
          <div id="qrcode"></div>
          <p>Open WhatsApp → Linked Devices → Scan QR Code</p>
          <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
          <script>
            QRCode.toCanvas(document.getElementById('qrcode'), '${global.currentQR}', function (error) {
              if (error) console.error(error);
              console.log('QR code generated successfully!');
            });
          </script>
        </body>
      </html>
    `);
  } else {
    res.send(`
      <html>
        <body style="text-align: center; padding: 50px;">
          <h1>⏳ Waiting for QR Code...</h1>
          <p>WhatsApp client is initializing. Refresh in a few seconds.</p>
          <script>setTimeout(() => location.reload(), 3000);</script>
        </body>
      </html>
    `);
  }
});

// Make currentQR available globally
global.currentQR = null;
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
const httpServer = app.listen(PORT, () => {
    console.log(`🌐 Web dashboard running at http://localhost:${PORT}`);
});

// Setup WebSocket server and get broadcast function
const wsServer = setupWebSocket(httpServer);

// Make broadcast function available globally
global.broadcastStatus = (data) => wsServer.broadcast(data);

// Export for use in index.js
module.exports = {
    app,
    server: httpServer
};
