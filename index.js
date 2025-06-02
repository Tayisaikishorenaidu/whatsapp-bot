const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const fs = require('fs').promises;
const path = require('path');
const fsExtra = require('fs-extra');
const qrcode = require("qrcode-terminal");
const dataStore = require("./src/data");

// Timer tracking for message processing
const messageTimers = new Map(); // Stores timers for each contact
const MESSAGE_DELAY_MS = 10000; // 10 seconds delay between messages for the same user

// FOOTER CONFIGURATION
const FOOTER_MESSAGE = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🌐 Visit us: https://thestudentai.in\n📸 Follow us on Instagram:@studentaisoftware\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

// SPECIAL FOOTER FOR WEBSITE DETAILS (FINAL MESSAGE)
const SPECIAL_FOOTER_MESSAGE = `\n\n**📞 Need Help? Contact the Student AI Team!**\nFor any questions or information about our features, plans, or support, feel free to reach out to our team.\n📧 Email: studentaisoftware@gmail.com\n📱 WhatsApp: +91 824775806 +91 9242107942\n🌐 Website: www.thestudentai.in\n📸 Instagram: @studentaisoftware\nWe're here to help you learn smarter and stress-free! 😊`;

// Function to add footer to any message
const addFooterToMessage = (message) => {
  return message + FOOTER_MESSAGE;
};

// Function to add special footer to final message (website details)
const addSpecialFooterToMessage = (message) => {
  return message + SPECIAL_FOOTER_MESSAGE;
};

// Function to start a timer for a message
const startMessageTimer = (contactId, contactName) => {
  const startTime = Date.now();
  const timerId = `timer_${contactId}_${startTime}`;

  console.log(
    `⏱️ [${new Date().toISOString()}] Timer started for ${contactName} (${contactId})`
  );

  // Store the timer info
  messageTimers.set(timerId, {
    contactId,
    contactName,
    startTime,
    timer: setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.log(
        `⏱️ [${new Date().toISOString()}] Waiting ${elapsed}s for ${contactName} (${contactId})`
      );
    }, 1000), // Log every second
  });

  return timerId;
};

// Function to stop and clear a timer
const stopMessageTimer = (timerId) => {
  if (messageTimers.has(timerId)) {
    const { contactName, contactId, timer } = messageTimers.get(timerId);
    clearInterval(timer);
    const elapsed = Math.floor(
      (Date.now() - messageTimers.get(timerId).startTime) / 1000
    );
    console.log(
      `✅ [${new Date().toISOString()}] Timer stopped for ${contactName} (${contactId}) after ${elapsed}s`
    );
    messageTimers.delete(timerId);
  }
};

const server = require("./server");
const errorHandler = require("./src/errorHandler");

// Setup global error handlers
errorHandler.setupGlobalHandlers();

// Global variables
global.botStatus = false;
const pendingReplies = new Map(); // Track pending replies with timers
const languageSelectionTimers = new Map(); // Track users waiting for language selection
const demoSelectionTimers = new Map(); // Track users waiting for demo selection
const LANGUAGE_SELECTION_TIMEOUT = 30000; // 30 seconds timeout for language selection
const DEMO_SELECTION_TIMEOUT = 30000; // 30 seconds timeout for demo selection
const DEMO_PROMPT_DELAY = 20000; // 20 seconds delay before sending demo prompt
const HELP_MESSAGE_TIMEOUT = 30000; // 30 seconds timeout for help message

// Create a new client instance with local authentication
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "whatsapp-bot",
  }),
  puppeteer: {
    headless: true,
    executablePath:
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-component-extensions-with-background-pages",
      "--disable-default-apps",
      "--mute-audio",
      "--window-size=1280,720",
    ],
    executablePath:
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    ignoreHTTPSErrors: true,
    browserWSEndpoint: process.env.BROWSER_WS_ENDPOINT,
    protocolTimeout: 60000, // Increase protocol timeout to 60 seconds
    defaultViewport: {
      width: 1280,
      height: 720,
    },
  },
  restartOnAuthFail: true,
  takeoverOnConflict: true,
  takeoverTimeoutMs: 60000,
});

// Make client available globally for API endpoints
global.whatsappClient = client;

// Add error handler for browser errors
client.pupBrowser?.on("disconnected", () => {
  console.log("🔄 Browser disconnected, attempting to reconnect...");
  // Attempt to reinitialize after a short delay
  setTimeout(() => {
    try {
      client.initialize();
    } catch (error) {
      console.error("❌ Failed to reinitialize client:", error);
    }
  }, 5000);
});

// Event: QR Code generation
client.on("qr", (qr) => {
  console.log("🔗 QR code generated, check the dashboard to scan");
  // Ensure the QR code is properly formatted
  const qrData = qr.startsWith('http') ? qr : `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qr)}`;
  
  console.log('Sending QR code to dashboard...');
  // Send QR code to dashboard via WebSocket
  if (global.broadcastStatus) {
    try {
      global.broadcastStatus({
        type: 'qr',
        qr: qrData,
        status: 'QR code ready',
        timestamp: new Date().toISOString()
      });
      console.log('QR code sent to dashboard');
    } catch (error) {
      console.error('Error sending QR code to dashboard:', error);
    }
  } else {
    console.error('broadcastStatus function not available');
  }
});

