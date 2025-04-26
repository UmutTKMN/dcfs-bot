#! /usr/bin/env node

const _ = require("lodash");
const merge = require("deepmerge");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const xml2js = require("xml2js");
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
} = require("discord.js");
const { onExit } = require("signal-exit");
require("dotenv-flow").config({
  silent: true,
});

// Modülleri içe aktar
const { 
  getDefaultDatabase, 
  formatMinutes, 
  getDataFromAPI, 
  parseData, 
  getModString, 
  fixColorCodes 
} = require("./utils/utils");
const { getNextPurge, willPurge, purgeOldMessages } = require("./utils/purge");
const { fetchUptimeData, updateUptimeData } = require("./utils/uptime");
const { 
  getUpdateString, 
  sendMessage, 
  sendServerStatusMessage 
} = require("./utils/messages");
const { scheduleDailyMessage, sendUptimeStats } = require("./utils/stats");

// Environment variables - Standardized names
const CONFIG = {
  DISCORD_TOKEN: process.env.FS25_BOT_DISCORD_TOKEN,
  SERVER_STATS_URL: process.env.FS25_BOT_URL_SERVER_STATS,
  CAREER_SAVEGAME_URL: process.env.FS25_BOT_URL_CAREER_SAVEGAME,
  UPTIME_FILE: process.env.FS25_BOT_UPTIME_FILE,
  DB_PATH: process.env.FS25_BOT_DB_PATH,
  DAILY_SUMMARY_CHANNEL_ID: process.env.FS25_BOT_DAILY_SUMMARY_CHANNEL_ID,
  UPDATE_CHANNEL_ID: process.env.FS25_BOT_UPDATE_CHANNEL_ID,
  DISCORD_SERVER_NAME: process.env.FS25_BOT_DISCORD_SERVER_NAME,
  DISCORD_CHANNEL_NAME: process.env.FS25_BOT_DISCORD_CHANNEL_NAME,
  POLL_INTERVAL_MINUTES: Math.max(
    parseInt(process.env.FS25_BOT_POLL_INTERVAL_MINUTES, 10) || 5,
    1
  ),
  UPTIME_UPDATE_INTERVAL: 10 * 60 * 1000, // 10 minutes in milliseconds
  DAILY_STATS_HOUR: parseInt(process.env.FS25_BOT_DAILY_STATS_HOUR, 10) || 17,
  DAILY_STATS_MINUTE:
    parseInt(process.env.FS25_BOT_DAILY_STATS_MINUTE, 10) || 0,
  DISABLE_SAVEGAME_MESSAGES:
    process.env.FS25_BOT_DISABLE_SAVEGAME_MESSAGES === "true",
  DISABLE_UNREACHABLE_FOUND_MESSAGES:
    process.env.FS25_BOT_DISABLE_UNREACHABLE_FOUND_MESSAGES === "true",
  PURGE_ON_STARTUP:
    process.env.FS25_BOT_PURGE_DISCORD_CHANNEL_ON_STARTUP === "true",
};

// State variables
let intervalTimer = null;
let db = getDefaultDatabase();
let nextPurge = 0;
let lastUptimeUpdateTime = Date.now();

// Reconnection handling constants
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 5000; // 5 seconds
let reconnectAttempts = 0;
let isReconnecting = false;

// Initialize Discord client with all necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

/**
 * MAIN UPDATE FUNCTIONS
 */

