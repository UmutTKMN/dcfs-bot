#! /usr/bin/env node

const _ = require("lodash");
const merge = require("deepmerge");
const fs = require("fs");
const path = require("path");
const fetch = require("fetch-retry")(global.fetch);
const xml2js = require("xml2js");
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
  Collection,
  REST,
  Routes
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
  DAILY_SUMMARY_CHANNEL_ID: process.env.FS25_BOT_DAILY_SUMMARY_CHANNEL_ID,
  UPDATE_CHANNEL_ID: process.env.FS25_BOT_UPDATE_CHANNEL_ID,
  PLAYER_ACTIVITY_CHANNEL_ID: process.env.FS25_BOT_PLAYER_ACTIVITY_CHANNEL_ID,
  DISCORD_SERVER_NAME: process.env.FS25_BOT_DISCORD_SERVER_NAME,
  DISCORD_CHANNEL_NAME: process.env.FS25_BOT_DISCORD_CHANNEL_NAME,
  PLAYER_LOGS_DIR: process.env.FS25_BOT_PLAYER_LOGS_DIR || "./logs/players",
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
let previousActivePlayers = new Set(); // Son kontrol edilen aktif oyuncu listesi

// Initialize Discord client with all necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Slash komutları için koleksiyon oluştur
client.commands = new Collection();

// Komutları src/commands klasöründen yükle
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
    }
  }
}

// Slash komutlarını Discord API'ye yükle
async function registerSlashCommands() {
  const rest = new REST({ version: '10' }).setToken(CONFIG.DISCORD_TOKEN);
  const commands = [...client.commands.values()].map(cmd => cmd.data.toJSON());
  try {
    await rest.put(
      Routes.applicationCommands(process.env.FS25_BOT_CLIENT_ID),
      { body: commands },
    );
    console.log('✅ Slash komutları başarıyla yüklendi.');
  } catch (error) {
    console.error('❌ Slash komutları yüklenirken hata:', error);
  }
}

/**
 * PLAYER ACTIVITY LOGGING
 */

// Oyuncu aktivitelerini loglayan yardımcı fonksiyon
function logPlayerActivity(playerName, action) {
  try {
    // Log dizini yoksa oluştur
    const logDir = CONFIG.PLAYER_LOGS_DIR;
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
      console.log(`✅ Log dizini oluşturuldu: ${logDir}`);
    }

    // Günün tarihini al (YYYY-MM-DD formatında)
    const today = new Date().toISOString().split('T')[0];
    const logFilePath = path.join(logDir, `player_activity_${today}.log`);

    // Şu anki tam zamanı al
    const timestamp = new Date().toISOString().replace('T', ' ').substr(0, 19);

    // Log mesajını oluştur
    const logMessage = `[${timestamp}] ${playerName} ${action === 'join' ? 'sunucuya katıldı' : 'sunucudan ayrıldı'}\n`;

    // Dosyaya ekle (append)
    fs.appendFileSync(logFilePath, logMessage);
  } catch (error) {
    console.error(`❌ Oyuncu aktivitesi loglanırken hata: ${error.message}`);
  }
}

// Bugünkü log dosyasını okuyan yardımcı fonksiyon
function getTodayPlayerActivityLogs() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const logFilePath = path.join(CONFIG.PLAYER_LOGS_DIR, `player_activity_${today}.log`);
    
    if (!fs.existsSync(logFilePath)) {
      return "Bugün için oyuncu aktivitesi kaydı bulunmuyor.";
    }
    
    return fs.readFileSync(logFilePath, 'utf8');
  } catch (error) {
    console.error(`❌ Bugünkü log dosyası okunurken hata: ${error.message}`);
    return "Log dosyası okunamadı.";
  }
}

/**
 * PLAYER JOIN/LEAVE TRACKING FUNCTIONS
 */

