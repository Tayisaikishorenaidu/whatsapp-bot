const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');

class MessageHandler {
    constructor(dataStore) {
        this.dataStore = dataStore;
        this.languageTimers = new Map();
        this.demoTimers = new Map();
        this.userStates = new Map();

        // Configuration
        this.config = {
            LANGUAGE_TIMEOUT: 30000,
            DEMO_TIMEOUT: 30000,
            DEMO_PROMPT_DELAY: 20000,
            MESSAGE_DELAY: 2000,

            FOOTER_MESSAGE: `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━\n🌐 Visit us: https://thestudentai.in\n📸 Follow us on Instagram:@studentaisoftware\n━━━━━━━━━━━━━━━━━━━━━━━━━`,

            SPECIAL_FOOTER: `\n\n📞 Need Help? Contact the Student AI Team!\nFor any questions or information about our features, plans, or support, feel free to reach out to our team.\n📧 Email: studentaisoftware@gmail.com\n📱 WhatsApp: +91 824775806 +91 9242107942\n🌐 Website: www.thestudentai.in\n📸 Instagram: @studentaisoftware\nWe're here to help you learn smarter and stress-free! 😊`,

            TRIGGER_PHRASES: [
                'hello! can i get more info on this?',
                'can i get more info on this?',
                'can i get info on this?',
                'hello can i get more info',
                'hello can i get info',
                'can i get more info',
                'can i get info',
                'get more info',
                'get info',
                'more info please',
                'info please',
                'information please',
                'tell me more',
                'more details',
                'student ai info',
                'about student ai',
                'what is student ai'
            ]
        };

        this.mediaDir = path.join(__dirname, '..', 'public', 'media');
        this.ensureMediaDirectories();
    }

    async ensureMediaDirectories() {
        const dirs = ['images', 'videos', 'audio', 'documents'];
        
        for (const dir of dirs) {
            const dirPath = path.join(this.mediaDir, dir);
            await fs.ensureDir(dirPath);
            
            try {
                const files = await fs.readdir(dirPath);
                
                // Log file sizes for videos and images
                if (dir === 'videos' || dir === 'images') {
                    for (const file of files) {
                        try {
                            const filePath = path.join(dirPath, file);
                            const stats = await fs.stat(filePath);
                            const sizeInfo = dir === 'videos' 
                                ? `${Math.round(stats.size / 1024 / 1024 * 100) / 100} MB`
                                : `${Math.round(stats.size / 1024)} KB`;
                        } catch (error) {
                        }
                    }
                }
            } catch (error) {
                console.log(`🔍 [DEBUG] Could not read ${dir} directory:`, error.message);
            }
        }
    }

    async handleMessage(sock, message) {
        try {
            const startTime = Date.now();

            // Extract message info
            const contactId = message.key.remoteJid;
            const messageId = message.key.id;
            const isGroup = contactId.includes('@g.us');

            console.log(`🔍 [DEBUG] Message details:`, {
                contactId,
                messageId,
                isGroup,
                messageType: message.messageType
            });

            if (isGroup) {
                console.log(`🔍 [DEBUG] Skipping group message`);
                return; // Skip group messages
            }

            // Get contact info
            const phoneNumber = contactId.replace('@s.whatsapp.net', '');
            let contactName = 'Unknown';

            try {
                const contact = await sock.onWhatsApp(phoneNumber);
                if (contact && contact[0] && contact[0].name) {
                    contactName = contact[0].name;
                }
                console.log(`🔍 [DEBUG] Contact info: ${contactName} (${phoneNumber})`);
            } catch (error) {
                console.log('🔍 [DEBUG] Could not fetch contact name:', error.message);
            }

            // Process message content
            const messageContent = this.extractMessageContent(message);
            console.log(`🔍 [DEBUG] Extracted message content:`, messageContent);

            // Always store all messages in the data store
            this.dataStore.addMessage({
                id: messageId,
                contactId,
                contactName,
                phone: phoneNumber,
                text: messageContent.text,
                mediaType: messageContent.mediaType,
                fromBot: false,
                isGroup,
                messageType: message.messageType || 'text'
            });

            // Update contact info
            this.dataStore.updateContact(contactId, {
                name: contactName,
                phone: phoneNumber,
                lastMessage: Date.now()
            });

            console.log(`📨 Message from ${contactName} (${phoneNumber}): ${messageContent.text || '[Media]'}`);

            // Only process the message if it's a trigger phrase
            const isTrigger = this.isTriggerPhrase(messageContent.text) || this.isFlexibleMatch(messageContent.text);
            if (isTrigger) {
                await this.processMessage(sock, contactId, contactName, messageContent, startTime);
            } else {
                console.log(`ℹ️ Non-trigger message received, not processing further`);
            }

        } catch (error) {
            console.error('🔍 [DEBUG] Error handling message:', error);
            console.error('🔍 [DEBUG] Error stack:', error.stack);
        }
    }

    extractMessageContent(message) {
        let text = '';
        let mediaType = null;

        console.log(`🔍 [DEBUG] Extracting content from message type:`, message.messageType);
        
        if (message.message) {
            console.log(`🔍 [DEBUG] Message object keys:`, Object.keys(message.message));
            
            if (message.message.conversation) {
                text = message.message.conversation;
                console.log(`🔍 [DEBUG] Found conversation text: "${text}"`);
            } else if (message.message.extendedTextMessage) {
                text = message.message.extendedTextMessage.text;
                console.log(`🔍 [DEBUG] Found extended text: "${text}"`);
            } else if (message.message.imageMessage) {
                text = message.message.imageMessage.caption || '';
                mediaType = 'image';
                console.log(`🔍 [DEBUG] Found image message with caption: "${text}"`);
            } else if (message.message.videoMessage) {
                text = message.message.videoMessage.caption || '';
                mediaType = 'video';
                console.log(`🔍 [DEBUG] Found video message with caption: "${text}"`);
            } else if (message.message.audioMessage) {
                mediaType = 'audio';
                console.log(`🔍 [DEBUG] Found audio message`);
            } else if (message.message.documentMessage) {
                text = message.message.documentMessage.caption || '';
                mediaType = 'document';
                console.log(`🔍 [DEBUG] Found document message with caption: "${text}"`);
            } else {
                console.log(`🔍 [DEBUG] Unknown message type, keys:`, Object.keys(message.message));
            }
        } else {
            console.log(`🔍 [DEBUG] No message content found`);
        }

        return { text: text.trim(), mediaType };
    }

