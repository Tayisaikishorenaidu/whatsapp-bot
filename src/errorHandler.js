/**
 * Error handler for WhatsApp bot
 * Provides robust error handling and recovery mechanisms
 */

const fs = require('fs-extra');
const path = require('path');

// Directory for error logs
const ERROR_LOG_DIR = path.join(__dirname, '..', 'data', 'logs');
fs.ensureDirSync(ERROR_LOG_DIR);

/**
 * Log error to file with timestamp
 * @param {Error} error - The error object
 * @param {string} source - Source of the error (e.g., 'client', 'server')
 */
const logError = (error, source = 'unknown') => {
    const timestamp = new Date().toISOString();
    const logFile = path.join(ERROR_LOG_DIR, `error-${new Date().toISOString().split('T')[0]}.log`);
    
    const logEntry = `[${timestamp}] [${source}] ${error.message}\n${error.stack}\n\n`;
    
    fs.appendFileSync(logFile, logEntry);
    console.error(`❌ Error logged to ${logFile}`);
};

/**
 * Setup global error handlers
 */
const setupGlobalHandlers = () => {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        console.error('❌ UNCAUGHT EXCEPTION:', error.message);
        logError(error, 'uncaughtException');
        // Don't exit process to allow recovery
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
        console.error('❌ UNHANDLED REJECTION:', reason);
        logError(new Error(`Unhandled Rejection: ${reason}`), 'unhandledRejection');
        // Don't exit process to allow recovery
    });
    
    console.log('🛡️ Global error handlers configured');
};

/**
 * Setup WhatsApp client error handlers
 * @param {Object} client - WhatsApp client instance
 */
const setupClientHandlers = (client) => {
    // Handle Puppeteer browser errors
    client.pupBrowser?.on('error', (error) => {
        console.error('🌐 Browser error:', error.message);
        logError(error, 'browser');
    });
    
    // Handle disconnection
    client.on('disconnected', (reason) => {
        console.log('📴 Client disconnected:', reason);
        logError(new Error(`Client disconnected: ${reason}`), 'client');
    });
    
    console.log('🛡️ WhatsApp client error handlers configured');
};

module.exports = {
    logError,
    setupGlobalHandlers,
    setupClientHandlers
};
