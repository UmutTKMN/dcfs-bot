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

// Utilities
const {
  getDefaultDatabase,
  formatMinutes,
  getDataFromAPI,
  parseData,
  getModString,
  fixColorCodes,
} = require("./utils/utils");
const { getNextPurge, willPurge, purgeOldMessages } = require("./utils/purge");

// Environment variables - Standardized names
const CONFIG = {
  DISCORD_TOKEN: process.env.FS25_BOT_DISCORD_TOKEN,
  SERVER_STATS_URL: process.env.FS25_BOT_URL_SERVER_STATS,
  CAREER_SAVEGAME_URL: process.env.FS25_BOT_URL_CAREER_SAVEGAME,
  UPTIME_FILE: process.env.FS25_BOT_UPTIME_FILE,
  DB_PATH: process.env.FS25_BOT_DB_PATH,
  DAILY_SUMMARY_CHANNEL_ID: process.env.FS25_BOT_DAILY_SUMMARY_CHANNEL_ID || process.env.DAILY_SUMMARY_CHANNEL_ID,
  UPDATE_CHANNEL_ID: process.env.FS25_BOT_UPDATE_CHANNEL_ID || process.env.UPDATE_CHANNEL_ID,
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
  DISABLE_SAVEGAME_MESSAGES: process.env.FS25_BOT_DISABLE_SAVEGAME_MESSAGES === "true",
  DISABLE_UNREACHABLE_FOUND_MESSAGES: process.env.FS25_BOT_DISABLE_UNREACHABLE_FOUND_MESSAGES === "true",
  PURGE_ON_STARTUP: process.env.FS25_BOT_PURGE_DISCORD_CHANNEL_ON_STARTUP === "true",
  RATE_LIMIT_REQUESTS: parseInt(process.env.FS25_BOT_RATE_LIMIT_REQUESTS, 10) || 100,
  RATE_LIMIT_WINDOW: parseInt(process.env.FS25_BOT_RATE_LIMIT_WINDOW, 10) || 60000
};

// State variables
let intervalTimer = null;
let db = getDefaultDatabase();
let nextPurge = 0;
let lastUptimeUpdateTime = Date.now();

// Add these constants for reconnection handling
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

// Rate limiting için yeni değişkenler
const requestTimestamps = new Map();
const blockedIPs = new Map();
const BLOCK_DURATION = 3600000; // 1 saat

// Çevre değişkenlerinin doğrulaması
function validateConfig() {
  const requiredVars = [
    'DISCORD_TOKEN',
    'SERVER_STATS_URL',
    'CAREER_SAVEGAME_URL',
    'DB_PATH'
  ];

  for (const varName of requiredVars) {
    if (!CONFIG[varName]) {
      throw new Error(`Gerekli çevre değişkeni eksik: ${varName}`);
    }
  }

  // URL doğrulaması
  try {
    new URL(CONFIG.SERVER_STATS_URL);
    new URL(CONFIG.CAREER_SAVEGAME_URL);
  } catch (e) {
    throw new Error('Geçersiz URL formatı');
  }
}

// Rate limiting kontrolü
function checkRateLimit(ip) {
  const now = Date.now();
  const timestamps = requestTimestamps.get(ip) || [];
  const windowStart = now - CONFIG.RATE_LIMIT_WINDOW;

  // Eski istekleri temizle
  const validTimestamps = timestamps.filter(timestamp => timestamp > windowStart);
  requestTimestamps.set(ip, validTimestamps);

  // Engellenmiş IP kontrolü
  if (blockedIPs.has(ip)) {
    const blockEnd = blockedIPs.get(ip);
    if (now < blockEnd) {
      return false;
    }
    blockedIPs.delete(ip);
  }

  // Rate limit kontrolü
  if (validTimestamps.length >= CONFIG.RATE_LIMIT_REQUESTS) {
    blockedIPs.set(ip, now + BLOCK_DURATION);
    return false;
  }

  validTimestamps.push(now);
  return true;
}

class ServerManager {
  constructor(config) {
    this.config = config;
    this.db = getDefaultDatabase();
    this.lastUptimeUpdateTime = Date.now();
  }

  async fetchUptimeData() {
    try {
      const response = await axios.get(this.config.SERVER_STATS_URL);
      const data = await xml2js.parseStringPromise(response.data, {
        explicitArray: false,
      });
      return this.processServerData(data);
    } catch (error) {
      console.error('Sunucu verisi alınamadı:', error);
      return null;
    }
  }