    async processMessage(sock, contactId, contactName, messageContent, startTime) {
        const userState = this.userStates.get(contactId) || { stage: 'initial' };
        const messageText = messageContent.text.toLowerCase();

        console.log(`🔍 [DEBUG] Processing message for ${contactName}:`);
        console.log(`🔍 [DEBUG] - User state:`, userState);
        console.log(`🔍 [DEBUG] - Message text: "${messageText}"`);
        console.log(`🔍 [DEBUG] - Language timers active:`, Array.from(this.languageTimers.keys()));
        console.log(`🔍 [DEBUG] - Demo timers active:`, Array.from(this.demoTimers.keys()));

        // Check for trigger phrases
        if (this.isTriggerPhrase(messageText)) {
            console.log(`🔍 [DEBUG] 🎯 TRIGGER PHRASE DETECTED!`);
            await this.handleTriggerPhrase(sock, contactId, contactName);
            return;
        }

        // Handle based on current stage
        switch (userState.stage) {
            case 'waiting_language':
                console.log(`🔍 [DEBUG] User is in waiting_language stage`);
                await this.handleLanguageSelection(sock, contactId, contactName, messageText, startTime);
                break;

            case 'waiting_demo':
                console.log(`🔍 [DEBUG] User is in waiting_demo stage`);
                await this.handleDemoSelection(sock, contactId, contactName, messageText, userState.language, startTime);
                break;

            default:
                console.log(`🔍 [DEBUG] User is in default stage, checking for language/demo choices`);
                // Check if it's a language or demo response without being in the right stage
                const languageChoice = this.detectLanguageChoice(messageText);
                const demoChoice = this.detectDemoChoice(messageText);

                console.log(`🔍 [DEBUG] Language choice detected: ${languageChoice}`);
                console.log(`🔍 [DEBUG] Demo choice detected: ${demoChoice}`);

                const contactKey = contactId.replace('@s.whatsapp.net', '');
                
                if (languageChoice && this.languageTimers.has(contactKey)) {
                    console.log(`🔍 [DEBUG] Processing language selection outside of state`);
                    await this.handleLanguageSelection(sock, contactId, contactName, messageText, startTime);
                } else if (demoChoice && this.demoTimers.has(contactKey)) {
                    console.log(`🔍 [DEBUG] Processing demo selection outside of state`);
                    const timerData = this.demoTimers.get(contactKey);
                    await this.handleDemoSelection(sock, contactId, contactName, messageText, timerData.language, startTime);
                } else {
                    console.log(`🔍 [DEBUG] ⏭️ Ignoring message from ${contactName}: "${messageContent.text}"`);
                    console.log(`🔍 [DEBUG] - No trigger phrase match`);
                    console.log(`🔍 [DEBUG] - No language timer active`);
                    console.log(`🔍 [DEBUG] - No demo timer active`);
                }
                break;
        }
    }

    isTriggerPhrase(messageText) {
        const isExact = this.config.TRIGGER_PHRASES.some(phrase => messageText === phrase);
        const isFlexible = this.isFlexibleMatch(messageText);
        
        console.log(`🔍 [DEBUG] Checking trigger phrase: "${messageText}"`);
        console.log(`🔍 [DEBUG] - Exact match: ${isExact}`);
        console.log(`🔍 [DEBUG] - Flexible match: ${isFlexible}`);
        
        if (isExact) {
            console.log(`🔍 [DEBUG] - Matched exact phrase: "${messageText}"`);
        }
        
        return isExact || isFlexible;
    }

    isFlexibleMatch(messageText) {
        const triggerKeywords = ['hello', 'info', 'more info', 'information', 'details', 'tell me', 'about', 'student ai'];
        const actionWords = ['can', 'get', 'want', 'need', 'give', 'send', 'share', 'show', 'provide', 'tell'];

        const hasKeyword = triggerKeywords.some(keyword => messageText.includes(keyword));
        const hasAction = actionWords.some(action => messageText.includes(action));

        console.log(`🔍 [DEBUG] Flexible match check for: "${messageText}"`);
        console.log(`🔍 [DEBUG] - Has keyword: ${hasKeyword}`);
        console.log(`🔍 [DEBUG] - Has action: ${hasAction}`);
        
        if (hasKeyword) {
            const matchedKeywords = triggerKeywords.filter(keyword => messageText.includes(keyword));
            console.log(`🔍 [DEBUG] - Matched keywords: ${matchedKeywords.join(', ')}`);
        }
        
        if (hasAction) {
            const matchedActions = actionWords.filter(action => messageText.includes(action));
            console.log(`🔍 [DEBUG] - Matched actions: ${matchedActions.join(', ')}`);
        }
        
        return hasKeyword && hasAction;
    }

    async handleTriggerPhrase(sock, contactId, contactName) {
        console.log(`🎯 [DEBUG] Trigger phrase detected from ${contactName}`);

        this.userStates.set(contactId, { stage: 'waiting_language' });
        
        await this.sendLanguagePrompt(sock, contactId, contactName);
    }

    async sendLanguagePrompt(sock, contactId, contactName) {
        try {
            console.log(`🔍 [DEBUG] Sending language prompt to ${contactName}`);
            
            const welcomeMessage =
                `Welcome to Student AI – India's First AI-Powered E-Learning Platform! 🚀\n\n` +
                `Which Language do you speak - Hindi or English?\n\n` +
                `• For English : Type "1" or "English"\n` +
                `• For Hindi : Type "2" or "Hindi" \n\n` +
                `Or simply type "English" or "Hindi"`;

            console.log(`🔍 [DEBUG] Language prompt message prepared (${welcomeMessage.length} chars)`);
            
            // Try to send with logo image first
            const logoPath = path.join(this.mediaDir, 'images', 'newlogo.jpg');
            const logoExists = await fs.pathExists(logoPath);
            
            console.log(`🔍 [DEBUG] Looking for logo at: ${logoPath}`);
            console.log(`🔍 [DEBUG] Logo exists: ${logoExists}`);
            
            let success = false;
            if (logoExists) {
                console.log(`🔍 [DEBUG] Attempting to send language prompt with logo...`);
                success = await this.sendImage(sock, contactId, logoPath, welcomeMessage);
                console.log(`🔍 [DEBUG] Language prompt with logo sent: ${success}`);
            } else {
                console.log(`🔍 [DEBUG] Logo not found, sending text only...`);
                success = await this.sendMessage(sock, contactId, welcomeMessage);
                console.log(`🔍 [DEBUG] Language prompt text sent: ${success}`);
            }

            if (!success) {
                console.error(`🔍 [DEBUG] ❌ Failed to send language prompt to ${contactName}`);
                return;
            }

            // Set language selection timer
            const contactKey = contactId.replace('@s.whatsapp.net', '');
            this.languageTimers.set(contactKey, {
                contactName,
                timestamp: Date.now()
            });
            
            console.log(`🔍 [DEBUG] Set language timer for contact: ${contactKey}`);
            console.log(`🔍 [DEBUG] Active language timers: ${this.languageTimers.size}`);

            // Set timeout for reminder
            setTimeout(async () => {
                if (this.languageTimers.has(contactKey)) {
                    console.log(`🔍 [DEBUG] ⏰ Sending language reminder to ${contactName} (30s timeout)`);
                    const reminderMessage =
                        `I am still waiting for your reply for preferred language.\n\n` +
                        `• Type "1" or "English" for English\n` +
                        `• Type "2" or "Hindi" for हिंदी\n\n` +
                        `Or simply type "English" or "Hindi"`;

                    const reminderSuccess = await this.sendMessage(sock, contactId, reminderMessage);
                    console.log(`🔍 [DEBUG] Language reminder sent: ${reminderSuccess}`);
                    
                    this.languageTimers.delete(contactKey);
                    console.log(`🔍 [DEBUG] Language timer cleared for ${contactName} (timeout)`);
                }
            }, this.config.LANGUAGE_TIMEOUT);

        } catch (error) {
            console.error(`🔍 [DEBUG] ❌ Error sending language prompt to ${contactName}:`, error);
            console.error(`🔍 [DEBUG] Error stack:`, error.stack);
        }
    }