// Event: Client is ready
client.on("ready", () => {
  console.log("✅ Client is ready!");
  global.botStatus = true;
  
  // Update dashboard with connection status
  if (global.broadcastStatus) {
    global.broadcastStatus({
      type: 'status',
      status: 'connected',
      message: 'WhatsApp is connected and ready',
      timestamp: new Date().toISOString()
    });
  }
});

// Event: Authentication successful
client.on("authenticated", () => {
  console.log("🔐 Authentication successful!");
});

// Event: Authentication failed
client.on("auth_failure", (msg) => {
  console.error("❌ Authentication failed:", msg);
  global.botStatus = false;
  
  // Update dashboard with auth failure
  if (global.broadcastStatus) {
    global.broadcastStatus({
      type: 'status',
      status: 'auth_failed',
      message: 'Authentication failed: ' + msg,
      timestamp: new Date().toISOString()
    });
  }
});

// Event: Client disconnected
client.on("disconnected", (reason) => {
  console.log("📴 Client was disconnected:", reason);
  global.botStatus = false;
  
  // Update dashboard with disconnection status
  if (global.broadcastStatus) {
    global.broadcastStatus({
      type: 'status',
      status: 'disconnected',
      message: 'Disconnected: ' + reason,
      timestamp: new Date().toISOString()
    });
  }
});

// Keywords that will bypass the delay
const BYPASS_DELAY_KEYWORDS = [
  "urgent",
  "important",
  "help",
  "support",
  "emergency",
  "immediate",
  "asap",
  "now",
  "quick",
  "fast",
];

// Helper function to check if message should bypass delay
const shouldBypassDelay = (message) => {
  if (!message || !message.body) return false;
  const messageText = message.body.toLowerCase();
  return BYPASS_DELAY_KEYWORDS.some((keyword) =>
    messageText.includes(keyword.toLowerCase())
  );
};

// Function to detect language choice from user input
const detectLanguageChoice = (messageBody) => {
  if (!messageBody) return null;
  
  const input = messageBody.toLowerCase().trim();
  
  // English variations
  const englishKeywords = [
    '1', 'english', 'eng', 'english please', 'i want english',
   // Some users might type in other scripts
  ];
  
  // Hindi variations  
  const hindiKeywords = [
    '2', 'hindi', 'hin',  'hindi please', 'i want hindi',
    'हिंदी', 'हिन्दी', 'hindi', 'हैं'
  ];
  
  // Check for English
  if (englishKeywords.some(keyword => input.includes(keyword))) {
    return 'en';
  }
  
  // Check for Hindi
  if (hindiKeywords.some(keyword => input.includes(keyword))) {
    return 'hin';
  }
  
  return null; // No match found
};

// Function to detect demo choice from user input
const detectDemoChoice = (messageBody) => {
  if (!messageBody) return null;
  
  const input = messageBody.toLowerCase().trim();
  
  // Yes variations (case insensitive)
  const yesKeywords = [
    'yes', 'yeah', 'yep', 'yup', 'y', 'sure', 'ok', 'okay', 'okey', 'interested', 
    'want demo', 'show demo', 'demo please', 'i want demo', 'demo', 'see demo',
    'हाँ', 'हां', 'जी हाँ', 'जी हां', 'जी', 'yes please', 'demo video', 'want to see'
  ];
  
  // No variations (case insensitive)
  const noKeywords = [
    'no', 'nope', 'nah', 'not interested', 'no demo', 'skip', 'no thanks',
    'not now', 'later', 'नहीं', 'ना', 'जी नहीं', 'no thank you', 'skip demo'
  ];
  
  // Check for exact matches or contains matches (case insensitive)
  if (yesKeywords.some(keyword => 
    input === keyword.toLowerCase() || input.includes(keyword.toLowerCase())
  )) {
    return 'yes';
  }
  
  if (noKeywords.some(keyword => 
    input === keyword.toLowerCase() || input.includes(keyword.toLowerCase())
  )) {
    return 'no';
  }
  
  return null; // No match found
};

// UPDATED: Add a helper message with image for unclear responses (manual use only)
const sendLanguageHelpMessage = async (chatId, contactName) => {
  try {
    const helpMessage = 
      `I didn't understand your language choice. Please reply with:\n\n` +
      `• Type "1" or "English" for English\n` +
      `• Type "2" or "Hindi" for हिंदी\n\n` +
      `Or simply type "English" or "Hindi"`;
    
    // Add footer to help message
    const helpMessageWithFooter = addFooterToMessage(helpMessage);
    
    // Send image with help message
    const imagePath = path.join(__dirname, "public", "media","images", "newlogo.jpg");
    
    if (fs.existsSync(imagePath)) {
      try {
        const media = MessageMedia.fromFilePath(imagePath);
        await client.sendMessage(chatId, media, {
          caption: helpMessageWithFooter
        });
        console.log(`❓ Sent language help message with image and footer to ${contactName}`);
      } catch (imageError) {
        // Fallback: send text only if image fails
        await client.sendMessage(chatId, helpMessageWithFooter);
        console.log(`❓ Sent language help message with footer (text only) to ${contactName}`);
      }
    } else {
      // Fallback: send text only if image not found
      await client.sendMessage(chatId, helpMessageWithFooter);
      console.log(`❓ Sent language help message with footer (text only - image not found) to ${contactName}`);
    }
    
  } catch (error) {
    console.error(`❌ Error sending help message to ${contactName}:`, error);
  }
};