  processServerData(data) {
    const serverName = data.Server.$.name || "Bilinmeyen Sunucu";
    const playersData = data.Server.Slots.Player;
    const players = Array.isArray(playersData) ? playersData : [playersData];
    
    return {
      serverName,
      players: players.filter(player => player.$ && player.$.isUsed === "true")
    };
  }
}

/**
 * PLAYER UPTIME TRACKING FUNCTIONS
 */

// Fetch player data from server stats XML
async function fetchUptimeData() {
  try {
    const response = await axios.get(CONFIG.SERVER_STATS_URL);
    const data = await xml2js.parseStringPromise(response.data, {
      explicitArray: false,
    });

    // Server name
    const serverName = data.Server.$.name || "Bilinmeyen Sunucu";

    // Get player data from slots
    const playersData = data.Server.Slots.Player;
    const players = Array.isArray(playersData) ? playersData : [playersData];

    // Filter active players
    const activePlayers = players.filter(
      (player) => player.$ && player.$.isUsed === "true"
    );

    return { serverName, activePlayers };
  } catch (error) {
    console.error("❌ Çalışma süresi verisi alınırken hata:", error.message);
    return null;
  }
}

// Update player uptime data in JSON file
async function updateUptimeData() {
  const uptimeData = await fetchUptimeData();
  if (
    !uptimeData ||
    !uptimeData.activePlayers ||
    uptimeData.activePlayers.length === 0
  ) {
    console.log("🔹 Aktif oyuncu bulunamadı, JSON dosyası güncellenmedi.");
    return;
  }

  let currentData = { players: {} };

  // Create directory if it doesn't exist
  const dirPath = path.dirname(CONFIG.UPTIME_FILE);
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`✅ Dizin oluşturuldu: ${dirPath}`);
    } catch (error) {
      console.error(`❌ Dizin oluşturulamadı: ${dirPath}`, error.message);
      return;
    }
  }

  // Read existing JSON file if it exists
  if (fs.existsSync(CONFIG.UPTIME_FILE)) {
    try {
      currentData = JSON.parse(fs.readFileSync(CONFIG.UPTIME_FILE, "utf8"));
      if (!currentData.players) currentData.players = {};
    } catch (error) {
      console.error("❌ JSON dosyası okunurken hata:", error.message);
      // Continue with empty players object
    }
  }

  // Update or add player uptime data
  uptimeData.activePlayers.forEach((player) => {
    const name = player._; // Player name
    const currentUptime = parseInt(player.$.uptime || "0", 10); // Current uptime value

    // If player exists in JSON
    if (currentData.players[name]) {
      const previousUptime = currentData.players[name].lastUptime || 0;
      const uptimeDifference = Math.max(0, currentUptime - previousUptime);
      currentData.players[name].uptime += uptimeDifference;
      currentData.players[name].lastUptime = currentUptime;
      currentData.players[name].lastSeen = new Date().toISOString();
    } else {
      // New player
      currentData.players[name] = {
        uptime: currentUptime,
        lastUptime: currentUptime,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      };
    }
  });

  // Update JSON file
  try {
    fs.writeFileSync(
      CONFIG.UPTIME_FILE,
      JSON.stringify(currentData, null, 2),
      "utf8"
    );
    console.log("✅ Oyuncu çalışma süresi verileri başarıyla güncellendi.");
  } catch (error) {
    console.error("❌ Çalışma süresi dosyası güncellenirken hata:", error.message);
  }
}

/**
 * DISCORD MESSAGE FUNCTIONS
 */

// Generate update message content based on changes
const getUpdateString = (
  newData,
  previousServer,
  previousMods,
  previousCareerSavegame
) => {
  if (!newData) return null;

  let string = "";

  const previousDlcCount = Object.values(previousMods).filter(
    ({ name: modName }) => modName.startsWith("pdlc_")
  ).length;
  const previousModCount = Object.values(previousMods).filter(
    ({ name: modName }) => !modName.startsWith("pdlc_")
  ).length;

  const dlcCount = Object.values(newData.mods).filter(({ name: modName }) =>
    modName.startsWith("pdlc_")
  ).length;
  const modCount = Object.values(newData.mods).filter(
    ({ name: modName }) => !modName.startsWith("pdlc_")
  ).length;

  const { game, version, name: serverName, mapName, online } = newData.server;

  // Server info changes
  const dlcString = getModString(newData, previousMods, true);
  const modString = getModString(newData, previousMods, false);

  if (
    (!!game && game !== previousServer.game) ||
    (!!version && version !== previousServer.version) ||
    (!!serverName && serverName !== previousServer.name) ||
    (!!mapName && mapName !== previousServer.mapName) ||
    !!dlcString ||
    !!modString
  ) {
    string += `**${serverName}**\n**${game}** *(${version})*\n**Harita:** ${mapName} **DLC**: *${dlcCount}*, **Mod**: *${modCount}*\n`;
    string += dlcString;
    string += modString;
  }

  // Savegame changes
  if (!CONFIG.DISABLE_SAVEGAME_MESSAGES) {
    const { money, playTime } = newData.careerSavegame;
    if (previousCareerSavegame.money !== money) {
      let moneyDifferenceSign = "";
      const moneyDifferenceAbsolute = Math.abs(
        money - previousCareerSavegame.money
      );

      if (money > previousCareerSavegame.money) {
        moneyDifferenceSign = "+";
      }
      if (money < previousCareerSavegame.money) {
        moneyDifferenceSign = "-";
      }
      string += `<a:MoneySoaring:1319029763398041772> **Finans Hareketleri:** *${money.toLocaleString(
        "en-GB"
      )} (${moneyDifferenceSign}${moneyDifferenceAbsolute.toLocaleString(
        "en-GB"
      )}).*\n`;
    }
    if (previousCareerSavegame.playTime !== playTime) {
      string += `<a:pixel_clock:1319030004411273297> **Geçirlen Zaman:** *${formatMinutes(
        playTime
      )}*.\n`;
    }
  }

  return string.trim() || null;
};

