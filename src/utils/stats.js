const fs = require("fs");
const { EmbedBuilder } = require("discord.js");
const { formatMinutes } = require("./utils");

/**
 * Belirli bir saatte günlük mesaj gönderimini planla
 * @param {number} hour - Saat (0-23)
 * @param {number} minute - Dakika (0-59)
 * @param {Function} callback - Çalıştırılacak fonksiyon
 */
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
 * Oyuncuların çalışma süresi istatistiklerini Discord'a gönder
 * @param {string} uptimeFile - Çalışma süresi verileri dosya yolu
 * @param {object} client - Discord istemcisi
 * @param {string} channelId - Mesajın gönderileceği kanal ID'si
 */
function sendUptimeStats(uptimeFile, client, channelId) {
  if (!fs.existsSync(uptimeFile)) {
    console.error(
      `❌ Çalışma süresi dosyası bulunamadı: ${uptimeFile}`
    );
    return;
  }

  fs.readFile(uptimeFile, "utf8", (err, data) => {
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
      const channel = client.channels.cache.get(channelId);
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
          channelId
        );
      }
    } catch (parseError) {
      console.error("❌ JSON ayrıştırma hatası:", parseError.message);
    }
  });
}

module.exports = {
  scheduleDailyMessage,
  sendUptimeStats,
}; 