// Function to send language selection prompt with timeout
const sendLanguagePrompt = async (chatId, contactName) => {
  try {
    const welcomeMessage =
      `Welcome to Student AI – India's First AI-Powered E-Learning Platform! 🚀\n\n` +
      `Which Language you speak - Hindi or English?\n\n` +
      `• For English : Type "1" or "English"\n` +
      `• For Hindi : Type "2" or "Hindi" \n\n` +
      `Or simply type "English" or "Hindi"`;

    // NO FOOTER for language selection - send as plain message with image
    // Send image with welcome message (NO FOOTER)
    const imagePath = path.join(__dirname, "public","media", "images", "newlogo.jpg");
    
    if (fs.existsSync(imagePath)) {
      try {
        const media = MessageMedia.fromFilePath(imagePath);
        await client.sendMessage(chatId, media, {
          caption: welcomeMessage
        });
        console.log(`📤 Sent language selection prompt with image (NO FOOTER) to ${contactName}`);
      } catch (imageError) {
        // Fallback: send text only if image fails
        await client.sendMessage(chatId, welcomeMessage);
        console.log(`📤 Sent language selection prompt (NO FOOTER, text only) to ${contactName}`);
      }
    } else {
      // Fallback: send text only if image not found
      await client.sendMessage(chatId, welcomeMessage);
      console.log(`📤 Sent language selection prompt (NO FOOTER, text only - image not found) to ${contactName}`);
    }

    // Extract contactId from chatId for timer tracking
    const contactId = chatId.replace('@c.us', '');
    
    // Set timer for language selection timeout
    languageSelectionTimers.set(contactId, {
      chatId: chatId,
      contactName: contactName,
      timestamp: Date.now()
    });
    
    // Set 30-second timeout for language selection reminder ONLY
    setTimeout(async () => {
      if (languageSelectionTimers.has(contactId)) {
        const reminderMessage = `I am still waiting for your reply for preferred language.\n\n` +
      `• Type "1" or "English" for English\n` +
      `• Type "2" or "Hindi" for हिंदी\n\n` +
      `Or simply type "English" or "Hindi"`;
        
        // NO FOOTER for reminder message either
        try {
          await client.sendMessage(chatId, reminderMessage);
          console.log(`⏰ Sent language selection reminder (NO FOOTER) to ${contactName} after 30s`);
          
          // Clear the timer after sending reminder - no more follow-ups
          languageSelectionTimers.delete(contactId);
          
        } catch (error) {
          console.error(`❌ Failed to send language reminder to ${contactName}:`, error);
        }
      }
    }, LANGUAGE_SELECTION_TIMEOUT);
    
  } catch (error) {
    console.error(`❌ Error sending language prompt to ${contactName}:`, error);
  }
};

// Function to send demo selection prompt with timeout
const sendDemoPrompt = async (chatId, contactName, language) => {
  try {
    let demoMessage = "";

    if (language === "en") {
      demoMessage = `Do you want to see a demo? 🎥\n\n` +
        `• Type "Yes" to see a demo video\n` +
        `• Type "No" for website details and contact info\n\n` +
        `Or simply type "Yes" or "No"`;
    } else if (language === "hi") {
      demoMessage = `क्या आप डेमो देखना चाहते हैं? 🎥\n\n` +
        `• "Yes" टाइप करें डेमो वीडियो देखने के लिए\n` +
        `• "No" टाइप करें वेबसाइट डिटेल्स और संपर्क जानकारी के लिए\n\n` +
        `या सिर्फ "Yes" या "No" टाइप करें`;
    }

    // NO FOOTER for demo prompt - send as plain message with image
    // Send image with demo message (NO FOOTER)
    const imagePath = path.join(__dirname, "public", "media", "images", "newlogo.jpg");
    
    if (fs.existsSync(imagePath)) {
      try {
        const media = MessageMedia.fromFilePath(imagePath);
        await client.sendMessage(chatId, media, {
          caption: demoMessage
        });
        console.log(`🎥 Sent demo selection prompt with image (NO FOOTER) to ${contactName}`);
      } catch (imageError) {
        // Fallback: send text only if image fails
        await client.sendMessage(chatId, demoMessage);
        console.log(`🎥 Sent demo selection prompt (NO FOOTER, text only) to ${contactName}`);
      }
    } else {
      // Fallback: send text only if image not found
      await client.sendMessage(chatId, demoMessage);
      console.log(`🎥 Sent demo selection prompt (NO FOOTER, text only - image not found) to ${contactName}`);
    }

    // Extract contactId from chatId for timer tracking
    const contactId = chatId.replace('@c.us', '');
    
    // Set timer for demo selection timeout
    demoSelectionTimers.set(contactId, {
      chatId: chatId,
      contactName: contactName,
      language: language,
      timestamp: Date.now()
    });
    
    // Set 30-second timeout for demo selection reminder ONLY
    setTimeout(async () => {
      if (demoSelectionTimers.has(contactId)) {
        const reminderMessage = language === "en" 
          ? `I am still waiting for your reply about the demo.\n\n` +
            `• Type "Yes" to see a demo video\n` +
            `• Type "No" for website details and contact info`
          : `मैं अभी भी डेमो के बारे में आपके जवाब का इंतज़ार कर रहा हूँ।\n\n` +
            `• "Yes" टाइप करें डेमो वीडियो देखने के लिए\n` +
            `• "No" टाइप करें वेबसाइट डिटेल्स के लिए`;
        
        // NO FOOTER for reminder message either
        try {
          await client.sendMessage(chatId, reminderMessage);
          console.log(`⏰ Sent demo selection reminder (NO FOOTER) to ${contactName} after 30s`);
          
          // Clear the timer after sending reminder - no more follow-ups
          demoSelectionTimers.delete(contactId);
          
        } catch (error) {
          console.error(`❌ Failed to send demo reminder to ${contactName}:`, error);
        }
      }
    }, DEMO_SELECTION_TIMEOUT);
    
  } catch (error) {
    console.error(`❌ Error sending demo prompt to ${contactName}:`, error);
  }
};