    async handleLanguageSelection(sock, contactId, contactName, messageText, startTime) {
        console.log(`🔍 [DEBUG] ==================== LANGUAGE SELECTION ====================`);
        const languageChoice = this.detectLanguageChoice(messageText);
        console.log(`🔍 [DEBUG] Handling language selection: "${messageText}" -> ${languageChoice}`);

        if (languageChoice) {
            const contactKey = contactId.replace('@s.whatsapp.net', '');
            this.languageTimers.delete(contactKey);

            const language = languageChoice === 'en' ? 'English' : 'Hindi';
            console.log(`🌍 [DEBUG] ✅ ${contactName} selected ${language}`);

            // Update contact and user state
            this.dataStore.updateContact(contactId, { language: languageChoice });
            this.userStates.set(contactId, {
                stage: 'viewing_content',
                language: languageChoice
            });

            console.log(`🔍 [DEBUG] Updated user state for ${contactName}:`, this.userStates.get(contactId));
            console.log(`🔍 [DEBUG] Updated contact language in database: ${languageChoice}`);

            await this.sendContentWithVideo(sock, contactId, contactName, languageChoice, startTime);
        } else {
            console.log(`🔍 [DEBUG] ❌ No valid language choice detected from: "${messageText}"`);
            console.log(`🔍 [DEBUG] User needs to send valid language choice`);
        }
    }

    async sendContentWithVideo(sock, contactId, contactName, language, startTime) {
        try {
            console.log(`🔍 [DEBUG] ==================== CONTENT WITH VIDEO ====================`);
            console.log(`🔍 [DEBUG] Sending content with video to ${contactName} in ${language}`);
            
            let description = '';
            let videoFileName = '';
    
            if (language === 'en') {
                description = `FREE FOR STUDENTS WITH UNLIMITED AI 
    
    ✅Visit: https://thestudentai.in/
    ✅From your mobile 
    ✅Click on FREE PLAN,
    ✅Sign in with GMAIL
    
    Our Student AI helps 4th-12th class students with:
    
    ✅ Daily homework assistance
    ✅ Concept clarifications  
    ✅ Covers all school subjects
    
    Our team is ready to help you: SOWMYA - 8247765806
    
    Thanks, Student AI Team`;
    
                videoFileName = 'English Version _ Intro.mp4';
                console.log(`🔍 [DEBUG] Selected English video: ${videoFileName}`);
            } else {
                description = `छात्रों के लिए मुफ्त | अनलिमिटेड AI | लाइफटाइम
    
    ✅Visit: https://thestudentai.in/
    ✅अपने मोबाइल से, 
    ✅FREE PLAN पर क्लिक करें,
    ✅GMAIL से साइन इन करें
    
    नमस्ते! हमारा Student AI 4वीं-12वीं कक्षा के छात्रों की मदद करता है:
    
    ✅ रोजाना होमवर्क में सहायता
    ✅ कॉन्सेप्ट की स्पष्टता  
    ✅ सभी स्कूली विषयों को कवर करता है
    
    हमारी टीम आपकी मदद के लिए तैयार है: SOWMYA - 8247765806
    
    Thanks, Student AI Team`;
    
                videoFileName = 'First Day_Followup_Riya_Hindi Version.mp4';
                console.log(`🔍 [DEBUG] Selected Hindi video: ${videoFileName}`);
            }
    
            console.log(`🔍 [DEBUG] Video filename: ${videoFileName}`);
            console.log(`🔍 [DEBUG] Description length: ${description.length} characters`);
    
            const fullMessage = description + this.config.FOOTER_MESSAGE;
            console.log(`🔍 [DEBUG] Full message length: ${fullMessage.length} characters`);
    
            // FIXED: Use the correct nested path - videos/video/
            const videoPath = path.join(this.mediaDir, 'videos', 'video', videoFileName);
            console.log(`🔍 [DEBUG] Looking for video at: ${videoPath}`);
    
            // Debug: List directory contents to verify the path
            try {
                const videosDir = path.join(this.mediaDir, 'videos');
                const videoVideoDir = path.join(this.mediaDir, 'videos', 'video');
                
                console.log(`🔍 [DEBUG] Checking videos directory: ${videosDir}`);
                if (await fs.pathExists(videosDir)) {
                    const videosContent = await fs.readdir(videosDir);
                    console.log(`🔍 [DEBUG] Contents of videos/ directory:`, videosContent);
                }
                
                console.log(`🔍 [DEBUG] Checking videos/video directory: ${videoVideoDir}`);
                if (await fs.pathExists(videoVideoDir)) {
                    const videoVideoContent = await fs.readdir(videoVideoDir);
                    console.log(`🔍 [DEBUG] Contents of videos/video/ directory:`, videoVideoContent);
                }
            } catch (dirError) {
                console.log(`🔍 [DEBUG] Error reading directories:`, dirError.message);
            }
    
            const videoExists = await fs.pathExists(videoPath);
            console.log(`🔍 [DEBUG] Video file exists: ${videoExists}`);
    
            let success = false;
            if (videoExists) {
                // Check file size
                try {
                    const stats = await fs.stat(videoPath);
                    const fileSizeMB = Math.round(stats.size / 1024 / 1024 * 100) / 100;
                    console.log(`🔍 [DEBUG] Video file size: ${fileSizeMB} MB`);
                    
                    if (stats.size > 16 * 1024 * 1024) {
                        console.error(`🔍 [DEBUG] ❌ Video too large: ${fileSizeMB} MB (max 16MB)`);
                        success = await this.sendMessage(sock, contactId, fullMessage);
                    } else {
                        console.log(`🔍 [DEBUG] Attempting to send video...`);
                        success = await this.sendVideo(sock, contactId, videoPath, fullMessage);
                    }
                } catch (error) {
                    console.log(`🔍 [DEBUG] Could not get video file stats:`, error.message);
                    success = await this.sendVideo(sock, contactId, videoPath, fullMessage);
                }
                
                console.log(`🔍 [DEBUG] Video send result: ${success}`);
            } else {
                console.log(`🔍 [DEBUG] Video file not found, sending text only`);
                success = await this.sendMessage(sock, contactId, fullMessage);
                console.log(`🔍 [DEBUG] Text message send result: ${success}`);
            }
    
            if (!success) {
                console.error(`🔍 [DEBUG] ❌ Failed to send content to ${contactName}`);
                return;
            }
    
            // Log the message
            this.dataStore.addMessage({
                contactId,
                contactName,
                text: `Video content sent (${language})`,
                mediaType: videoExists ? 'video' : 'text',
                fromBot: true,
                language,
                responseTime: Date.now() - startTime
            });
    
            console.log(`🔍 [DEBUG] ✅ Content sent successfully to ${contactName}`);
    
            // Schedule demo prompt
            console.log(`🔍 [DEBUG] ⏰ Scheduling demo prompt in ${this.config.DEMO_PROMPT_DELAY}ms (${this.config.DEMO_PROMPT_DELAY/1000}s)`);
            setTimeout(async () => {
                console.log(`🔍 [DEBUG] ⏰ Executing scheduled demo prompt for ${contactName}`);
                await this.sendDemoPrompt(sock, contactId, contactName, language);
            }, this.config.DEMO_PROMPT_DELAY);
    
        } catch (error) {
            console.error(`🔍 [DEBUG] ❌ Error sending content to ${contactName}:`, error);
            console.error(`🔍 [DEBUG] Error stack:`, error.stack);
        }
    }
    
   
    
