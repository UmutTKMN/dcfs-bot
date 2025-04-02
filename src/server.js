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
  PURGE_ON_STARTUP: process.env.FS25_BOT_PURGE_DISCORD_CHANNEL_ON_STARTUP === "true"
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
    const serverName = data.Server.$.name || "Unknown Server";

    // Get player data from slots
    const playersData = data.Server.Slots.Player;
    const players = Array.isArray(playersData) ? playersData : [playersData];

    // Filter active players
    const activePlayers = players.filter(
      (player) => player.$ && player.$.isUsed === "true"
    );

    return { serverName, activePlayers };
  } catch (error) {
    console.error("❌ Error fetching uptime data:", error.message);
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
    console.log("🔹 No active players found, JSON file not updated.");
    return;
  }

  let currentData = { players: {} };

  // Create directory if it doesn't exist
  const dirPath = path.dirname(CONFIG.UPTIME_FILE);
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`✅ Created directory: ${dirPath}`);
    } catch (error) {
      console.error(`❌ Failed to create directory: ${dirPath}`, error.message);
      return;
    }
  }

  // Read existing JSON file if it exists
  if (fs.existsSync(CONFIG.UPTIME_FILE)) {
    try {
      currentData = JSON.parse(fs.readFileSync(CONFIG.UPTIME_FILE, "utf8"));
      if (!currentData.players) currentData.players = {};
    } catch (error) {
      console.error("❌ Error reading JSON file:", error.message);
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
    console.log("✅ Player uptime data successfully updated.");
  } catch (error) {
    console.error("❌ Error updating uptime file:", error.message);
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
    string += `**${serverName}**\n**${game}** *(${version})*\n**Map:** ${mapName} **DLC**: *${dlcCount}*, **Mod**: *${modCount}*\n`;
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
      string += `<a:MoneySoaring:1319029763398041772> **Financial Activity:** *${money.toLocaleString(
        "en-GB"
      )} (${moneyDifferenceSign}${moneyDifferenceAbsolute.toLocaleString(
        "en-GB"
      )}).*\n`;
    }
    if (previousCareerSavegame.playTime !== playTime) {
      string += `<a:pixel_clock:1319030004411273297> **Time Spent:** *${formatMinutes(
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
      console.log(`Sending message to: ${channel.guild.name}: ${channel.name}`);
      channel.send(message).catch((error) => {
        console.error(
          `❌ Error sending message to ${channel.name}:`,
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
    console.error(`❌ Channel not found for ID: ${channelId}`);
    return;
  }

  let statusMessage = "";
  let statusEmoji = "";

  if (status === "online") {
    statusEmoji = "<:2171online:1319749534204563466>";
    statusMessage = "Server is now online";
  } else if (status === "offline") {
    statusEmoji = "<:1006donotdisturb:1319749525283409971>";
    statusMessage = "Server is offline";
  }

  console.log(`Sending server status message to channel: ${channel.name}`);
  channel.send(`${statusEmoji} ${statusMessage}`).catch((error) => {
    console.error(`❌ Error sending status message: ${error.message}`);
  });
};

// Message purging functionality
const attemptPurge = () => {
  const now = new Date().getTime();
  if (willPurge() && now >= nextPurge) {
    nextPurge = getNextPurge();
    console.log("Looking for messages to purge...");
    try {
      purgeOldMessages(client);
    } catch (e) {
      console.error("❌ Error purging messages:", e.message);
    }
    console.log(`Next purge will be ${new Date(nextPurge)}`);
  }
};

/**
 * MAIN UPDATE FUNCTIONS
 */

// Main update function - fetches data and updates Discord
const update = () => {
  console.log("Checking server status...");

  // Update uptime data every 10 minutes
  const now = Date.now();
  if (now - lastUptimeUpdateTime >= CONFIG.UPTIME_UPDATE_INTERVAL) {
    updateUptimeData();
    lastUptimeUpdateTime = now;
  }

  getDataFromAPI()
    .then((rawData) => {
      try {
        const previouslyUnreachable = db.server.unreachable;
        const previousServer = db.server;
        const previousMods = db.mods;
        const previousCareerSavegame = db.careerSavegame;

        const data = parseData(rawData, previousServer);

        // Sunucu erişilebilirlik durumu değiştiyse
        if (previouslyUnreachable && data) {
          if (!CONFIG.DISABLE_UNREACHABLE_FOUND_MESSAGES) {
            sendMessage("Server reachable");
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
            sendMessage("Server Status:: <:1006donotdisturb:1319749525283409971>");
            sendServerStatusMessage("offline", CONFIG.UPDATE_CHANNEL_ID);
          }

          db.server.online = false;
          db.server.unreachable = false;
          fs.writeFileSync(CONFIG.DB_PATH, JSON.stringify(db, null, 2), "utf8");

          // Bot durumunu güncelle
          client.user.setActivity("Server unreachable", { type: "WATCHING" });
          client.user.setStatus("dnd");
        }
      } catch (e) {
        console.error("❌ Error processing server data:", e.message);
      }
    })
    .catch((e) => {
      console.error("❌ Error fetching server data:", e.message);
      client.user.setActivity("Under Maintenance");

      // Sunucu erişilemez durumu değiştiyse
      if (!db.server.unreachable) {
        if (!CONFIG.DISABLE_UNREACHABLE_FOUND_MESSAGES) {
          sendMessage("Server unreachable");
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
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  const delay = target - now;
  const dayInMillis = 24 * 60 * 60 * 1000;

  console.log(`✅ Daily stats scheduled for ${target.toLocaleString()}`);

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
    console.error(`❌ Uptime file not found: ${CONFIG.UPTIME_FILE}`);
    return;
  }

  fs.readFile(CONFIG.UPTIME_FILE, "utf8", (err, data) => {
    if (err) {
      console.error("❌ Could not read uptime file:", err.message);
      return;
    }

    try {
      const jsonData = JSON.parse(data);
      const players = jsonData.players;

      if (!players || Object.keys(players).length === 0) {
        console.warn("⚠️ No player data found in uptime file.");
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
        .setTitle("<a:pixel_clock:1319030004411273297> Time Spent In Game\n")
        .setDescription(playerStats)
        .setTimestamp()
        .setFooter({
          text: "Server Statistics",
          iconURL: botAvatarURL,
        });

      // Send embed to designated channel
      const channel = client.channels.cache.get(
        CONFIG.DAILY_SUMMARY_CHANNEL_ID
      );
      if (channel) {
        channel
          .send({ embeds: [embed] })
          .then(() => console.log("✅ Player stats message sent successfully."))
          .catch((error) =>
            console.error("❌ Error sending player stats:", error.message)
          );
      } else {
        console.error(
          "❌ Daily summary channel not found! ID:",
          CONFIG.DAILY_SUMMARY_CHANNEL_ID
        );
      }
    } catch (parseError) {
      console.error("❌ JSON parse error:", parseError.message);
    }
  });
}

/**
 * INITIALIZATION AND EVENT HANDLERS
 */

// Setup and connect the Discord client with retry logic
const setupDiscordClient = async () => {
  try {
    console.log('Setting up Discord client...');

    // Login to Discord
    await client.login(CONFIG.DISCORD_TOKEN);
    console.log("✅ Connected to Discord!");

    // Reset reconnection counter on successful connection
    reconnectAttempts = 0;
    isReconnecting = false;

    return true;
  } catch (err) {
    console.error("❌ Failed to connect to Discord:", err.message);
    return false;
  }
};

// Add a reconnection handler
const handleReconnection = async () => {
  if (isReconnecting) return;

  isReconnecting = true;

  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts++;
    console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${RECONNECT_DELAY / 1000} seconds...`);

    setTimeout(async () => {
      const success = await setupDiscordClient();
      if (!success) {
        handleReconnection();
      }
    }, RECONNECT_DELAY);
  } else {
    console.error(`❌ Maximum reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Please check your connection and restart the bot manually.`);
    isReconnecting = false;
  }
};