// Function to send demo video with text
const sendDemoVideo = async (chatId, contactName, language) => {
  try {
    let demoDescription = "";

    if (language === "en") {
      demoDescription = `🎥 Here's your demo of Student AI!\n\n` +
        `See how our AI helps students with:\n` +
        `✅ Homework solutions\n` +
        `✅ Concept explanations\n` +
        `✅ Step-by-step learning\n` +
        `✅ All subjects covered\n\n` +
        `Ready to get started? Visit: https://thestudentai.in/\n` +
        `Contact our team: SOWMYA - 8247765806, RIYA - 9242107942`;
    } else if (language === "hi") {
      demoDescription = `🎥 यहाँ है Student AI का डेमो!\n\n` +
        `देखें कैसे हमारा AI छात्रों की मदद करता है:\n` +
        `✅ होमवर्क सॉल्यूशन\n` +
        `✅ कॉन्सेप्ट एक्सप्लेनेशन\n` +
        `✅ स्टेप-बाई-स्टेप लर्निंग\n` +
        `✅ सभी विषय कवर\n\n` +
        `शुरू करने के लिए तैयार? Visit: https://thestudentai.in/\n` +
        `हमारी टीम से संपर्क करें: SOWMYA - 8247765806, RIYA - 9242107942`;
    }

    // Add footer to description
    const demoDescriptionWithFooter = addFooterToMessage(demoDescription);

    // Send demo video - UPDATED TO USE DemoVideo.mp4
    const videoPath = path.join(__dirname, "public", "media", "video", "DemoVideo.mp4");

    if (fs.existsSync(videoPath)) {
      console.log(`📹 Attempting to send demo video: ${videoPath}`);

      // Check file size
      const stats = fs.statSync(videoPath);
      console.log(`📊 Demo video file size: ${Math.round(stats.size / 1024 / 1024)} MB`);

      // METHOD 1: Try using base64 encoding directly (most reliable)
      try {
        const fileData = fs.readFileSync(videoPath, { encoding: "base64" });
        const media = new MessageMedia("video/mp4", fileData, path.basename(videoPath));

        await client.sendMessage(chatId, media, {
          caption: demoDescriptionWithFooter,
        });

        console.log(`✅ Successfully sent DemoVideo.mp4 with base64 method and footer to ${contactName}`);

        // Log successful message
        dataStore.addMessage({
          sender: "Bot",
          contactId: chatId,
          text: `DemoVideo.mp4 sent with description and footer (base64 method)`,
          mediaType: "video",
          mediaPath: videoPath,
          language: language,
          time: new Date().toLocaleString(),
          timestamp: Date.now(),
          status: "delivered",
        });

        return; // Success, exit function
      } catch (base64Error) {
        console.log("🔄 Base64 method failed for DemoVideo.mp4, trying fromFilePath method...");
      }

      // METHOD 2: Try fromFilePath (backup method)
      try {
        const media = MessageMedia.fromFilePath(videoPath);

        await client.sendMessage(chatId, media, {
          caption: demoDescriptionWithFooter,
        });

        console.log(`✅ Successfully sent DemoVideo.mp4 with fromFilePath method and footer to ${contactName}`);

        // Log successful message
        dataStore.addMessage({
          sender: "Bot",
          contactId: chatId,
          text: `DemoVideo.mp4 sent with description and footer (fromFilePath method)`,
          mediaType: "video",
          mediaPath: videoPath,
          language: language,
          time: new Date().toLocaleString(),
          timestamp: Date.now(),
          status: "delivered",
        });

        return; // Success, exit function
      } catch (filePathError) {
        console.log("🔄 FromFilePath method also failed for DemoVideo.mp4, trying shorter caption...");
      }

      // METHOD 3: Try with shorter caption
      try {
        const media = MessageMedia.fromFilePath(videoPath);
        const shortCaption = language === "en"
          ? `🎥 Student AI Demo\nVisit: https://thestudentai.in/\nSOWMYA: 8247765806, RIYA: 9242107942`
          : `🎥 Student AI डेमो\nVisit: thestudentai.in\nSOWMYA: 8247765806, RIYA: 9242107942`;

        // Add footer to short caption
        const shortCaptionWithFooter = addFooterToMessage(shortCaption);

        await client.sendMessage(chatId, media, {
          caption: shortCaptionWithFooter,
        });

        console.log("✅ Successfully sent DemoVideo.mp4 with shorter caption and footer");
        return; // Success, exit function
      } catch (shortCaptionError) {
        console.log("❌ All DemoVideo.mp4 methods failed, sending text only");
      }
    } else {
      console.error(`❌ DemoVideo.mp4 file not found: ${videoPath}`);
    }

    // FALLBACK: Send text message only with footer
    const fallbackMessageWithFooter = addFooterToMessage(demoDescription);
    await client.sendMessage(chatId, fallbackMessageWithFooter);
    console.log(`📝 Sent demo text message with footer to ${contactName} as DemoVideo.mp4 fallback`);
  } catch (error) {
    console.error(`❌ Error in sendDemoVideo for ${contactName}:`, error);

    // Log error
    dataStore.addMessage({
      sender: "System",
      contactId: chatId,
      text: `Error sending DemoVideo.mp4: ${error.message}`,
      status: "error",
      time: new Date().toLocaleString(),
      timestamp: Date.now(),
    });

    // Final fallback: Send basic text message with footer
    try {
      const fallbackMessage = language === "en"
        ? `🎥 Demo available at: https://thestudentai.in/\nContact: SOWMYA - 8247765806, RIYA - 9242107942`
        : `🎥 डेमो यहाँ देखें: thestudentai.in\nContact: SOWMYA - 8247765806, RIYA - 9242107942`;

      const fallbackMessageWithFooter = addFooterToMessage(fallbackMessage);
      await client.sendMessage(chatId, fallbackMessageWithFooter);
    } catch (finalError) {
      console.error("❌ Even DemoVideo.mp4 fallback message failed:", finalError);
    }
  }
};

