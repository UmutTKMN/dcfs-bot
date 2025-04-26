const fs = require("fs");
const path = require("path");
const axios = require("axios");
const xml2js = require("xml2js");

/**
 * Farming Simulator 25 sunucusu üzerinden oyuncu çalışma süresi verilerini çeker
 * @param {string} serverStatsUrl - Sunucu istatistikleri XML URL'si
 * @returns {Promise<Object|null>} Oyuncu ve sunucu verileri
 */
async function fetchUptimeData(serverStatsUrl) {
  try {
    const response = await axios.get(serverStatsUrl);
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

/**
 * Oyuncu çalışma süresi verilerini JSON dosyasında günceller
 * @param {string} uptimeFile - Çalışma süresi verilerinin kaydedileceği dosya yolu
 */
async function updateUptimeData(uptimeFile) {
  // Yapılandırma dosyasından sunucu istatistikleri URL'sini almamız gerekiyor
  // Bunu ana dosyadan parametre olarak geçirmeliyiz, şu an geçici olarak kod içinde bulunuyor
  const SERVER_STATS_URL = process.env.FS25_BOT_URL_SERVER_STATS;

  const uptimeData = await fetchUptimeData(SERVER_STATS_URL);
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
  const dirPath = path.dirname(uptimeFile);
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
  if (fs.existsSync(uptimeFile)) {
    try {
      currentData = JSON.parse(fs.readFileSync(uptimeFile, "utf8"));
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
      uptimeFile,
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
}

module.exports = {
  fetchUptimeData,
  updateUptimeData,
}; 