    // ALSO FIX: Update ensureMediaDirectories method to handle nested structure
    async ensureMediaDirectories() {
        const dirs = ['images', 'videos', 'audio', 'documents'];
        console.log(`🔍 [DEBUG] Ensuring media directories exist...`);
        
        for (const dir of dirs) {
            const dirPath = path.join(this.mediaDir, dir);
            await fs.ensureDir(dirPath);
            
            // For videos, also ensure the nested 'video' directory
            if (dir === 'videos') {
                const nestedVideoDir = path.join(dirPath, 'video');
                await fs.ensureDir(nestedVideoDir);
                console.log(`🔍 [DEBUG] Ensured nested directory: ${nestedVideoDir}`);
            }
            
            // Check what files exist in each directory
            try {
                const files = await fs.readdir(dirPath);
                console.log(`🔍 [DEBUG] Files in ${dir} directory:`, files);
                
                // For videos, also check the nested directory
                if (dir === 'videos') {
                    const nestedVideoDir = path.join(dirPath, 'video');
                    if (await fs.pathExists(nestedVideoDir)) {
                        const nestedFiles = await fs.readdir(nestedVideoDir);
                        console.log(`🔍 [DEBUG] Files in ${dir}/video directory:`, nestedFiles);
                        
                        // Log file sizes for videos in nested directory
                        for (const file of nestedFiles) {
                            try {
                                const filePath = path.join(nestedVideoDir, file);
                                const stats = await fs.stat(filePath);
                                const sizeInfo = `${Math.round(stats.size / 1024 / 1024 * 100) / 100} MB`;
                                console.log(`🔍 [DEBUG] - ${file}: ${sizeInfo}`);
                            } catch (error) {
                                console.log(`🔍 [DEBUG] - ${file}: Could not get size`);
                            }
                        }
                    }
                }
                
                // Log file sizes for videos and images in main directory
                if ((dir === 'videos' || dir === 'images') && files.length > 0) {
                    for (const file of files) {
                        try {
                            const filePath = path.join(dirPath, file);
                            const stats = await fs.stat(filePath);
                            const sizeInfo = dir === 'videos' 
                                ? `${Math.round(stats.size / 1024 / 1024 * 100) / 100} MB`
                                : `${Math.round(stats.size / 1024)} KB`;
                            console.log(`🔍 [DEBUG] - ${file}: ${sizeInfo}`);
                        } catch (error) {
                            console.log(`🔍 [DEBUG] - ${file}: Could not get size`);
                        }
                    }
                }
            } catch (error) {
                console.log(`🔍 [DEBUG] Could not read ${dir} directory:`, error.message);
            }
        }
    }

    async sendDemoPrompt(sock, contactId, contactName, language) {
        try {
            console.log(`🔍 [DEBUG] ==================== DEMO PROMPT ====================`);
            console.log(`🔍 [DEBUG] Sending demo prompt to ${contactName} in ${language}`);
            
            let demoMessage = '';

            if (language === 'en') {
                demoMessage = `Do you want to see a demo? 🎥\n\n` +
                    `• Type "Yes" to see a demo video\n` +
                    `• Type "No" for website details and contact info\n\n` +
                    `Or simply type "Yes" or "No"`;
            } else {
                demoMessage = `क्या आप डेमो देखना चाहते हैं? 🎥\n\n` +
                    `• "Yes" टाइप करें डेमो वीडियो देखने के लिए\n` +
                    `• "No" टाइप करें वेबसाइट डिटेल्स और संपर्क जानकारी के लिए\n\n` +
                    `या सिर्फ "Yes" या "No" टाइप करें`;
            }

            console.log(`🔍 [DEBUG] Demo prompt message prepared (${demoMessage.length} chars)`);

            const success = await this.sendMessage(sock, contactId, demoMessage);
            console.log(`🔍 [DEBUG] Demo prompt sent successfully: ${success}`);
            
            if (!success) {
                console.error(`🔍 [DEBUG] ❌ Failed to send demo prompt to ${contactName}`);
                return;
            }

            // Update user state and set timer
            this.userStates.set(contactId, {
                stage: 'waiting_demo',
                language
            });

            const contactKey = contactId.replace('@s.whatsapp.net', '');
            this.demoTimers.set(contactKey, {
                contactName,
                language,
                timestamp: Date.now()
            });

            console.log(`🔍 [DEBUG] Set demo timer for contact: ${contactKey}`);
            console.log(`🔍 [DEBUG] Updated user state to waiting_demo for ${contactName}`);
            console.log(`🔍 [DEBUG] Active demo timers: ${this.demoTimers.size}`);

            // Set timeout for reminder
            setTimeout(async () => {
                if (this.demoTimers.has(contactKey)) {
                    console.log(`🔍 [DEBUG] ⏰ Sending demo reminder to ${contactName} (30s timeout)`);
                    const reminderMessage = language === 'en'
                        ? `I am still waiting for your reply about the demo.\n\n` +
                        `• Type "Yes" to see a demo video\n` +
                        `• Type "No" for website details and contact info`
                        : `मैं अभी भी डेमो के बारे में आपके जवाब का इंतज़ार कर रहा हूँ।\n\n` +
                        `• "Yes" टाइप करें डेमो वीडियो देखने के लिए\n` +
                        `• "No" टाइप करें वेबसाइट डिटेल्स के लिए`;

                    const reminderSuccess = await this.sendMessage(sock, contactId, reminderMessage);
                    console.log(`🔍 [DEBUG] Demo reminder sent: ${reminderSuccess}`);
                    
                    this.demoTimers.delete(contactKey);
                    console.log(`🔍 [DEBUG] Demo timer cleared for ${contactName} (timeout)`);
                }
            }, this.config.DEMO_TIMEOUT);

        } catch (error) {
            console.error(`🔍 [DEBUG] ❌ Error sending demo prompt to ${contactName}:`, error);
            console.error(`🔍 [DEBUG] Error stack:`, error.stack);
        }
    }

    async handleDemoSelection(sock, contactId, contactName, messageText, language, startTime) {
        console.log(`🔍 [DEBUG] ==================== DEMO SELECTION ====================`);
        const demoChoice = this.detectDemoChoice(messageText);
        console.log(`🔍 [DEBUG] Handling demo selection: "${messageText}" -> ${demoChoice}`);

        if (demoChoice) {
            const contactKey = contactId.replace('@s.whatsapp.net', '');
            this.demoTimers.delete(contactKey);
            this.userStates.set(contactId, {
                stage: 'completed',
                language
            });

            console.log(`🔍 [DEBUG] Updated user state to completed for ${contactName}`);
            console.log(`🔍 [DEBUG] Demo timer cleared for ${contactName}`);

            if (demoChoice === 'yes') {
                console.log(`✅ [DEBUG] ${contactName} wants to see demo`);
                this.dataStore.updateContact(contactId, { demoRequested: true });
                await this.sendDemoVideo(sock, contactId, contactName, language, startTime);
            } else {
                console.log(`❌ [DEBUG] ${contactName} doesn't want demo`);
                this.dataStore.updateContact(contactId, { contactInfoShared: true });
                await this.sendWebsiteDetails(sock, contactId, contactName, language, startTime);
            }
        } else {
            console.log(`🔍 [DEBUG] ❌ No valid demo choice detected from: "${messageText}"`);
            console.log(`🔍 [DEBUG] User needs to send "Yes" or "No"`);
        }
    }

