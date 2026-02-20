const fs = require('fs-extra');
const path = require('path');

class Logger {
  constructor(logDir = './logs') {
    this.logDir = logDir;
    this.logFile = path.join(logDir, `migration-${this.getTimestamp()}.log`);
    fs.ensureDirSync(logDir);
  }

  getTimestamp() {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
  }

  getFormattedTime() {
    return new Date().toISOString();
  }

  log(level, message, data = null) {
    const logEntry = {
      timestamp: this.getFormattedTime(),
      level,
      message,
      data
    };

    const logLine = `[${logEntry.timestamp}] [${level.toUpperCase()}] ${message}${data ? ' | ' + JSON.stringify(data) : ''}\n`;
    
    // Write to file
    fs.appendFileSync(this.logFile, logLine);
    
    // Console output with color
    const colors = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green
      warn: '\x1b[33m',    // Yellow
      error: '\x1b[31m',   // Red
      debug: '\x1b[90m'    // Gray
    };
    const reset = '\x1b[0m';
    const color = colors[level] || '';
    
    console.log(`${color}[${level.toUpperCase()}]${reset} ${message}`);
    if (data && level === 'debug') {
      console.log(data);
    }
  }

  info(message, data = null) {
    this.log('info', message, data);
  }

  success(message, data = null) {
    this.log('success', message, data);
  }

  warn(message, data = null) {
    this.log('warn', message, data);
  }

  error(message, data = null) {
    this.log('error', message, data);
  }

  debug(message, data = null) {
    this.log('debug', message, data);
  }
}

module.exports = Logger;