// Send message to appropriate Discord channels
const sendMessage = (message) => {
  if (!message) return;

  client.channels.cache
    .filter(
      (channel) =>
        (!CONFIG.DISCORD_SERVER_NAME ||
          channel.guild.name === CONFIG.DISCORD_SERVER_NAME) &&
        (!CONFIG.DISCORD_CHANNEL_NAME ||
          channel.name === CONFIG.DISCORD_CHANNEL_NAME) &&
        channel.type === ChannelType.GuildText &&
        channel.guild.members.me
          .permissionsIn(channel)
          .has(PermissionsBitField.Flags.ViewChannel) &&
        channel.guild.members.me
          .permissionsIn(channel)
          .has(PermissionsBitField.Flags.SendMessages) &&
        channel.send
    )
    .forEach((channel) => {
      console.log(`Mesaj gönderiliyor: ${channel.guild.name}: ${channel.name}`);
      channel.send(message).catch((error) => {
        console.error(
          `❌ ${channel.name} kanalına mesaj gönderilirken hata:`,
          error.message
        );
      });
    });
};

// Send server status message to a specific channel
const sendServerStatusMessage = (status, channelId) => {
  if (!channelId) return;

  const channel = client.channels.cache.get(channelId);
  if (!channel) {
    console.error(`❌ Kanal bulunamadı, ID: ${channelId}`);
    return;
  }

  let statusMessage = "";
  let statusEmoji = "";

  if (status === "online") {
    statusEmoji = "<:2171online:1319749534204563466>";
    statusMessage = "Sunucu çevrimiçi";
  } else if (status === "offline") {
    statusEmoji = "<:1006donotdisturb:1319749525283409971>";
    statusMessage = "Sunucu çevrimdışı";
  }

  console.log(`Durum mesajı gönderiliyor: ${channel.name}`);
  channel.send(`${statusEmoji} ${statusMessage}`).catch((error) => {
    console.error(`❌ Durum mesajı gönderilirken hata: ${error.message}`);
  });
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
 * MAIN UPDATE FUNCTIONS
 */

// Main update function - fetches data and updates Discord
const update = () => {
  console.log("Sunucu durumu kontrol ediliyor...");

  // Update uptime data every 10 minutes
  const now = Date.now();
  if (now - lastUptimeUpdateTime >= CONFIG.UPTIME_UPDATE_INTERVAL) {
    updateUptimeData();
    lastUptimeUpdateTime = now;
  }

  getDataFromAPI()
    .then((rawData) => {
      // Renk kodu düzeltme işlemini uygula
      if (rawData && rawData.serverData && typeof rawData.serverData === 'string') {
        rawData.serverData = fixColorCodes(rawData.serverData);
      }
      if (rawData && rawData.careerSaveGameData && typeof rawData.careerSaveGameData === 'string') {
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
          sendMessage("");
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
          previousCareerSavegame
        );

        // Sadece değişiklik varsa mesaj gönder
        if (updateString) {
          sendMessage(updateString);
        }

        // Sunucu çevrimiçi durumu değiştiyse
        if (data.server.online !== previousServer.online) {
          sendServerStatusMessage(data.server.online ? "online" : "offline", CONFIG.UPDATE_CHANNEL_ID);
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
          sendServerStatusMessage("offline", CONFIG.UPDATE_CHANNEL_ID);
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
          sendMessage("");
        }
        db.server.unreachable = true;
        fs.writeFileSync(CONFIG.DB_PATH, JSON.stringify(db, null, 2), "utf8");
      }
    });

  attemptPurge();
};