// Function to send website details and contact info
const sendWebsiteDetails = async (chatId, contactName, language) => {
  try {
    // The special footer message that will be sent with IfSayNo.png image
    const specialFooterMessage = `**📞 Need Help? Contact the Student AI Team!**\nFor any questions or information about our features, plans, or support, feel free to reach out to our team.\n📧 Email: studentaisoftware@gmail.com\n📱 WhatsApp: +91 824775806 +91 9242107942\n🌐 Website: www.thestudentai.in\n📸 Instagram: @studentaisoftware\nWe're here to help you learn smarter and stress-free! 😊`;

    // Send IfSayNo.png image with the special footer message
    const imagePath = path.join(__dirname, "public", "media", "images", "IfSayNo.png");
    
    if (fs.existsSync(imagePath)) {
      try {
        const media = MessageMedia.fromFilePath(imagePath);
        await client.sendMessage(chatId, media, {
          caption: specialFooterMessage
        });
        console.log(`🌐 Sent IfSayNo image with special footer message to ${contactName}`);
      } catch (imageError) {
        // Fallback: send text only if image fails
        await client.sendMessage(chatId, specialFooterMessage);
        console.log(`🌐 Sent special footer message (text only) to ${contactName}`);
      }
    } else {
      // Fallback: send text only if image not found
      await client.sendMessage(chatId, specialFooterMessage);
      console.log(`🌐 Sent special footer message (text only - image not found) to ${contactName}`);
    }

    // Log message
    dataStore.addMessage({
      sender: "Bot",
      contactId: chatId,
      text: `IfSayNo image sent with special footer message`,
      language: language,
      time: new Date().toLocaleString(),
      timestamp: Date.now(),
      status: "delivered",
    });

  } catch (error) {
    console.error(`❌ Error sending website details to ${contactName}:`, error);
  }
};