// Send player activity message to a specific channel
const sendPlayerActivityMessage = (message) => {
  if (!CONFIG.PLAYER_ACTIVITY_CHANNEL_ID) {
    // Özel kanal ayarlanmamışsa normal kanallara gönder
    sendMessage(message);
    return;
  }

  const channel = client.channels.cache.get(CONFIG.PLAYER_ACTIVITY_CHANNEL_ID);
  if (!channel) {
    console.error(`❌ Oyuncu aktivite kanalı bulunamadı, ID: ${CONFIG.PLAYER_ACTIVITY_CHANNEL_ID}`);
    // Kanal bulunamadığında normal kanallara gönder
    sendMessage(message);
    return;
  }

  console.log(`Oyuncu aktivite mesajı gönderiliyor: ${channel.name}`);
  channel.send(message).catch((error) => {
    console.error(`❌ Oyuncu aktivite mesajı gönderilirken hata: ${error.message}`);
  });
};

// Detect player join/leave events and send notification to Discord
async function checkPlayerJoinLeave() {
  try {
    const result = await fetchUptimeData();
    
    // Result veya activePlayers null/undefined ise boş bir liste kullan
    const activePlayers = result?.activePlayers || [];
    
    // Get current active player names - Hatalı verileri filtrele
    const currentActivePlayerNames = new Set(
      activePlayers
        .filter(player => player && player._)  // undefined veya null olan player._'leri filtrele
        .map(player => player._)
    );
    
    // İlk çalıştırma kontrolü
    if (previousActivePlayers.size === 0) {
      console.log("İlk çalıştırma: Oyuncu listesi kaydediliyor");
      previousActivePlayers = currentActivePlayerNames;
      return;
    }
    
    // Find players who joined (in current but not in previous)
    const joinedPlayers = [...currentActivePlayerNames].filter(
      player => !previousActivePlayers.has(player)
    );
    
    // Find players who left (in previous but not in current)
    const leftPlayers = [...previousActivePlayers].filter(
      player => !currentActivePlayerNames.has(player)
    );
    
    // Çok fazla değişiklik varsa muhtemelen bir bağlantı kesintisi olmuştur
    const totalChanges = joinedPlayers.length + leftPlayers.length;
    if (totalChanges > 5) {
      console.warn(`⚠️ Bir defada ${totalChanges} oyuncu değişikliği tespit edildi, muhtemelen sunucu yeniden başlatıldı veya bağlantı kesintisi oldu.`);
      
      // Sadece logla ama bildirim gönderme
      if (joinedPlayers.length > 0) {
        console.log(`ℹ️ Toplu giriş tespit edildi: ${joinedPlayers.join(', ')}`);
      }
      if (leftPlayers.length > 0) {
        console.log(`ℹ️ Toplu çıkış tespit edildi: ${leftPlayers.join(', ')}`);
      }
      
      // Oyuncu listesini güncelleyip çık
      previousActivePlayers = currentActivePlayerNames;
      return;
    }
    
    // Send join notifications
    for (const player of joinedPlayers) {
      try {
        const joinMessage = `<:2171online:1319749534204563466> **${player}** sunucuya katıldı!`;
        sendPlayerActivityMessage(joinMessage);
        console.log(`✅ Oyuncu giriş bildirimi: ${player}`);
        
        // Oyuncu girişini logla
        logPlayerActivity(player, 'join');
      } catch (notifyError) {
        console.error(`❌ Oyuncu giriş bildirimi gönderilirken hata (${player}):`, notifyError.message);
      }
    }
    
    // Send leave notifications
    for (const player of leftPlayers) {
      try {
        const leaveMessage = `<:1006donotdisturb:1319749525283409971> **${player}** sunucudan ayrıldı!`;
        sendPlayerActivityMessage(leaveMessage);
        console.log(`👋 Oyuncu çıkış bildirimi: ${player}`);
        
        // Oyuncu çıkışını logla
        logPlayerActivity(player, 'leave');
      } catch (notifyError) {
        console.error(`❌ Oyuncu çıkış bildirimi gönderilirken hata (${player}):`, notifyError.message);
      }
    }
    
    // Update previous player list
    previousActivePlayers = currentActivePlayerNames;
    
  } catch (error) {
    console.error("❌ Oyuncu giriş/çıkış kontrolü sırasında hata:", error.message);
    if (error.stack) {
      console.error("Hata Detayları:", error.stack);
    }
  }
}

/**
 * PLAYER UPTIME TRACKING FUNCTIONS
 */

