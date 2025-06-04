const fs = require('fs-extra');
const path = require('path');
const moment = require('moment');

class Logger {
    constructor() {
        this.logDir = path.join(__dirname, '..', 'logs');
        this.logFile = path.join(this.logDir, `bot_${moment().format('YYYY-MM-DD')}.log`);
        this.errorFile = path.join(this.logDir, `errors_${moment().format('YYYY-MM-DD')}.log`);

        this.init();
    }

    async init() {
        try {
            await fs.ensureDir(this.logDir);
            await this.rotateLogFiles();
        } catch (error) {
            console.error('Logger init error:', error);
        }
    }

    async rotateLogFiles() {
        try {
            // Keep only last 7 days of logs
            const files = await fs.readdir(this.logDir);
            const cutoffDate = moment().subtract(7, 'days');

            for (const file of files) {
                const filePath = path.join(this.logDir, file);
                const stats = await fs.stat(filePath);

                if (moment(stats.mtime).isBefore(cutoffDate)) {
                    await fs.remove(filePath);
                    console.log(`🗑️ Removed old log file: ${file}`);
                }
            }
        } catch (error) {
            console.error('Log rotation error:', error);
        }
    }

    formatMessage(level, message, data = null) {
        const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            message,
            data,
            pid: process.pid
        };

        return JSON.stringify(logEntry);
    }

    async writeToFile(filePath, content) {
        try {
            await fs.appendFile(filePath, content + '\n');
        } catch (error) {
            console.error('Write to log file error:', error);
        }
    }

    info(message, data = null) {
        const logEntry = this.formatMessage('info', message, data);
        console.log(`ℹ️  ${message}`, data || '');
        this.writeToFile(this.logFile, logEntry);
    }

    success(message, data = null) {
        const logEntry = this.formatMessage('success', message, data);
        console.log(`✅ ${message}`, data || '');
        this.writeToFile(this.logFile, logEntry);
    }

    warn(message, data = null) {
        const logEntry = this.formatMessage('warn', message, data);
        console.warn(`⚠️  ${message}`, data || '');
        this.writeToFile(this.logFile, logEntry);
    }

    error(message, error = null) {
        const errorData = error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
        } : null;

        const logEntry = this.formatMessage('error', message, errorData);
        console.error(`❌ ${message}`, error || '');
        this.writeToFile(this.errorFile, logEntry);
    }

    debug(message, data = null) {
        if (process.env.NODE_ENV === 'development') {
            const logEntry = this.formatMessage('debug', message, data);
            console.log(`🐛 ${message}`, data || '');
            this.writeToFile(this.logFile, logEntry);
        }
    }

    async getLogs(level = null, limit = 100) {
        try {
            const logContent = await fs.readFile(this.logFile, 'utf8');
            const lines = logContent.split('\n').filter(line => line.trim());

            let logs = lines.map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            }).filter(log => log !== null);

            if (level) {
                logs = logs.filter(log => log.level.toLowerCase() === level.toLowerCase());
            }

            return logs.slice(-limit).reverse();
        } catch (error) {
            console.error('Get logs error:', error);
            return [];
        }
    }

    async getErrorLogs(limit = 50) {
        try {
            if (!(await fs.pathExists(this.errorFile))) {
                return [];
            }

            const errorContent = await fs.readFile(this.errorFile, 'utf8');
            const lines = errorContent.split('\n').filter(line => line.trim());

            const errors = lines.map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            }).filter(log => log !== null);

            return errors.slice(-limit).reverse();
        } catch (error) {
            console.error('Get error logs error:', error);
            return [];
        }
    }

    async clearLogs() {
        try {
            await fs.remove(this.logFile);
            await fs.remove(this.errorFile);
            this.success('Log files cleared');
        } catch (error) {
            console.error('Clear logs error:', error);
        }
    }

    async getLogStats() {
        try {
            const logs = await this.getLogs();
            const errors = await this.getErrorLogs();

            const stats = {
                total: logs.length,
                errors: errors.length,
                warnings: logs.filter(log => log.level === 'WARN').length,
                info: logs.filter(log => log.level === 'INFO').length,
                success: logs.filter(log => log.level === 'SUCCESS').length,
                debug: logs.filter(log => log.level === 'DEBUG').length
            };

            return stats;
        } catch (error) {
            console.error('Get log stats error:', error);
            return {
                total: 0,
                errors: 0,
                warnings: 0,
                info: 0,
                success: 0,
                debug: 0
            };
        }
    }
}

module.exports = Logger;