    // ALSO FIX: Update sendDemoVideo method with correct path
    async sendDemoVideo(sock, contactId, contactName, language, startTime) {
        try {
            console.log(`🔍 [DEBUG] ==================== DEMO VIDEO ====================`);
            console.log(`🔍 [DEBUG] Sending demo video to ${contactName} in ${language}`);
            
            let description = '';
    
            if (language === 'en') {
                description = `🎥 Here's your demo of Student AI!\n\n` +
                    `See how our AI helps students with:\n` +
                    `✅ Homework solutions\n` +
                    `✅ Concept explanations\n` +
                    `✅ Step-by-step learning\n` +
                    `✅ All subjects covered\n\n` +
                    `Ready to get started? Visit: https://thestudentai.in/\n` +
                    `Contact our team: SOWMYA - 8247765806`;
            } else {
                description = `🎥 यहाँ है Student AI का डेमो!\n\n` +
                    `देखें कैसे हमारा AI छात्रों की मदद करता है:\n` +
                    `✅ होमवर्क सॉल्यूशन\n` +
                    `✅ कॉन्सेप्ट एक्सप्लेनेशन\n` +
                    `✅ स्टेप-बाई-स्टेप लर्निंग\n` +
                    `✅ सभी विषय कवर\n\n` +
                    `शुरू करने के लिए तैयार? Visit: https://thestudentai.in/\n` +
                    `हमारी टीम से संपर्क करें: SOWMYA - 8247765806`;
            }
    
            const fullMessage = description + this.config.FOOTER_MESSAGE;
            console.log(`🔍 [DEBUG] Demo description length: ${description.length} characters`);
            console.log(`🔍 [DEBUG] Demo full message length: ${fullMessage.length} characters`);
    
            // FIXED: Use the correct nested path for demo video too
            const videoPath = path.join(this.mediaDir, 'videos', 'video', 'DemoVideo.mp4');
            console.log(`🔍 [DEBUG] Looking for demo video at: ${videoPath}`);
    
            const videoExists = await fs.pathExists(videoPath);
            console.log(`🔍 [DEBUG] Demo video file exists: ${videoExists}`);
    
            let success = false;
            if (videoExists) {
                // Check file size
                try {
                    const stats = await fs.stat(videoPath);
                    const fileSizeMB = Math.round(stats.size / 1024 / 1024 * 100) / 100;
                    console.log(`🔍 [DEBUG] Demo video file size: ${fileSizeMB} MB`);
                    
                    if (stats.size > 16 * 1024 * 1024) {
                        console.error(`🔍 [DEBUG] ❌ Demo video too large: ${fileSizeMB} MB (max 16MB)`);
                        success = await this.sendMessage(sock, contactId, fullMessage);
                    } else {
                        console.log(`🔍 [DEBUG] Attempting to send demo video...`);
                        success = await this.sendVideo(sock, contactId, videoPath, fullMessage);
                    }
                } catch (error) {
                    console.log(`🔍 [DEBUG] Could not get demo video file stats:`, error.message);
                    success = await this.sendVideo(sock, contactId, videoPath, fullMessage);
                }
                
                console.log(`🔍 [DEBUG] Demo video send result: ${success}`);
            } else {
                console.log(`🔍 [DEBUG] Demo video file not found, sending text only`);
                success = await this.sendMessage(sock, contactId, fullMessage);
                console.log(`🔍 [DEBUG] Demo text message send result: ${success}`);
            }
    
            if (!success) {
                console.error(`🔍 [DEBUG] ❌ Failed to send demo video to ${contactName}`);
                return;
            }
    
            // Log the message
            this.dataStore.addMessage({
                contactId,
                contactName,
                text: `Demo video sent (${language})`,
                mediaType: videoExists ? 'video' : 'text',
                fromBot: true,
                language,
                responseTime: Date.now() - startTime
            });
    
            console.log(`🔍 [DEBUG] ✅ Demo video sent successfully to ${contactName}`);
    
        } catch (error) {
            console.error(`🔍 [DEBUG] ❌ Error sending demo video to ${contactName}:`, error);
            console.error(`🔍 [DEBUG] Error stack:`, error.stack);
        }
    }
    
    // Fix 2: Improve contact name resolution
    async handleMessage(sock, message) {
        try {
            const startTime = Date.now();
            console.log(`🔍 [DEBUG] ==================== NEW MESSAGE ====================`);
            console.log(`🔍 [DEBUG] Handling new message at ${new Date().toISOString()}`);
    
            // Extract message info
            const contactId = message.key.remoteJid;
            const messageId = message.key.id;
            const isGroup = contactId.includes('@g.us');
    
            console.log(`🔍 [DEBUG] Message details:`, {
                contactId,
                messageId,
                isGroup,
                messageType: message.messageType
            });
    
            if (isGroup) {
                console.log(`🔍 [DEBUG] Skipping group message`);
                return; // Skip group messages
            }
    
            // Get contact info with better fallback
            const phoneNumber = contactId.replace('@s.whatsapp.net', '');
            let contactName = phoneNumber; // Use phone number as fallback
    
            try {
                // Try to get contact name from WhatsApp
                const contact = await sock.onWhatsApp(phoneNumber);
                if (contact && contact[0] && contact[0].name) {
                    contactName = contact[0].name;
                    console.log(`🔍 [DEBUG] Contact name from WhatsApp: ${contactName}`);
                } else {
                    // Try to get from push name in message
                    if (message.pushName) {
                        contactName = message.pushName;
                        console.log(`🔍 [DEBUG] Contact name from push name: ${contactName}`);
                    } else {
                        // Check if we have saved contact info
                        const savedContact = this.dataStore.getContact(contactId);
                        if (savedContact && savedContact.name && savedContact.name !== 'Unknown') {
                            contactName = savedContact.name;
                            console.log(`🔍 [DEBUG] Contact name from saved data: ${contactName}`);
                        } else {
                            console.log(`🔍 [DEBUG] No contact name found, using phone number: ${phoneNumber}`);
                        }
                    }
                }
            } catch (error) {
                console.log('🔍 [DEBUG] Could not fetch contact name:', error.message);
                // Use phone number as fallback
                contactName = phoneNumber;
            }
    
            console.log(`🔍 [DEBUG] Final contact info: ${contactName} (${phoneNumber})`);
    
            // Process message content
            const messageContent = this.extractMessageContent(message);
            console.log(`🔍 [DEBUG] Extracted message content:`, messageContent);
    
            // Log incoming message
            this.dataStore.addMessage({
                id: messageId,
                contactId,
                contactName,
                phone: phoneNumber,
                text: messageContent.text,
                mediaType: messageContent.mediaType,
                fromBot: false,
                isGroup,
                messageType: message.messageType || 'text'
            });
    
            // Update contact info
            this.dataStore.updateContact(contactId, {
                name: contactName,
                phone: phoneNumber,
                lastMessage: Date.now()
            });
    
            console.log(`📨 Message from ${contactName} (${phoneNumber}): ${messageContent.text || '[Media]'}`);
    
            // Handle the message based on current state
            await this.processMessage(sock, contactId, contactName, messageContent, startTime);
    
        } catch (error) {
            console.error('🔍 [DEBUG] Error handling message:', error);
            console.error('🔍 [DEBUG] Error stack:', error.stack);
        }
    }
    
