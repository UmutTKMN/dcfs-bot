const { ChannelType, PermissionsBitField } = require("discord.js");
const { formatMinutes } = require("./utils");

/**
 * Sunucu güncellemelerinden mesaj içeriği oluştur
 * @param {Object} newData - Yeni sunucu verileri
 * @param {Object} previousServer - Önceki sunucu durumu
 * @param {Object} previousMods - Önceki mod listesi
 * @param {Object} previousCareerSavegame - Önceki kariyer kayıt durumu
 * @param {Object} config - Yapılandırma ayarları
 * @returns {string|null} Mesaj içeriği veya değişiklik yoksa null
 */
const getUpdateString = (
  newData,
  previousServer,
  previousMods,
  previousCareerSavegame,
  config
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

  // Sunucu bilgi değişiklikleri
  const { getModString } = require("./utils");
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

  // Kariyer kayıt değişiklikleri
  if (!config.DISABLE_SAVEGAME_MESSAGES) {
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
      string += `<a:pixel_clock:1319030004411273297> **Geçirilen Zaman:** *${formatMinutes(
        playTime
      )}*.\n`;
    }
  }

  return string.trim() || null;
};

/**
 * Discord kanallarına mesaj gönder
 * @param {string} message - Gönderilecek mesaj
 * @param {object} client - Discord istemcisi
 * @param {object} config - Yapılandırma ayarları
 */
const sendMessage = (message, client, config) => {
  if (!message) return;

  client.channels.cache
    .filter(
      (channel) =>
        (!config.DISCORD_SERVER_NAME ||
          channel.guild.name === config.DISCORD_SERVER_NAME) &&
        (!config.DISCORD_CHANNEL_NAME ||
          channel.name === config.DISCORD_CHANNEL_NAME) &&
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

/**
 * Sunucu durum mesajını belirli bir kanala gönder
 * @param {string} status - Sunucu durumu ("online" veya "offline")
 * @param {string} channelId - Mesajın gönderileceği kanal ID'si
 * @param {object} client - Discord istemcisi
 */
const sendServerStatusMessage = (status, channelId, client) => {
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

module.exports = {
  getUpdateString,
  sendMessage,
  sendServerStatusMessage,
}; 