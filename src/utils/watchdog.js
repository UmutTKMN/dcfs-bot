#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv-flow').config();

// Çevre değişkenlerinden okuma fonksiyonları
const getConfig = {
  number: (key, defaultValue) => {
    const value = parseInt(process.env[key], 10);
    return isNaN(value) ? defaultValue : value;
  },
  string: (key, defaultValue) => process.env[key] || defaultValue,
  boolean: (key, defaultValue) => {
    if (process.env[key] === undefined) return defaultValue;
    return process.env[key] === "true";
  }
};

// Yapılandırma
const CONFIG = {
  BOT_SCRIPT: getConfig.string('FS25_BOT_SCRIPT_PATH', './src/server.js'),
  CHECK_INTERVAL_MS: getConfig.number('FS25_BOT_WATCHDOG_CHECK_INTERVAL_MS', 60000), // Her dakika kontrol et
  RESTART_DELAY_MS: getConfig.number('FS25_BOT_WATCHDOG_RESTART_DELAY_MS', 5000),   // Yeniden başlatmadan önce 5 saniye bekle
  MAX_CRASHES: getConfig.number('FS25_BOT_WATCHDOG_MAX_CRASHES', 10),          // Vazgeçmeden önce maksimum çökme sayısı
  CRASH_RESET_TIME_MS: getConfig.number('FS25_BOT_WATCHDOG_CRASH_RESET_TIME_MS', 3600000), // 1 saat stabil çalıştıktan sonra çökme sayacını sıfırla
  LOG_DIR: getConfig.string('FS25_BOT_LOG_DIR', path.join(__dirname, 'watchdog')),
};

// Durum değişkenleri
let botProcess = null;
let crashes = 0;
let lastCrashTime = 0;
let lastStartTime = 0;

// Log dizini yoksa oluştur
if (!fs.existsSync(CONFIG.LOG_DIR)) {
  try {
    fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
  } catch (error) {
    console.error(`Log dizini oluşturulamadı: ${error.message}`);
    process.exit(1);
  }
}

// Log dosyasını oluştur
const logFile = path.join(CONFIG.LOG_DIR, `watchdog-${new Date().toISOString().replace(/:/g, '-')}.log`);
let logStream;

try {
  logStream = fs.createWriteStream(logFile, { flags: 'a' });
} catch (error) {
  console.error(`Log dosyası oluşturulamadı: ${error.message}`);
  process.exit(1);
}

// Zaman damgası ile log yazdırma
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  try { logStream.write(logMessage + '\n'); } catch {}
}

// Bot işlemini başlatma
function startBot() {
  if (botProcess) return;
  lastStartTime = Date.now();
  log('Bot işlemi başlatılıyor...');
  try {
    botProcess = spawn('node', [CONFIG.BOT_SCRIPT], { stdio: 'pipe', detached: false });
    botProcess.stdout.on('data', d => { process.stdout.write(d); try { logStream.write(d); } catch {} });
    botProcess.stderr.on('data', d => { process.stderr.write(d); try { logStream.write(d); } catch {} });
    botProcess.on('exit', (code, signal) => {
      const now = Date.now();
      log(`Bot işlemi ${code} kodu ve ${signal} sinyali ile sonlandı`);
      botProcess = null;
      if (now - lastStartTime > CONFIG.CRASH_RESET_TIME_MS) { log('Bot uzun süre stabil çalıştı. Çökme sayacı sıfırlanıyor.'); crashes = 0; }
      else { crashes++; lastCrashTime = now; log(`Çökme sayacı: ${crashes}/${CONFIG.MAX_CRASHES}`); }
      if (crashes < CONFIG.MAX_CRASHES) { log(`Yeniden başlatmadan önce ${CONFIG.RESTART_DELAY_MS}ms bekleniyor...`); setTimeout(startBot, CONFIG.RESTART_DELAY_MS); }
      else { log('Çok fazla çökme. Vazgeçiliyor. Lütfen loglarınızı kontrol edin ve manuel olarak yeniden başlatın.'); }
    });
  } catch (error) {
    log(`Bot başlatılırken hata oluştu: ${error.message}`);
    botProcess = null;
    setTimeout(startBot, CONFIG.RESTART_DELAY_MS);
  }
}

function checkBot() { if (!botProcess) { log('Bot işlemi bulunamadı. Başlatılıyor...'); startBot(); } }
const intervalId = setInterval(checkBot, CONFIG.CHECK_INTERVAL_MS);

process.on('exit', () => {
  log('Watchdog kapatılıyor...');
  clearInterval(intervalId);
  if (botProcess) { log('Bot işlemi sonlandırılıyor...'); botProcess.kill(); }
  try { logStream.end(); } catch {}
});
['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
  process.on(signal, () => { log(`${signal} sinyali alındı, kapatılıyor...`); process.exit(0); });
});
startBot();
log('Watchdog başarıyla başlatıldı. Durdurmak için Ctrl+C tuşlarına basın.');