// Main update function - fetches data and updates Discord
const update = () => {
  console.log("Sunucu durumu kontrol ediliyor...");

  // Update uptime data at regular intervals
  const now = Date.now();
  if (now - lastUptimeUpdateTime >= CONFIG.UPTIME_UPDATE_INTERVAL) {
    updateUptimeData(CONFIG.UPTIME_FILE);
    lastUptimeUpdateTime = now;
  }

  getDataFromAPI(CONFIG.SERVER_STATS_URL, CONFIG.CAREER_SAVEGAME_URL)
    .then((rawData) => {
      // Renk kodu düzeltme işlemini uygula
      if (
        rawData &&
        rawData.serverData &&
        typeof rawData.serverData === "string"
      ) {
        rawData.serverData = fixColorCodes(rawData.serverData);
      }
      if (
        rawData &&
        rawData.careerSaveGameData &&
        typeof rawData.careerSaveGameData === "string"
      ) {
        rawData.careerSaveGameData = fixColorCodes(rawData.careerSaveGameData);
      }

      const previouslyUnreachable = db.server.unreachable;
      const previousServer = db.server;
      const previousMods = db.mods;
      const previousCareerSavegame = db.careerSavegame;

      const data = parseData(rawData, previousServer);

      // Sunucu erişilebilirlik durumu değiştiyse
      if (previouslyUnreachable && data) {
        if (!CONFIG.DISABLE_UNREACHABLE_FOUND_MESSAGES) {
          sendMessage("", client, CONFIG);
        }
        db.server.unreachable = false;
        fs.writeFileSync(CONFIG.DB_PATH, JSON.stringify(db, null, 2), "utf8");
      }

      // Sunucu durumu değiştiyse
      if (data) {
        const updateString = getUpdateString(
          data,
          previousServer,
          previousMods,
          previousCareerSavegame,
          CONFIG
        );

        // Sadece değişiklik varsa mesaj gönder
        if (updateString) {
          sendMessage(updateString, client, CONFIG);
        }

        // Sunucu çevrimiçi durumu değiştiyse
        if (data.server.online !== previousServer.online) {
          sendServerStatusMessage(
            data.server.online ? "online" : "offline",
            CONFIG.UPDATE_CHANNEL_ID,
            client
          );
        }

        // Veritabanını güncelle
        db = data;
        fs.writeFileSync(CONFIG.DB_PATH, JSON.stringify(db, null, 2), "utf8");

        // Bot durumunu güncelle
        client.user.setActivity("Farming Simulator 25");
        client.user.setStatus("online");
      } else {
        // Sunucu çevrimdışı durumu değiştiyse
        if (previousServer.online) {
          sendServerStatusMessage("offline", CONFIG.UPDATE_CHANNEL_ID, client);
        }

        db.server.online = false;
        db.server.unreachable = false;
        fs.writeFileSync(CONFIG.DB_PATH, JSON.stringify(db, null, 2), "utf8");

        // Bot durumunu güncelle
        client.user.setActivity("Sunucu erişilemez", { type: "WATCHING" });
        client.user.setStatus("dnd");
      }
    })
    .catch((e) => {
      console.error("❌ Sunucu verisi alınırken hata:", e.message);
      client.user.setActivity("Bakım Altında");

      // Sunucu erişilemez durumu değiştiyse
      if (!db.server.unreachable) {
        if (!CONFIG.DISABLE_UNREACHABLE_FOUND_MESSAGES) {
          sendMessage("", client, CONFIG);
        }
        db.server.unreachable = true;
        fs.writeFileSync(CONFIG.DB_PATH, JSON.stringify(db, null, 2), "utf8");
      }
    });

  // Mesaj temizleme kontrolü
  attemptPurge();
};

// Message purging functionality
const attemptPurge = () => {
  const now = new Date().getTime();
  if (willPurge() && now >= nextPurge) {
    nextPurge = getNextPurge();
    console.log("Temizlenecek mesajlar aranıyor...");
    try {
      purgeOldMessages(client);
    } catch (e) {
      console.error("❌ Mesajlar temizlenirken hata:", e.message);
    }
    console.log(`Sonraki temizleme ${new Date(nextPurge)} tarihinde olacak`);
  }
};

/**
 * CONNECTION MANAGEMENT FUNCTIONS
 */

// Setup and connect the Discord client with retry logic
const setupDiscordClient = async () => {
  try {
    console.log("Discord istemcisi ayarlanıyor...");

    // Login to Discord
    await client.login(CONFIG.DISCORD_TOKEN);
    console.log("✅ Discord'a bağlanıldı!");

    // Reset reconnection counter on successful connection
    reconnectAttempts = 0;
    isReconnecting = false;

    return true;
  } catch (err) {
    console.error("❌ Discord'a bağlanılamadı:", err.message);
    return false;
  }
};

// Add a reconnection handler
const handleReconnection = async () => {
  if (isReconnecting) return;

  isReconnecting = true;

  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts++;
    console.log(
      `Yeniden bağlanmaya çalışılıyor (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}), ${
        RECONNECT_DELAY / 1000
      } saniye içinde...`
    );

    setTimeout(async () => {
      const success = await setupDiscordClient();
      if (!success) {
        handleReconnection();
      }
    }, RECONNECT_DELAY);
  } else {
    console.error(
      `❌ Maksimum yeniden bağlanma denemesi (${MAX_RECONNECT_ATTEMPTS}) aşıldı. Lütfen bağlantınızı kontrol edin ve botu manuel olarak yeniden başlatın.`
    );
    isReconnecting = false;
  }
};