// Schedule daily messages at specified time
function scheduleDailyMessage(hour, minute, callback) {
  const now = new Date();
  const target = new Date();

  target.setHours(hour, minute, 0, 0);
  
  // Eğer belirlenen zaman bugün için geçtiyse, yarın için planla
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  const delay = target - now;
  const dayInMillis = 24 * 60 * 60 * 1000;

  console.log(`✅ Günlük istatistikler şu tarih için planlandı: ${target.toLocaleString()}`);
  console.log(`✅ Şu anki zaman: ${now.toLocaleString()}, ${delay / (1000 * 60)} dakika sonra çalışacak`);

  setTimeout(() => {
    console.log("⏰ Planlanmış görev zamanı geldi! sendUptimeData fonksiyonu çağrılıyor...");
    callback();
    
    // İlk çalıştırmadan sonra günlük interval başlat
    console.log("⏰ Günlük interval başlatılıyor, her 24 saatte bir çalışacak");
    setInterval(() => {
      console.log("⏰ 24 saatlik interval tetiklendi, callback çağrılıyor...");
      callback();
    }, dayInMillis);
  }, delay);
}

/**
 * PLAYER STATS FUNCTIONS
 */

// Format player uptime stats and send as embed
function sendUptimeData() {
  console.log("🔍 sendUptimeData fonksiyonu çağrıldı, günlük uptime istatistikleri gönderiliyor...");
  
  if (!fs.existsSync(CONFIG.UPTIME_FILE)) {
    console.error(`❌ Çalışma süresi dosyası bulunamadı: ${CONFIG.UPTIME_FILE}`);
    return;
  }

  console.log(`🔍 DAILY_SUMMARY_CHANNEL_ID: ${CONFIG.DAILY_SUMMARY_CHANNEL_ID}`);
  
  fs.readFile(CONFIG.UPTIME_FILE, "utf8", (err, data) => {
    if (err) {
      console.error("❌ Çalışma süresi dosyası okunamadı:", err.message);
      return;
    }

    try {
      const jsonData = JSON.parse(data);
      const players = jsonData.players;

      if (!players || Object.keys(players).length === 0) {
        console.warn("⚠️ Çalışma süresi dosyasında oyuncu verisi bulunamadı.");
        return;
      }

      const botAvatarURL = client.user.displayAvatarURL();

      // Sort players by uptime (descending)
      const sortedPlayers = Object.entries(players).sort(
        ([, a], [, b]) => b.uptime - a.uptime
      );

      // Format player stats with emojis
      const playerStats = sortedPlayers
        .map(([player, { uptime }]) => {
          const formattedTime = formatMinutes(uptime);
          return `<a:rainbowdot:1319037332229328896> **${player}**: ${formattedTime}`;
        })
        .join("\n\n");

      // Generate random color for embed
      const getRandomColor = () =>
        `#${Math.floor(Math.random() * 16777215).toString(16)}`;

      // Create embed with player stats
      const embed = new EmbedBuilder()
        .setColor(getRandomColor())
        .setTitle("<a:pixel_clock:1319030004411273297> Oyunda Harcanan Zaman\n")
        .setDescription(playerStats)
        .setTimestamp()
        .setFooter({
          text: "Sunucu İstatistikleri",
          iconURL: botAvatarURL,
        });

      // Send embed to designated channel
      const channel = client.channels.cache.get(
        CONFIG.DAILY_SUMMARY_CHANNEL_ID
      );
      
      if (channel) {
        console.log(`✅ Kanal bulundu: ${channel.name}`);
        channel
          .send({ embeds: [embed] })
          .then(() => console.log("✅ Oyuncu istatistikleri mesajı başarıyla gönderildi."))
          .catch((error) =>
            console.error("❌ Oyuncu istatistikleri gönderilirken hata:", error.message)
          );
      } else {
        console.error(
          "❌ Günlük özet kanalı bulunamadı! ID:",
          CONFIG.DAILY_SUMMARY_CHANNEL_ID
        );
      }
    } catch (parseError) {
      console.error("❌ JSON ayrıştırma hatası:", parseError.message);
    }
  });
}

/**
 * INITIALIZATION AND EVENT HANDLERS
 */