// Modify error event to use reconnection
client.on("error", (error) => {
  console.error("❌ Discord client error:", error.message);
  handleReconnection();
});

// Add disconnect handler
client.on("disconnect", (event) => {
  console.error(`❌ Discord client disconnected with code ${event.code}. Reason: ${event.reason}`);
  handleReconnection();
});

// Add reconnect event
client.on("reconnecting", () => {
  console.log("⏳ Discord client reconnecting...");
});

// Update the initialization code
const init = async () => {
  try {
    // Check for database directory
    const dbDir = path.dirname(CONFIG.DB_PATH);
    if (!fs.existsSync(dbDir)) {
      try {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`✅ Created directory: ${dbDir}`);
      } catch (error) {
        console.error(`❌ Failed to create directory ${dbDir}:`, error.message);
      }
    }

    // Read database
    try {
      if (fs.existsSync(CONFIG.DB_PATH)) {
        const dbContent = fs.readFileSync(CONFIG.DB_PATH, 'utf8');
        db = JSON.parse(dbContent);
        console.log('✅ Database loaded');
      }
    } catch (e) {
      console.error(`❌ Unable to read database: ${CONFIG.DB_PATH}`, e.message);
      db = getDefaultDatabase();
    }

    // Setup Discord client with reconnection support
    const connected = await setupDiscordClient();
    if (!connected) {
      handleReconnection();
    }
  } catch (error) {
    console.error("❌ Initialization error:", error.message);
    handleReconnection();
  }
};

// Discord ready event
client.on("ready", () => {
  console.log(`✅ Bot is running as ${client.user.tag}!`);

  // Setup message purging
  if (willPurge()) {
    if (CONFIG.PURGE_ON_STARTUP) {
      attemptPurge();
    } else {
      nextPurge = getNextPurge();
      console.log(`✅ First purge scheduled for ${new Date(nextPurge)}`);
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
  console.warn("⚠️ Discord client warning:", info);
});

// Process handlers for graceful shutdown
process.on("SIGINT", async () => {
  console.log("SIGINT received. Shutting down bot...");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM received. Shutting down bot...");
  process.exit(0);
});

process.on("beforeExit", (code) => {
  console.log(`Process beforeExit event with code: ${code}`);
});

// Improve the error handling
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
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
    console.log("💓 Bot heartbeat - still running");

    // Check if client is connected and reconnect if needed
    if (!client.isReady()) {
      console.warn("⚠️ Discord client is not ready during heartbeat check");
      handleReconnection();
    }
  }, HEARTBEAT_INTERVAL);

  console.log(`✅ Heartbeat started, checking every ${HEARTBEAT_INTERVAL / 1000 / 60} minutes`);
};

// Add cleanup for the heartbeat timer
onExit(() => {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  console.log("Logging out from Discord...");
  client.destroy();
});

// Start the initialization process
init();