    // Fix 3: Better timer management in demo selection
    async handleDemoSelection(sock, contactId, contactName, messageText, language, startTime) {
        console.log(`🔍 [DEBUG] ==================== DEMO SELECTION ====================`);
        const demoChoice = this.detectDemoChoice(messageText);
        console.log(`🔍 [DEBUG] Handling demo selection: "${messageText}" -> ${demoChoice}`);
    
        if (demoChoice) {
            const contactKey = contactId.replace('@s.whatsapp.net', '');
            
            // Clear timer AFTER processing, not before
            console.log(`🔍 [DEBUG] Processing demo choice: ${demoChoice}`);
            
            // Update user state
            this.userStates.set(contactId, {
                stage: 'completed',
                language
            });
    
            console.log(`🔍 [DEBUG] Updated user state to completed for ${contactName}`);
    
            if (demoChoice === 'yes') {
                console.log(`✅ [DEBUG] ${contactName} wants to see demo`);
                this.dataStore.updateContact(contactId, { demoRequested: true });
                await this.sendDemoVideo(sock, contactId, contactName, language, startTime);
            } else {
                console.log(`❌ [DEBUG] ${contactName} doesn't want demo`);
                this.dataStore.updateContact(contactId, { contactInfoShared: true });
                await this.sendWebsiteDetails(sock, contactId, contactName, language, startTime);
            }
    
            // Clear timer AFTER successful processing
            this.demoTimers.delete(contactKey);
            console.log(`🔍 [DEBUG] Demo timer cleared for ${contactName} after processing`);
            
        } else {
            console.log(`🔍 [DEBUG] ❌ No valid demo choice detected from: "${messageText}"`);
            console.log(`🔍 [DEBUG] User needs to send "Yes" or "No"`);
        }
    }

    async sendWebsiteDetails(sock, contactId, contactName, language, startTime) {
        try {
            console.log(`🔍 [DEBUG] ==================== WEBSITE DETAILS ====================`);
            console.log(`🔍 [DEBUG] Sending website details to ${contactName} in ${language}`);
            
            const message = this.config.SPECIAL_FOOTER;
            console.log(`🔍 [DEBUG] Website details message length: ${message.length} characters`);

            // FIXED: Try to send with correct image filename
            const imagePath = path.join(this.mediaDir, 'images', 'IfSayNo.png');
            console.log(`🔍 [DEBUG] Looking for contact image at: ${imagePath}`);

            const imageExists = await fs.pathExists(imagePath);
            console.log(`🔍 [DEBUG] Contact image file exists: ${imageExists}`);

            let success = false;
            if (imageExists) {
                // Check file size
                try {
                    const stats = await fs.stat(imagePath);
                    const fileSizeKB = Math.round(stats.size / 1024);
                    console.log(`🔍 [DEBUG] Contact image file size: ${fileSizeKB} KB`);
                    
                    if (stats.size > 5 * 1024 * 1024) {
                        console.error(`🔍 [DEBUG] ❌ Contact image too large: ${fileSizeKB} KB (max 5MB)`);
                        success = await this.sendMessage(sock, contactId, message);
                    } else {
                        console.log(`🔍 [DEBUG] Attempting to send contact image...`);
                        success = await this.sendImage(sock, contactId, imagePath, message);
                    }
                } catch (error) {
                    console.log(`🔍 [DEBUG] Could not get contact image file stats:`, error.message);
                    success = await this.sendImage(sock, contactId, imagePath, message);
                }
                
                console.log(`🔍 [DEBUG] Contact image send result: ${success}`);
            } else {
                console.log(`🔍 [DEBUG] Contact image file not found, sending text only`);
                success = await this.sendMessage(sock, contactId, message);
                console.log(`🔍 [DEBUG] Contact text message send result: ${success}`);
            }

            if (!success) {
                console.error(`🔍 [DEBUG] ❌ Failed to send website details to ${contactName}`);
                return;
            }

            // Log the message
            this.dataStore.addMessage({
                contactId,
                contactName,
                text: 'Website details and contact info sent',
                mediaType: imageExists ? 'image' : 'text',
                fromBot: true,
                language,
                responseTime: Date.now() - startTime
            });

            console.log(`🔍 [DEBUG] ✅ Website details sent successfully to ${contactName}`);

        } catch (error) {
            console.error(`🔍 [DEBUG] ❌ Error sending website details to ${contactName}:`, error);
            console.error(`🔍 [DEBUG] Error stack:`, error.stack);
        }
    }

    detectLanguageChoice(messageText) {
        const input = messageText.toLowerCase().trim();
        console.log(`🔍 [DEBUG] ==================== LANGUAGE DETECTION ====================`);
        console.log(`🔍 [DEBUG] Detecting language choice from: "${input}"`);

        const englishKeywords = ['1', 'english', 'eng', 'english please', 'i want english', 'en', 'e'];
        const hindiKeywords = ['2', 'hindi', 'hin', 'hindi please', 'i want hindi', 'हिंदी', 'हिन्दी', 'hi', 'h'];

        const englishMatch = englishKeywords.some(keyword => input.includes(keyword));
        const hindiMatch = hindiKeywords.some(keyword => input.includes(keyword));

        console.log(`🔍 [DEBUG] Language detection results:`);
        console.log(`🔍 [DEBUG] - English match: ${englishMatch}`);
        console.log(`🔍 [DEBUG] - Hindi match: ${hindiMatch}`);

        if (englishMatch) {
            const matchedKeywords = englishKeywords.filter(keyword => input.includes(keyword));
            console.log(`🔍 [DEBUG] - Matched English keywords: ${matchedKeywords.join(', ')}`);
            console.log(`🔍 [DEBUG] ✅ Detected English language choice`);
            return 'en';
        }

        if (hindiMatch) {
            const matchedKeywords = hindiKeywords.filter(keyword => input.includes(keyword));
            console.log(`🔍 [DEBUG] - Matched Hindi keywords: ${matchedKeywords.join(', ')}`);
            console.log(`🔍 [DEBUG] ✅ Detected Hindi language choice`);
            return 'hi';
        }

        console.log(`🔍 [DEBUG] ❌ No language choice detected`);
        console.log(`🔍 [DEBUG] Valid options: ${[...englishKeywords, ...hindiKeywords].join(', ')}`);
        return null;
    }

    detectDemoChoice(messageText) {
        const input = messageText.toLowerCase().trim();
        console.log(`🔍 [DEBUG] ==================== DEMO CHOICE DETECTION ====================`);
        console.log(`🔍 [DEBUG] Detecting demo choice from: "${input}"`);

        const yesKeywords = [
            'yes', 'yeah', 'yep', 'yup', 'y', 'sure', 'ok', 'okay', 'interested',
            'want demo', 'show demo', 'demo please', 'i want demo', 'demo', 'see demo',
            'हाँ', 'हां', 'जी हाँ', 'जी हां', 'जी', 'video', 'show', 'watch',
            'play', 'start', 'go ahead', 'proceed', 'continue'
        ];

        const noKeywords = [
            'no', 'nope', 'nah', 'not interested', 'no demo', 'skip', 'no thanks',
            'not now', 'later', 'नहीं', 'ना', 'जी नहीं', 'contact', 'info', 'details',
            'website', 'direct', 'straight', 'information'
        ];

        const yesMatch = yesKeywords.some(keyword => input === keyword || input.includes(keyword));
        const noMatch = noKeywords.some(keyword => input === keyword || input.includes(keyword));

        console.log(`🔍 [DEBUG] Demo choice detection results:`);
        console.log(`🔍 [DEBUG] - Yes match: ${yesMatch}`);
        console.log(`🔍 [DEBUG] - No match: ${noMatch}`);

        if (yesMatch) {
            const matchedKeywords = yesKeywords.filter(keyword => input === keyword || input.includes(keyword));
            console.log(`🔍 [DEBUG] - Matched YES keywords: ${matchedKeywords.join(', ')}`);
            console.log(`🔍 [DEBUG] ✅ Detected YES demo choice`);
            return 'yes';
        }

        if (noMatch) {
            const matchedKeywords = noKeywords.filter(keyword => input === keyword || input.includes(keyword));
            console.log(`🔍 [DEBUG] - Matched NO keywords: ${matchedKeywords.join(', ')}`);
            console.log(`🔍 [DEBUG] ✅ Detected NO demo choice`);
            return 'no';
        }

        console.log(`🔍 [DEBUG] ❌ No demo choice detected`);
        console.log(`🔍 [DEBUG] Valid YES options: ${yesKeywords.slice(0, 10).join(', ')}...`);
        console.log(`🔍 [DEBUG] Valid NO options: ${noKeywords.slice(0, 10).join(', ')}...`);
        return null;
    }