// Fetch player data from server stats XML
async function fetchUptimeData() {
  try {
    // fetch-retry ile istek gönder
    const response = await fetch(CONFIG.SERVER_STATS_URL, {
      method: "GET",
      body: null,
      retries: 3,
      retryDelay: 1000
    });
    
    if (!response.ok) {
      console.log(`⚠️ Sunucudan hatalı yanıt: ${response.status}`);
      return { serverName: "Bilinmeyen Sunucu", activePlayers: [] };
    }
    
    const textData = await response.text();
    const data = await xml2js.parseStringPromise(textData, {
      explicitArray: false,
    });

    // Server name
    const serverName = data.Server?.$.name || "Bilinmeyen Sunucu";

    // Get player data from slots
    if (!data.Server || !data.Server.Slots || !data.Server.Slots.Player) {
      console.log("⚠️ XML verisinde oyuncu bilgisi bulunamadı");
      return { serverName, activePlayers: [] };
    }
    
    const playersData = data.Server.Slots.Player;
    const players = Array.isArray(playersData) ? playersData : [playersData];

    // Filter active players
    const activePlayers = players.filter(
      (player) => player.$ && player.$.isUsed === "true"
    );

    return { serverName, activePlayers };
  } catch (error) {
    console.error("❌ Çalışma süresi verisi alınırken hata:", error.message);
    // Hata durumunda boş bir liste dönelim
    return { serverName: "Bilinmeyen Sunucu", activePlayers: [] };
  }
}

// Update player uptime data in JSON file
async function updateUptimeData() {
  try {
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
        currentData = { players: {} };
      }
    }

    // Update or add player uptime data
    uptimeData.activePlayers.forEach((player) => {
      const name = player._; // Player name
      if (!name) return; // Adı olmayan oyuncuları atla
      
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
      console.error(
        "❌ Çalışma süresi dosyası güncellenirken hata:",
        error.message
      );
    }
  } catch (error) {
    console.error("❌ Uptime verisi güncellenirken beklenmeyen hata:", error.message);
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

// Sunucu erişilebilirlik kontrolü için yardımcı fonksiyon
async function isServerReachable() {
  try {
    // fetch-retry ile istek gönder
    const response = await fetch(CONFIG.SERVER_STATS_URL, {
      method: "GET",
      body: null,
      retries: 2,
      retryDelay: 500
    });
    
    return response.ok;
  } catch (error) {
    console.error(`❌ Sunucu erişilebilirlik kontrolü başarısız: ${error.message}`);
    return false;
  }
}

// Main update function - fetches data and updates Discord
const update = () => {
  console.log("Sunucu durumu kontrol ediliyor...");

  // Update uptime data every 10 minutes
  const now = Date.now();
  if (now - lastUptimeUpdateTime >= CONFIG.UPTIME_UPDATE_INTERVAL) {
    updateUptimeData();
    lastUptimeUpdateTime = now;
  }

  // Önce sunucuya erişilebildiğini kontrol et
  isServerReachable()
    .then(reachable => {
      // Sunucu erişilemez durumdaysa
      if (!reachable) {
        // Sunucu erişilemez durumu değiştiyse
        if (!db.server.unreachable) {
          db.server.unreachable = true;
          fs.writeFileSync(CONFIG.DB_PATH, JSON.stringify(db, null, 2), "utf8");

          // Sunucu çevrimdışı durumu değiştiyse
          if (db.server.online) {
            sendServerStatusMessage("offline", CONFIG.UPDATE_CHANNEL_ID);
            db.server.online = false;
            fs.writeFileSync(CONFIG.DB_PATH, JSON.stringify(db, null, 2), "utf8");
          }
        }
        
        // Player activity kontrolü yapma ve devam etme
        return;
      }

      // Sunucu erişilebilir ise oyuncu aktivitesini kontrol et
      checkPlayerJoinLeave();

      // Ve server verisini çek
      getDataFromAPI()
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
            client.user.setActivity("Sunucu Çevrimdışı", { type: "WATCHING" });
            client.user.setStatus("dnd");
          }
        })
        .catch((e) => {
          console.error("❌ Sunucu verisi alınırken hata:", e.message);
          client.user.setActivity("Bakım Altında");

          // Sunucu erişilemez durumu değiştiyse
          if (!db.server.unreachable) {
            if (!CONFIG.DISABLE_UNREACHABLE_FOUND_MESSAGES) {
              sendMessage("⚠️ **Sunucu verisi alınamıyor!**");
            }
            db.server.unreachable = true;
            fs.writeFileSync(CONFIG.DB_PATH, JSON.stringify(db, null, 2), "utf8");
          }
        });
    })
    .catch(error => {
      console.error("❌ Sunucu kontrol işleminde hata:", error.message);
    });

  attemptPurge();
};