// Function to send content with video - UPDATED WITH FOOTER AND DEMO PROMPT
const sendContentWithVideo = async (chatId, contactName, language) => {
  try {
    let fullDescription = "";
    let videoFileName = "";

    if (language === "en") {
      fullDescription = `FREE FOR STUDENTS | UNLIMITED AI | LIFETIME

Visit: https://thestudentai.in/ from your mobile, 
Click on FREE PLAN,
Sign in with GMAIL

Hi! Our Student AI helps 4th-12th class students with:

✅ Daily homework assistance
✅ Concept clarifications  
✅ Covers all school subjects

Our team is ready to help you: SOWMYA - 8247765806, RIYA 9242107942
Thanks, Student AI Team`;

      videoFileName = "English Version _ Intro.mp4";
    } else if (language === "hi") {
      fullDescription = `छात्रों के लिए मुफ्त | अनलिमिटेड AI | लाइफटाइम

Visit: https://thestudentai.in/ अपने मोबाइल से, 
FREE PLAN पर क्लिक करें,
GMAIL से साइन इन करें

नमस्ते! हमारा Student AI 4वीं-12वीं कक्षा के छात्रों की मदद करता है:

✅ रोजाना होमवर्क में सहायता
✅ कॉन्सेप्ट की स्पष्टता  
✅ सभी स्कूली विषयों को कवर करता है

हमारी टीम आपकी मदद के लिए तैयार है: SOWMYA - 8247765806, RIYA 9242107942
धन्यवाद, Student AI Team`;

      videoFileName = "First Day_Followup_Riya_Hindi Version.mp4";
    }

    // Add footer to description
    const fullDescriptionWithFooter = addFooterToMessage(fullDescription);

    // Send video with full description as caption
    const videoPath = path.join(
      __dirname,
      "public",
      "media",
      "video",
      videoFileName
    );

    if (fs.existsSync(videoPath)) {
      console.log(`📹 Attempting to send video: ${videoPath}`);

      // Check file size
      const stats = fs.statSync(videoPath);
      console.log(
        `📊 Video file size: ${Math.round(stats.size / 1024 / 1024)} MB`
      );

      // METHOD 1: Try using base64 encoding directly (most reliable)
      try {
        const fileData = fs.readFileSync(videoPath, { encoding: "base64" });
        const media = new MessageMedia(
          "video/mp4",
          fileData,
          path.basename(videoPath)
        );

        await client.sendMessage(chatId, media, {
          caption: fullDescriptionWithFooter,
        });

        console.log(
          `✅ Successfully sent ${language} video with base64 method and footer to ${contactName}`
        );

        // Log successful message
        dataStore.addMessage({
          sender: "Bot",
          contactId: chatId,
          text: `Video sent with full description and footer (base64 method)`,
          mediaType: "video",
          mediaPath: videoPath,
          language: language,
          time: new Date().toLocaleString(),
          timestamp: Date.now(),
          status: "delivered",
        });

        // Schedule demo prompt after 20 seconds
        setTimeout(async () => {
          await sendDemoPrompt(chatId, contactName, language);
        }, DEMO_PROMPT_DELAY);

        return; // Success, exit function
      } catch (base64Error) {
        console.log("🔄 Base64 method failed, trying fromFilePath method...");
      }

      // METHOD 2: Try fromFilePath (backup method)
      try {
        const media = MessageMedia.fromFilePath(videoPath);

        await client.sendMessage(chatId, media, {
          caption: fullDescriptionWithFooter,
        });

        console.log(
          `✅ Successfully sent ${language} video with fromFilePath method and footer to ${contactName}`
        );

        // Log successful message
        dataStore.addMessage({
          sender: "Bot",
          contactId: chatId,
          text: `Video sent with full description and footer (fromFilePath method)`,
          mediaType: "video",
          mediaPath: videoPath,
          language: language,
          time: new Date().toLocaleString(),
          timestamp: Date.now(),
          status: "delivered",
        });

        // Schedule demo prompt after 20 seconds
        setTimeout(async () => {
          await sendDemoPrompt(chatId, contactName, language);
        }, DEMO_PROMPT_DELAY);

        return; // Success, exit function
      } catch (filePathError) {
        console.log(
          "🔄 FromFilePath method also failed, trying shorter caption..."
        );
      }

      // METHOD 3: Try with shorter caption
      try {
        const media = MessageMedia.fromFilePath(videoPath);
        const shortCaption =
          language === "en"
            ? `Student AI - FREE AI Tutor\nVisit: https://thestudentai.in/\nSOWMYA: 8247765806, RIYA: 9242107942`
            : `Student AI - मुफ्त AI ट्यूटर\nVisit: thestudentai.in\nSOWMYA: 8247765806, RIYA: 9242107942`;

        // Add footer to short caption
        const shortCaptionWithFooter = addFooterToMessage(shortCaption);

        await client.sendMessage(chatId, media, {
          caption: shortCaptionWithFooter,
        });

        console.log("✅ Successfully sent video with shorter caption and footer");

        // Schedule demo prompt after 20 seconds
        setTimeout(async () => {
          await sendDemoPrompt(chatId, contactName, language);
        }, DEMO_PROMPT_DELAY);

        return; // Success, exit function
      } catch (shortCaptionError) {
        console.log("❌ All video methods failed, sending text only");
      }
    } else {
      console.error(`❌ Video file not found: ${videoPath}`);
    }

    // FALLBACK: Send text message only with footer
    const fallbackMessageWithFooter = addFooterToMessage(fullDescription);
    await client.sendMessage(chatId, fallbackMessageWithFooter);
    console.log(`📝 Sent text message with footer to ${contactName} as video fallback`);

    // Schedule demo prompt after 20 seconds even for fallback
    setTimeout(async () => {
      await sendDemoPrompt(chatId, contactName, language);
    }, DEMO_PROMPT_DELAY);

  } catch (error) {
    console.error(
      `❌ Error in sendContentWithVideo for ${contactName}:`,
      error
    );

    // Log error
    dataStore.addMessage({
      sender: "System",
      contactId: chatId,
      text: `Error sending content: ${error.message}`,
      status: "error",
      time: new Date().toLocaleString(),
      timestamp: Date.now(),
    });

    // Final fallback: Send basic text message with footer
    try {
      const fallbackMessage =
        language === "en"
          ? `Student AI - FREE AI Tutor for 4th-12th class students!\n\nVisit: https://thestudentai.in/\nContact: SOWMYA - 8247765806, RIYA - 9242107942`
          : `Student AI - मुफ्त AI ट्यूटर!\n\nVisit: thestudentai.in\nContact: SOWMYA - 8247765806, RIYA - 9242107942`;

      const fallbackMessageWithFooter = addFooterToMessage(fallbackMessage);
      await client.sendMessage(chatId, fallbackMessageWithFooter);

      // Schedule demo prompt after 20 seconds even for final fallback
      setTimeout(async () => {
        await sendDemoPrompt(chatId, contactName, language);
      }, DEMO_PROMPT_DELAY);

    } catch (finalError) {
      console.error("❌ Even fallback message failed:", finalError);
    }
  }
};