    // Message sending methods
    async sendMessage(sock, contactId, text) {
        try {
            console.log(`🔍 [DEBUG] ==================== SENDING TEXT MESSAGE ====================`);
            console.log(`🔍 [DEBUG] Attempting to send text message to ${contactId}`);
            console.log(`🔍 [DEBUG] Message length: ${text.length} characters`);
            console.log(`🔍 [DEBUG] Message preview: "${text.substring(0, 150)}${text.length > 150 ? '...' : ''}"`);
            
            await sock.sendMessage(contactId, { text });
            console.log(`📤 [DEBUG] ✅ Successfully sent text message to ${contactId}`);
            return true;
        } catch (error) {
            console.error(`🔍 [DEBUG] ❌ Error sending text message to ${contactId}:`, error);
            console.error(`🔍 [DEBUG] Error details:`, {
                name: error.name,
                message: error.message,
                code: error.code
            });
            return false;
        }
    }

    async sendImage(sock, contactId, imagePath, caption = '') {
        try {
            console.log(`🔍 [DEBUG] ==================== SENDING IMAGE ====================`);
            console.log(`🔍 [DEBUG] Attempting to send image to ${contactId}`);
            console.log(`🔍 [DEBUG] Image path: ${imagePath}`);
            console.log(`🔍 [DEBUG] Caption length: ${caption.length} characters`);
            
            // Check if file exists first
            const exists = await fs.pathExists(imagePath);
            if (!exists) {
                console.error(`🔍 [DEBUG] ❌ Image file does not exist: ${imagePath}`);
                
                // List what files ARE in the images directory
                try {
                    const imagesDir = path.dirname(imagePath);
                    const files = await fs.readdir(imagesDir);
                    console.log(`🔍 [DEBUG] Available files in images directory:`, files);
                } catch (dirError) {
                    console.error(`🔍 [DEBUG] Could not read images directory:`, dirError.message);
                }
                
                // Send caption as text if image doesn't exist
                if (caption) {
                    console.log(`🔍 [DEBUG] Sending caption as text message instead...`);
                    return await this.sendMessage(sock, contactId, caption);
                }
                return false;
            }

            // Check file size and details
            const stats = await fs.stat(imagePath);
            const fileSizeKB = Math.round(stats.size / 1024);
            console.log(`🔍 [DEBUG] Image file details:`);
            console.log(`🔍 [DEBUG] - File size: ${fileSizeKB} KB`);
            console.log(`🔍 [DEBUG] - File exists: true`);

            if (stats.size > 5 * 1024 * 1024) { // 5MB limit
                console.error(`🔍 [DEBUG] ❌ Image file too large: ${fileSizeKB} KB (max 5MB)`);
                
                // Send caption as text if image is too large
                if (caption) {
                    console.log(`🔍 [DEBUG] Sending caption as text message instead...`);
                    return await this.sendMessage(sock, contactId, caption);
                }
                return false;
            }

            console.log(`🔍 [DEBUG] Reading image file...`);
            const imageBuffer = await fs.readFile(imagePath);
            console.log(`🔍 [DEBUG] Image buffer loaded: ${imageBuffer.length} bytes`);
            
            console.log(`🔍 [DEBUG] Sending image message...`);
            await sock.sendMessage(contactId, {
                image: imageBuffer,
                caption
            });
            console.log(`📤 [DEBUG] ✅ Successfully sent image to ${contactId}`);
            return true;
        } catch (error) {
            console.error(`🔍 [DEBUG] ❌ Error sending image to ${contactId}:`, error);
            console.error(`🔍 [DEBUG] Error details:`, {
                name: error.name,
                message: error.message,
                code: error.code
            });
            
            // Try sending as text if image fails
            console.log(`🔍 [DEBUG] Attempting to send caption as text message instead...`);
            if (caption) {
                return await this.sendMessage(sock, contactId, caption);
            }
            return false;
        }
    }

    async sendVideo(sock, contactId, videoPath, caption = '') {
        try {
            console.log(`🔍 [DEBUG] ==================== SENDING VIDEO ====================`);
            console.log(`🔍 [DEBUG] Attempting to send video to ${contactId}`);
            console.log(`🔍 [DEBUG] Video path: ${videoPath}`);
            console.log(`🔍 [DEBUG] Caption length: ${caption.length} characters`);
            
            // Check if file exists first
            const exists = await fs.pathExists(videoPath);
            if (!exists) {
                console.error(`🔍 [DEBUG] ❌ Video file does not exist: ${videoPath}`);
                
                // List what files ARE in the videos directory
                try {
                    const videosDir = path.dirname(videoPath);
                    const files = await fs.readdir(videosDir);
                    console.log(`🔍 [DEBUG] Available files in videos directory:`, files);
                } catch (dirError) {
                    console.error(`🔍 [DEBUG] Could not read videos directory:`, dirError.message);
                }
                
                // Send caption as text if video doesn't exist
                if (caption) {
                    console.log(`🔍 [DEBUG] Sending caption as text message instead...`);
                    return await this.sendMessage(sock, contactId, caption);
                }
                return false;
            }

            // Check file size and details
            const stats = await fs.stat(videoPath);
            const fileSizeMB = Math.round(stats.size / 1024 / 1024 * 100) / 100;
            console.log(`🔍 [DEBUG] Video file details:`);
            console.log(`🔍 [DEBUG] - File size: ${fileSizeMB} MB`);
            console.log(`🔍 [DEBUG] - File exists: true`);

            if (stats.size > 16 * 1024 * 1024) { // 16MB limit for WhatsApp
                console.error(`🔍 [DEBUG] ❌ Video file too large: ${fileSizeMB} MB (max 16MB)`);
                console.log(`🔍 [DEBUG] Sending caption as text message instead...`);
                if (caption) {
                    return await this.sendMessage(sock, contactId, caption);
                }
                return false;
            }

            console.log(`🔍 [DEBUG] Reading video file...`);
            const videoBuffer = await fs.readFile(videoPath);
            const bufferSizeMB = Math.round(videoBuffer.length / 1024 / 1024 * 100) / 100;
            console.log(`🔍 [DEBUG] Video buffer loaded: ${bufferSizeMB} MB`);
            
            console.log(`🔍 [DEBUG] Sending video message...`);
            await sock.sendMessage(contactId, {
                video: videoBuffer,
                caption
            });
            console.log(`📤 [DEBUG] ✅ Successfully sent video to ${contactId}`);
            return true;
        } catch (error) {
            console.error(`🔍 [DEBUG] ❌ Error sending video to ${contactId}:`, error);
            console.error(`🔍 [DEBUG] Error details:`, {
                name: error.name,
                message: error.message,
                code: error.code
            });
            
            // Try sending as text if video fails
            console.log(`🔍 [DEBUG] Attempting to send caption as text message instead...`);
            if (caption) {
                return await this.sendMessage(sock, contactId, caption);
            }
            return false;
        }
    }