/**
 * HEARTBEAT MECHANISM
 */

const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes
let heartbeatTimer = null;

const startHeartbeat = () => {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  heartbeatTimer = setInterval(() => {
    console.log("💓 Bot kalp atışı - hala çalışıyor");

    // Check if client is connected and reconnect if needed
    if (!client.isReady()) {
      console.warn(
        "⚠️ Kalp atışı kontrolü sırasında Discord istemcisi hazır değil"
      );
      handleReconnection();
    }
  }, HEARTBEAT_INTERVAL);

  console.log(
    `✅ Kalp atışı başlatıldı, her ${
      HEARTBEAT_INTERVAL / 1000 / 60
    } dakikada bir kontrol ediliyor`
  );
};

/**
 * INITIALIZATION AND EVENT HANDLERS
 */

// Update the initialization code
const init = async () => {
  try {
    // Check for database directory
    const dbDir = path.dirname(CONFIG.DB_PATH);
    if (!fs.existsSync(dbDir)) {
      try {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`✅ Dizin oluşturuldu: ${dbDir}`);
      } catch (error) {
        console.error(`❌ ${dbDir} dizini oluşturulamadı:`, error.message);
      }
    }

    // Read database
    try {
      if (fs.existsSync(CONFIG.DB_PATH)) {
        const dbContent = fs.readFileSync(CONFIG.DB_PATH, "utf8");
        db = JSON.parse(dbContent);
        console.log("✅ Veritabanı yüklendi");
      }
    } catch (e) {
      console.error(`❌ Veritabanı okunamadı: ${CONFIG.DB_PATH}`, e.message);
      db = getDefaultDatabase();
    }

    // Setup Discord client with reconnection support
    const connected = await setupDiscordClient();
    if (!connected) {
      handleReconnection();
    }
  } catch (error) {
    console.error("❌ Başlatma hatası:", error.message);
    handleReconnection();
  }
};

// Discord ready event
client.on("ready", () => {
  console.log(`✅ Bot ${client.user.tag} olarak çalışıyor!`);

  // Setup message purging
  if (willPurge()) {
    if (CONFIG.PURGE_ON_STARTUP) {
      attemptPurge();
    } else {
      nextPurge = getNextPurge();
      console.log(
        `✅ İlk temizleme ${new Date(nextPurge)} tarihinde planlandı`
      );
    }
  }

  // Schedule daily stats message
  scheduleDailyMessage(
    CONFIG.DAILY_STATS_HOUR,
    CONFIG.DAILY_STATS_MINUTE,
    () => sendUptimeStats(CONFIG.UPTIME_FILE, client, CONFIG.DAILY_SUMMARY_CHANNEL_ID)
  );

  // Start update interval
  if (intervalTimer) {
    clearInterval(intervalTimer);
  }

  update(); // Initial update
  intervalTimer = setInterval(update, CONFIG.POLL_INTERVAL_MINUTES * 60000);

  startHeartbeat();
});

// Discord client event handlers
client.on("error", (error) => {
  console.error("❌ Discord istemci hatası:", error.message);
  handleReconnection();
});

client.on("disconnect", (event) => {
  console.error(
    `❌ Discord istemcisi ${event.code} koduyla bağlantısı kesildi. Sebep: ${event.reason}`
  );
  handleReconnection();
});

client.on("reconnecting", () => {
  console.log("⏳ Discord istemcisi yeniden bağlanıyor...");
});

client.on("warn", (info) => {
  console.warn("⚠️ Discord istemci uyarısı:", info);
});

// Process error handlers
process.on("SIGINT", async () => {
  console.log("SIGINT alındı. Bot kapatılıyor...");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM alındı. Bot kapatılıyor...");
  process.exit(0);
});

process.on("beforeExit", (code) => {
  console.log(`İşlem beforeExit olayı, kod: ${code}`);
});

// Improve the error handling
process.on("uncaughtException", (error) => {
  console.error("❌ Yakalanmayan Hata:", error);
  // Don't exit immediately on uncaught exception
  if (
    error.message.includes("ECONNRESET") ||
    error.message.includes("network") ||
    error.message.includes("connect")
  ) {
    handleReconnection();
  }
});

// Cleanup for the heartbeat timer
onExit(() => {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  console.log("Discord'dan çıkış yapılıyor...");
  client.destroy();
});

// Start the initialization process
init();