// Setup and connect the Discord client with retry logic
const setupDiscordClient = async () => {
  try {
    console.log('Discord istemcisi ayarlanıyor...');

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
    console.log(`Yeniden bağlanmaya çalışılıyor (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}), ${RECONNECT_DELAY / 1000} saniye içinde...`);

    setTimeout(async () => {
      const success = await setupDiscordClient();
      if (!success) {
        handleReconnection();
      }
    }, RECONNECT_DELAY);
  } else {
    console.error(`❌ Maksimum yeniden bağlanma denemesi (${MAX_RECONNECT_ATTEMPTS}) aşıldı. Lütfen bağlantınızı kontrol edin ve botu manuel olarak yeniden başlatın.`);
    isReconnecting = false;
  }
};

// Modify error event to use reconnection
client.on("error", (error) => {
  console.error("❌ Discord istemci hatası:", error.message);
  handleReconnection();
});

// Add disconnect handler
client.on("disconnect", (event) => {
  console.error(`❌ Discord istemcisi ${event.code} koduyla bağlantısı kesildi. Sebep: ${event.reason}`);
  handleReconnection();
});

// Add reconnect event
client.on("reconnecting", () => {
  console.log("⏳ Discord istemcisi yeniden bağlanıyor...");
});

// Discord ready event
client.on("ready", () => {
  console.log(`✅ Bot ${client.user.tag} olarak çalışıyor!`);

  // Setup message purging
  if (willPurge()) {
    if (CONFIG.PURGE_ON_STARTUP) {
      attemptPurge();
    } else {
      nextPurge = getNextPurge();
      console.log(`✅ İlk temizleme ${new Date(nextPurge)} tarihinde planlandı`);
    }
  }

  // Schedule daily stats message
  scheduleDailyMessage(
    CONFIG.DAILY_STATS_HOUR,
    CONFIG.DAILY_STATS_MINUTE,
    sendUptimeData
  );

  // Start update interval
  if (intervalTimer) {
    clearInterval(intervalTimer);
  }

  update(); // Initial update
  intervalTimer = setInterval(update, CONFIG.POLL_INTERVAL_MINUTES * 60000);

  startHeartbeat();
});

// Warning event
client.on("warn", (info) => {
  console.warn("⚠️ Discord istemci uyarısı:", info);
});

// Process handlers for graceful shutdown
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
  // Instead log it and let the reconnection mechanism handle it if needed
  if (error.message.includes("ECONNRESET") ||
    error.message.includes("network") ||
    error.message.includes("connect")) {
    handleReconnection();
  }
});

// Add heartbeat mechanism
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
      console.warn("⚠️ Kalp atışı kontrolü sırasında Discord istemcisi hazır değil");
      handleReconnection();
    }
  }, HEARTBEAT_INTERVAL);

  console.log(`✅ Kalp atışı başlatıldı, her ${HEARTBEAT_INTERVAL / 1000 / 60} dakikada bir kontrol ediliyor`);
};

// Add cleanup for the heartbeat timer
onExit(() => {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  console.log("Discord'dan çıkış yapılıyor...");
  client.destroy();
});

class DiscordManager {
  constructor(config) {
    this.config = config;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
      ],
    });
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.client.on('ready', () => {
      console.log(`Bot ${this.client.user.tag} olarak giriş yaptı!`);
    });

    this.client.on('error', (error) => {
      console.error('Discord bağlantı hatası:', error);
    });
  }

  async sendMessage(channelId, message) {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel) {
        await channel.send(message);
      }
    } catch (error) {
      console.error('Mesaj gönderilemedi:', error);
    }
  }
}

class FS25Bot {
  constructor(config) {
    this.config = config;
    this.serverManager = new ServerManager(config);
    this.discordManager = new DiscordManager(config);
    this.validateConfig();
  }

  async start() {
    try {
      await this.discordManager.client.login(this.config.DISCORD_TOKEN);
      this.startHeartbeat();
      this.scheduleDailyMessage();
    } catch (error) {
      console.error('Bot başlatılamadı:', error);
      process.exit(1);
    }
  }

  startHeartbeat() {
    setInterval(() => {
      this.update();
    }, this.config.POLL_INTERVAL_MINUTES * 60 * 1000);
  }

  scheduleDailyMessage() {
    const now = new Date();
    const targetTime = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      this.config.DAILY_STATS_HOUR,
      this.config.DAILY_STATS_MINUTE,
      0
    );

    if (now > targetTime) {
      targetTime.setDate(targetTime.getDate() + 1);
    }

    const delay = targetTime.getTime() - now.getTime();
    setTimeout(() => {
      this.sendUptimeData();
      this.scheduleDailyMessage();
    }, delay);
  }
}

// Yeni başlatma kodu
const bot = new FS25Bot(CONFIG);
bot.start().catch(error => {
  console.error('Bot başlatılamadı:', error);
  process.exit(1);
});