// Schedule daily messages at specified time
function scheduleDailyMessage(hour, minute, callback) {
  const now = new Date();
  const target = new Date();

  target.setHours(hour, minute, 0, 0);
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  const delay = target - now;
  const dayInMillis = 24 * 60 * 60 * 1000;

  console.log(
    `✅ Günlük istatistikler ${target.toLocaleString()} için planlandı`
  );

  setTimeout(() => {
    callback();
    setInterval(callback, dayInMillis);
  }, delay);
}

/**
 * PLAYER STATS FUNCTIONS
 */

// Format player uptime stats and send as embed
function sendUptimeData() {
  if (!fs.existsSync(CONFIG.UPTIME_FILE)) {
    console.error(
      `❌ Çalışma süresi dosyası bulunamadı: ${CONFIG.UPTIME_FILE}`
    );
    return;
  }

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

      // Günlük oyuncu giriş-çıkış istatistiklerini de ekle
      addPlayerActivityStats(embed);

      // Send embed to designated channel
      const channel = client.channels.cache.get(
        CONFIG.DAILY_SUMMARY_CHANNEL_ID
      );
      if (channel) {
        channel
          .send({ embeds: [embed] })
          .then(() =>
            console.log("✅ Oyuncu istatistikleri mesajı başarıyla gönderildi.")
          )
          .catch((error) =>
            console.error(
              "❌ Oyuncu istatistikleri gönderilirken hata:",
              error.message
            )
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

// Günlük oyuncu aktivite istatistiklerini embed'e ekle
function addPlayerActivityStats(embed) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const logFilePath = path.join(CONFIG.PLAYER_LOGS_DIR, `player_activity_${today}.log`);
    
    if (!fs.existsSync(logFilePath)) {
      embed.addFields({ 
        name: "📊 Bugünkü Oyuncu Aktivitesi", 
        value: "Bugün için kayıtlı oyuncu giriş/çıkış aktivitesi bulunmuyor."
      });
      return;
    }

    const logs = fs.readFileSync(logFilePath, 'utf8').split('\n').filter(line => line.trim() !== '');
    
    if (logs.length === 0) {
      embed.addFields({ 
        name: "📊 Bugünkü Oyuncu Aktivitesi", 
        value: "Bugün hiç oyuncu giriş/çıkış aktivitesi kaydedilmemiş."
      });
      return;
    }

    // Son 10 aktiviteyi göster
    const maxEntries = Math.min(10, logs.length);
    const lastEntries = logs.slice(-maxEntries);
    
    embed.addFields({ 
      name: `📊 Bugünkü Oyuncu Aktivitesi (Son ${maxEntries}/${logs.length})`, 
      value: lastEntries.join('\n')
    });
    
  } catch (error) {
    console.error("❌ Oyuncu aktivite istatistikleri eklenirken hata:", error.message);
    embed.addFields({ 
      name: "📊 Bugünkü Oyuncu Aktivitesi", 
      value: "Aktivite verileri yüklenirken bir hata oluştu."
    });
  }
}

/**
 * INITIALIZATION AND EVENT HANDLERS
 */

// Setup and connect the Discord client with retry logic
const setupDiscordClient = async () => {
  try {
    console.log("Discord istemcisi ayarlanıyor...");

    // Login to Discord
    await client.login(CONFIG.DISCORD_TOKEN);
    console.log("✅ Discord'a bağlanıldı!");

    return true;
  } catch (err) {
    console.error("❌ Discord'a bağlanılamadı:", err.message);
    return false;
  }
};

// Update the initialization code
const init = async () => {
  try {
    // Check for database directory
    const dbDir = path.dirname(CONFIG.DB_PATH);
    if (!fs.existsSync(dbDir)) {
      try {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`✅ Veritabanı dizini oluşturuldu: ${dbDir}`);
      } catch (error) {
        console.error(`❌ ${dbDir} dizini oluşturulamadı:`, error.message);
      }
    }

    // Check for logs directory
    if (!fs.existsSync(CONFIG.PLAYER_LOGS_DIR)) {
      try {
        fs.mkdirSync(CONFIG.PLAYER_LOGS_DIR, { recursive: true });
        console.log(`✅ Oyuncu log dizini oluşturuldu: ${CONFIG.PLAYER_LOGS_DIR}`);
      } catch (error) {
        console.error(`❌ ${CONFIG.PLAYER_LOGS_DIR} dizini oluşturulamadı:`, error.message);
      }
    }

    // Check for uptime directory
    const uptimeDir = path.dirname(CONFIG.UPTIME_FILE);
    if (!fs.existsSync(uptimeDir)) {
      try {
        fs.mkdirSync(uptimeDir, { recursive: true });
        console.log(`✅ Çalışma süresi dizini oluşturuldu: ${uptimeDir}`);
      } catch (error) {
        console.error(`❌ ${uptimeDir} dizini oluşturulamadı:`, error.message);
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
      console.error("❌ Discord'a bağlanılamadı, başlatma işlemi iptal edildi.");
      return;
    }
  } catch (error) {
    console.error("❌ Başlatma hatası:", error.message);
  }
};

// Discord ready event
client.on("ready", async () => {
  console.log(`✅ Bot ${client.user.tag} olarak çalışıyor!`);

  // Initialize active player list on startup
  try {
    const { activePlayers } = await fetchUptimeData();
    if (activePlayers) {
      previousActivePlayers = new Set(activePlayers.map(player => player._));
      console.log(`✅ Başlangıç aktif oyuncu listesi yüklendi (${previousActivePlayers.size} oyuncu)`);
    }
  } catch (error) {
    console.error("❌ Başlangıç oyuncu listesi yüklenirken hata:", error.message);
  }

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
    sendUptimeData
  );

  // Start update interval
  if (intervalTimer) {
    clearInterval(intervalTimer);
  }

  // Log başlangıç bilgisi
  console.log("===== OYUNCU AKTİVİTE LOGLARININ DURUMU =====");
  const today = new Date().toISOString().split('T')[0];
  const logFilePath = path.join(CONFIG.PLAYER_LOGS_DIR, `player_activity_${today}.log`);
  if (fs.existsSync(logFilePath)) {
    console.log(`✅ Bugünkü (${today}) log dosyası mevcut: ${logFilePath}`);
    const logStats = fs.statSync(logFilePath);
    console.log(`📊 Log dosyası boyutu: ${(logStats.size / 1024).toFixed(2)} KB`);
    
    // Son 5 aktiviteyi göster
    const recentLogs = getTodayPlayerActivityLogs().split('\n').filter(line => line.trim() !== '');
    const logCount = recentLogs.length;
    
    if (logCount > 0) {
      console.log(`📝 Bugün toplam ${logCount} aktivite kaydedilmiş.`);
      console.log("Son aktiviteler:");
      recentLogs.slice(-5).forEach(log => console.log(`  ${log}`));
    } else {
      console.log("📝 Bugün henüz aktivite kaydedilmemiş.");
    }
  } else {
    console.log(`📝 Bugün (${today}) için henüz log dosyası oluşturulmamış.`);
  }
  console.log("=============================================");

  update(); // Initial update
  intervalTimer = setInterval(update, CONFIG.POLL_INTERVAL_MINUTES * 60000);

  startHeartbeat();

  await registerSlashCommands();
});

// Slash komutlarını dinle
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: 'Komut çalıştırılırken bir hata oluştu.', ephemeral: true });
  }
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
  if (
    error.message.includes("ECONNRESET") ||
    error.message.includes("network") ||
    error.message.includes("connect")
  ) {
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

// Add cleanup for the heartbeat timer
onExit(() => {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  console.log("Discord'dan çıkış yapılıyor...");
  client.destroy();
});

// Start the initialization process
init();