    async sendAudio(sock, contactId, audioPath) {
        try {
            console.log(`🔍 [DEBUG] ==================== SENDING AUDIO ====================`);
            console.log(`🔍 [DEBUG] Attempting to send audio to ${contactId}`);
            console.log(`🔍 [DEBUG] Audio path: ${audioPath}`);
            
            // Check if file exists first
            const exists = await fs.pathExists(audioPath);
            if (!exists) {
                console.error(`🔍 [DEBUG] ❌ Audio file does not exist: ${audioPath}`);
                return false;
            }

            // Check file size
            const stats = await fs.stat(audioPath);
            const fileSizeMB = Math.round(stats.size / 1024 / 1024 * 100) / 100;
            console.log(`🔍 [DEBUG] Audio file size: ${fileSizeMB} MB`);

            const audioBuffer = await fs.readFile(audioPath);
            console.log(`🔍 [DEBUG] Audio buffer loaded: ${audioBuffer.length} bytes`);
            
            await sock.sendMessage(contactId, {
                audio: audioBuffer,
                mimetype: 'audio/mp4'
            });
            console.log(`📤 [DEBUG] ✅ Successfully sent audio to ${contactId}`);
            return true;
        } catch (error) {
            console.error(`🔍 [DEBUG] ❌ Error sending audio to ${contactId}:`, error);
            console.error(`🔍 [DEBUG] Error details:`, {
                name: error.name,
                message: error.message,
                code: error.code
            });
            return false;
        }
    }

    async broadcastMessage(sock, message, contacts, mediaPath = null) {
        console.log(`🔍 [DEBUG] ==================== BROADCAST MESSAGE ====================`);
        console.log(`🔍 [DEBUG] Starting broadcast to ${contacts.length} contacts`);
        const results = [];

        for (let i = 0; i < contacts.length; i++) {
            const contactId = contacts[i];
            try {
                console.log(`🔍 [DEBUG] Broadcasting to contact ${i + 1}/${contacts.length}: ${contactId}`);
                
                // Add delay between messages
                if (i > 0) {
                    console.log(`🔍 [DEBUG] Waiting ${this.config.MESSAGE_DELAY}ms before next message...`);
                    await new Promise(resolve => setTimeout(resolve, this.config.MESSAGE_DELAY));
                }

                let success = false;
                if (mediaPath) {
                    const ext = path.extname(mediaPath).toLowerCase();
                    console.log(`🔍 [DEBUG] Media file extension: ${ext}`);
                    
                    if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
                        success = await this.sendImage(sock, contactId, mediaPath, message);
                    } else if (['.mp4', '.avi', '.mov'].includes(ext)) {
                        success = await this.sendVideo(sock, contactId, mediaPath, message);
                    } else if (['.mp3', '.wav', '.aac'].includes(ext)) {
                        success = await this.sendAudio(sock, contactId, mediaPath);
                    } else {
                        console.log(`🔍 [DEBUG] Unknown media type, sending as text`);
                        success = await this.sendMessage(sock, contactId, message);
                    }
                } else {
                    success = await this.sendMessage(sock, contactId, message);
                }

                results.push({ contactId, success });
                console.log(`🔍 [DEBUG] ${success ? '✅' : '❌'} Broadcast to ${contactId}: ${success ? 'success' : 'failed'}`);
                
            } catch (error) {
                console.error(`🔍 [DEBUG] ❌ Error broadcasting to ${contactId}:`, error);
                results.push({ contactId, success: false, error: error.message });
            }
        }

        const successCount = results.filter(r => r.success).length;
        console.log(`🔍 [DEBUG] Broadcast completed. Success: ${successCount}/${results.length}`);
        console.log(`🔍 [DEBUG] Success rate: ${Math.round(successCount / results.length * 100)}%`);
        
        return results;
    }

    // Cleanup methods
    cleanup() {
        console.log(`🔍 [DEBUG] ==================== CLEANUP ====================`);
        console.log(`🔍 [DEBUG] Cleaning up MessageHandler...`);
        console.log(`🔍 [DEBUG] Current state before cleanup:`);
        console.log(`🔍 [DEBUG] - Language timers to clear: ${this.languageTimers.size}`);
        console.log(`🔍 [DEBUG] - Demo timers to clear: ${this.demoTimers.size}`);
        console.log(`🔍 [DEBUG] - User states to clear: ${this.userStates.size}`);
        
        // Log active timers before clearing
        if (this.languageTimers.size > 0) {
            console.log(`🔍 [DEBUG] Active language timers:`, Array.from(this.languageTimers.keys()));
        }
        if (this.demoTimers.size > 0) {
            console.log(`🔍 [DEBUG] Active demo timers:`, Array.from(this.demoTimers.keys()));
        }
        if (this.userStates.size > 0) {
            console.log(`🔍 [DEBUG] Active user states:`, Array.from(this.userStates.keys()));
        }
        
        this.languageTimers.clear();
        this.demoTimers.clear();
        this.userStates.clear();
        
        console.log(`🔍 [DEBUG] ✅ Cleanup completed`);
        console.log(`🔍 [DEBUG] Final state after cleanup:`);
        console.log(`🔍 [DEBUG] - Language timers: ${this.languageTimers.size}`);
        console.log(`🔍 [DEBUG] - Demo timers: ${this.demoTimers.size}`);
        console.log(`🔍 [DEBUG] - User states: ${this.userStates.size}`);
    }

    // Utility methods for debugging and monitoring
    getStats() {
        return {
            activeLanguageTimers: this.languageTimers.size,
            activeDemoTimers: this.demoTimers.size,
            activeUserStates: this.userStates.size,
            totalTriggerPhrases: this.config.TRIGGER_PHRASES.length,
            mediaDirectory: this.mediaDir
        };
    }

    // Method to manually clear timers for a specific contact (useful for testing)
    clearContactTimers(contactId) {
        const contactKey = contactId.replace('@s.whatsapp.net', '');
        const hadLanguageTimer = this.languageTimers.has(contactKey);
        const hadDemoTimer = this.demoTimers.has(contactKey);
        const hadUserState = this.userStates.has(contactId);
        
        this.languageTimers.delete(contactKey);
        this.demoTimers.delete(contactKey);
        this.userStates.delete(contactId);
        
        console.log(`🔍 [DEBUG] Cleared timers for ${contactKey}:`);
        console.log(`🔍 [DEBUG] - Language timer: ${hadLanguageTimer ? 'removed' : 'none'}`);
        console.log(`🔍 [DEBUG] - Demo timer: ${hadDemoTimer ? 'removed' : 'none'}`);
        console.log(`🔍 [DEBUG] - User state: ${hadUserState ? 'removed' : 'none'}`);
        
        return { hadLanguageTimer, hadDemoTimer, hadUserState };
    }

    // Method to get current user state (useful for debugging)
    getUserState(contactId) {
        return this.userStates.get(contactId) || { stage: 'initial' };
    }

    // Method to manually set user state (useful for testing)
    setUserState(contactId, state) {
        console.log(`🔍 [DEBUG] Manually setting user state for ${contactId}:`, state);
        this.userStates.set(contactId, state);
        return this.userStates.get(contactId);
    }
}

module.exports = MessageHandler;