// Event: Incoming message - UPDATED WITH FLEXIBLE LANGUAGE DETECTION AND DEMO HANDLING
client.on("message", async (message) => {
  let timerId;
  try {
    // Skip if message is from us
    if (message.fromMe) {
      return;
    }

    // Get contact info
    const contact = await message.getContact();
    const chat = await message.getChat();
    const contactId = contact.id._serialized;
    const contactName = contact.name || contact.pushname || contact.number;
    
    // Skip if contact is saved in phone's contacts
    if (contact.isMyContact) {
      console.log(`ℹ️  Skipping message from saved contact: ${contactName}`);
      return;
    }

    // Skip group chats
    if (chat.isGroup) {
      return;
    }

    // Start timer for this message
    timerId = startMessageTimer(contactId, contactName);

    // Log incoming message
    const messageBody = message.body?.trim();
    console.log(
      `📨 [${new Date().toISOString()}] Message from ${contactName}:`
    );
    console.log(`   Content: ${messageBody || "[Media/Empty message]"}`);

    // Add to message history
    dataStore.addMessage({
      sender: contactName,
      contactId: contactId,
      text: messageBody || "[Media/Empty message]",
      isGroup: false,
      time: new Date().toLocaleString(),
      timestamp: Date.now(),
    });

    // IMPROVED: More flexible trigger phrase matching with multiple variations
    const triggerPhrases = [
      "hello! can i get more info on this?",
      "can i get more info on this?",
      "can i get info on this?",
      "hello can i get more info",
      "hello can i get info",
      "can i get more info",
      "can i get info",
      "get more info",
      "get info",
      "more info please"
    ];
    
    // Check for exact match with any trigger phrase
    const isExactMatch = messageBody && 
      triggerPhrases.some(phrase => 
        messageBody.toLowerCase().trim() === phrase.toLowerCase()
      );
    
    // Check for flexible match (contains key components)
    const triggerKeywords = ['hello', 'info', 'more info', 'information', 'details'];
    const actionWords = ['can', 'get', 'want', 'need', 'give', 'send', 'share'];
    
    const isFlexibleMatch = messageBody && 
      triggerKeywords.some(keyword => 
        messageBody.toLowerCase().includes(keyword.toLowerCase())
      ) && actionWords.some(action => 
        messageBody.toLowerCase().includes(action.toLowerCase())
      );

    if (isExactMatch || isFlexibleMatch) {
      // Send language selection prompt when trigger is detected
      console.log(
        `🎯 Trigger phrase detected from ${contactName}, sending language options`
      );
      await sendLanguagePrompt(message.from, contactName);
    }
    // IMPROVED: Flexible language selection handling
    else {
      const languageChoice = detectLanguageChoice(messageBody);
      const demoChoice = detectDemoChoice(messageBody);
      
      if (languageChoice) {
        // Check if user has a pending language selection
        const contactIdFromChat = contactId.replace('@c.us', '');
        const userHasPendingLanguageSelection = languageSelectionTimers.has(contactIdFromChat);

        if (userHasPendingLanguageSelection) {
          if (languageChoice === 'en') {
            // English selected - clear the timer
            languageSelectionTimers.delete(contactIdFromChat);
            
            console.log(`🇺🇸 ${contactName} selected English (detected from: "${messageBody}")`);
            dataStore.updateUser(contactId, { language: "en" });
            await sendContentWithVideo(message.from, contactName, "en");
          } else if (languageChoice === 'hi') {
            // Hindi selected - clear the timer
            languageSelectionTimers.delete(contactIdFromChat);
            
            console.log(`🇮🇳 ${contactName} selected Hindi (detected from: "${messageBody}")`);
            dataStore.updateUser(contactId, { language: "hi" });
            await sendContentWithVideo(message.from, contactName, "hi");
          }
        } else {
          // Ignore language selection if not pending
          console.log(
            `⏭️ Ignoring language selection from ${contactName} as no prompt was sent`
          );
        }
      }
      else if (demoChoice) {
        // Handle demo selection
        const contactIdFromChat = contactId.replace('@c.us', '');
        const userHasPendingDemoSelection = demoSelectionTimers.has(contactIdFromChat);

        if (userHasPendingDemoSelection) {
          const demoData = demoSelectionTimers.get(contactIdFromChat);
          const userLanguage = demoData.language;

          // Clear the demo selection timer
          demoSelectionTimers.delete(contactIdFromChat);

          if (demoChoice === 'yes') {
            console.log(`✅ ${contactName} wants to see demo (detected from: "${messageBody}")`);
            await sendDemoVideo(message.from, contactName, userLanguage);
          } else if (demoChoice === 'no') {
            console.log(`❌ ${contactName} doesn't want demo (detected from: "${messageBody}")`);
            await sendWebsiteDetails(message.from, contactName, userLanguage);
          }
        } else {
          // Ignore demo selection if not pending
          console.log(
            `⏭️ Ignoring demo selection from ${contactName} as no demo prompt was sent`
          );
        }
      }
      // For all other messages, do nothing
      else {
        console.log(`⏭️ Ignoring non-trigger message from ${contactName}: "${messageBody}"`);
      }
    }

    // Add delay between messages for the same user
    const lastMessageTime = messageTimers.get(`last_${contactId}`);
    if (lastMessageTime && Date.now() - lastMessageTime < MESSAGE_DELAY_MS) {
      const waitTime = MESSAGE_DELAY_MS - (Date.now() - lastMessageTime);
      console.log(
        `⏳ Waiting ${waitTime}ms before next message from ${contactName}`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    messageTimers.set(`last_${contactId}`, Date.now());

    // Stop the timer when message processing is complete
    if (timerId) stopMessageTimer(timerId);
  } catch (error) {
    console.error("❌ Error handling message:", error);
    if (timerId) stopMessageTimer(timerId);
  }
});

// Event: Message acknowledgment (message status updates)
client.on("message_ack", (msg, ack) => {
  if (ack === 3) {
    // Message was read by recipient
    console.log("📖 Message was read");
  }
});

// Handle process termination
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down bot and server...");

  // Clear all pending timers
  for (const [contactId, timer] of pendingReplies.entries()) {
    clearTimeout(timer);
  }
  pendingReplies.clear();

  // Clear language selection timers
  languageSelectionTimers.clear();

  // Clear demo selection timers
  demoSelectionTimers.clear();

  // Clear message timers
  for (const [timerId, timerData] of messageTimers.entries()) {
    if (timerData.timer) {
      clearInterval(timerData.timer);
    }
  }
  messageTimers.clear();

  // Close the server
  if (server && server.server) {
    server.server.close();
  }

  // Destroy the WhatsApp client
  await client.destroy();

  process.exit(0);
});

