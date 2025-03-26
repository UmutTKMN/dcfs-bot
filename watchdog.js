#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  BOT_SCRIPT: './src/server.js',
  CHECK_INTERVAL_MS: 60000, // Check every minute
  RESTART_DELAY_MS: 5000,   // Wait 5 seconds before restart
  MAX_CRASHES: 10,          // Maximum crashes before giving up
  CRASH_RESET_TIME_MS: 3600000, // Reset crash counter after 1 hour of stability
};

// State
let botProcess = null;
let crashes = 0;
let lastCrashTime = 0;
let lastStartTime = 0;

// Create log directory if it doesn't exist
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Setup log files
const logFile = path.join(logDir, `bot-${new Date().toISOString().replace(/:/g, '-')}.log`);
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// Helper to log with timestamp
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  logStream.write(logMessage + '\n');
}

// Start the bot process
function startBot() {
  if (botProcess) {
    return;
  }

  lastStartTime = Date.now();
  
  log('Starting bot process...');
  
  // Spawn bot process
  botProcess = spawn('node', [CONFIG.BOT_SCRIPT], {
    stdio: 'pipe',
    detached: false
  });

  // Pipe outputs
  botProcess.stdout.on('data', (data) => {
    process.stdout.write(data);
    logStream.write(data);
  });

  botProcess.stderr.on('data', (data) => {
    process.stderr.write(data);
    logStream.write(data);
  });

  // Handle process exit
  botProcess.on('exit', (code, signal) => {
    const now = Date.now();
    
    log(`Bot process exited with code ${code} and signal ${signal}`);
    botProcess = null;

    // If the process ran for at least CRASH_RESET_TIME_MS, reset crash counter
    if (now - lastStartTime > CONFIG.CRASH_RESET_TIME_MS) {
      log('Bot was stable for a good period. Resetting crash counter.');
      crashes = 0;
    } else {
      crashes++;
      lastCrashTime = now;
      log(`Crash counter: ${crashes}/${CONFIG.MAX_CRASHES}`);
    }

    // Check if we should restart
    if (crashes < CONFIG.MAX_CRASHES) {
      log(`Waiting ${CONFIG.RESTART_DELAY_MS}ms before restarting...`);
      setTimeout(startBot, CONFIG.RESTART_DELAY_MS);
    } else {
      log('Too many crashes. Giving up. Please check your logs and restart manually.');
    }
  });
}

// Check if the bot is running
function checkBot() {
  if (!botProcess) {
    log('Bot process not found. Starting...');
    startBot();
  }
}

// Setup interval to check if bot is running
const intervalId = setInterval(checkBot, CONFIG.CHECK_INTERVAL_MS);

// Handle watchdog process exit
process.on('exit', () => {
  log('Watchdog shutting down...');
  clearInterval(intervalId);
  
  if (botProcess) {
    log('Terminating bot process...');
    botProcess.kill();
  }
  
  logStream.end();
});

// Handle signals
['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
  process.on(signal, () => {
    log(`Received ${signal}, shutting down...`);
    process.exit(0);
  });
});

// Start the bot initially
startBot();

log('Watchdog started successfully. Press Ctrl+C to stop.'); 