// Initialize the client
console.log("🚀 Starting WhatsApp bot and web dashboard...");

// Setup client error handlers
errorHandler.setupClientHandlers(client);

// Set initial status
global.botStatus = false;

// Function to cleanup session files
async function cleanupSessionFiles() {
    const sessionDir = path.join(__dirname, '.wwebjs_auth', 'session-whatsapp-bot');
    console.log(`Cleaning up session files in ${sessionDir}`);
    
    try {
        // Check if directory exists
        try {
            await fs.access(sessionDir);
        } catch (err) {
            console.log('Session directory does not exist, nothing to clean up');
            return;
        }
        
        // List all files in the session directory
        const files = await fs.readdir(sessionDir);
        
        // Close any open file handles
        for (const file of files) {
            const filePath = path.join(sessionDir, file);
            try {
                // Try to close any open file handles
                const fd = await fs.open(filePath, 'r+');
                await fd.close();
                console.log(`Closed file handle for ${file}`);
            } catch (err) {
                console.warn(`Could not close file ${file}:`, err.message);
            }
            
            // Delete the file with retry logic
            let retries = 3;
            while (retries > 0) {
                try {
                    await fs.unlink(filePath);
                    console.log(`Deleted ${file}`);
                    break;
                } catch (err) {
                    retries--;
                    if (retries === 0) {
                        console.error(`Failed to delete ${file} after multiple attempts:`, err.message);
                        // Try force removal as last resort
                        try {
                            await fsExtra.remove(filePath);
                            console.log(`Forcefully removed ${file}`);
                        } catch (forceErr) {
                            console.error(`Could not force remove ${file}:`, forceErr.message);
                        }
                    } else {
                        console.log(`Retrying delete for ${file}... (${retries} attempts left)`);
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
                    }
                }
            }
        }
        
        // Remove the directory itself
        try {
            await fs.rmdir(sessionDir);
            console.log('Removed session directory');
        } catch (err) {
            console.warn('Could not remove session directory:', err.message);
        }
    } catch (error) {
        console.error('Error during session cleanup:', error);
    }
}

// Handle application shutdown
async function handleShutdown() {
    console.log('\nShutting down gracefully...');
    
    try {
        // Close WhatsApp client if it exists
        if (client) {
            try {
                console.log('Logging out WhatsApp client...');
                await client.logout();
                console.log('WhatsApp client logged out');
            } catch (err) {
                console.error('Error during WhatsApp client logout:', err);
            }
        }
        
        // Cleanup session files
        await cleanupSessionFiles();
        
        console.log('Cleanup complete. Exiting...');
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
}

// Setup shutdown handlers
process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    handleShutdown().catch(err => {
        console.error('Error during shutdown after uncaught exception:', err);
        process.exit(1);
    });
});

// Initialize WhatsApp client
console.log('Initializing WhatsApp client...');
client.initialize().catch(async (error) => {
    console.error('Error initializing WhatsApp client:', error);
    
    // If initialization fails, try to clean up and restart
    if (error.message.includes('EBUSY') || error.message.includes('resource busy or locked')) {
        console.log('Detected locked files, attempting cleanup...');
        await cleanupSessionFiles();
        console.log('Cleanup complete. Please restart the application.');
    }
    
    // Update status on error
    if (global.broadcastStatus) {
        global.broadcastStatus({
            type: 'status',
            status: 'error',
            message: 'Failed to initialize WhatsApp client: ' + error.message,
            timestamp: new Date().toISOString()
        });
    }
    
    // Auto-restart after 5 seconds
    setTimeout(() => {
        console.log('Attempting to restart client...');
        client.initialize().catch(console.error);
    }, 5000);
});