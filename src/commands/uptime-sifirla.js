const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const fs = require("fs");
const path = require("path");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("uptime-sifirla")
    .setDescription(
      "Tüm oyuncu çalışma süresi verilerini sıfırlar ve yeni dönem başlatır!"
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    // Yalnızca adminler kullanabilsin
    if (
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return await interaction.reply({
        content: "Bu komutu sadece yöneticiler kullanabilir.",
        ephemeral: true,
      });
    }
    const uptimePath = path.join(__dirname, "../../data/uptime_data.json");
    // Yedekle
    if (fs.existsSync(uptimePath)) {
      const backupPath =
        uptimePath + ".bak_" + new Date().toISOString().replace(/[:.]/g, "-");
      fs.copyFileSync(uptimePath, backupPath);
    }
    // Sıfırla
    const newData = { players: {} };
    fs.writeFileSync(uptimePath, JSON.stringify(newData, null, 2), "utf8");

    // Duyuru mesajı
    const embed = new EmbedBuilder()
      .setColor("#43b581")
      .setTitle("⏱️ Yeni Dönem Başladı!")
      .setDescription(
        "Oyuncu çalışma süresi (uptime) verileri sıfırlandı ve yeni bir dönem başlatıldı! Artık tüm oyuncular eşit şekilde sıfırdan başlayacak. İyi oyunlar!"
      )
      .setTimestamp();

    // Duyuruyu uptime verilerinin paylaşıldığı kanala gönder
    const channelId = process.env.FS25_BOT_DAILY_SUMMARY_CHANNEL_ID;
    const channel = interaction.guild.channels.cache.get(channelId) || interaction.channel;
    await channel.send({ embeds: [embed] });

    // Son olarak komutu kullanan kişiye bilgi ver
    await interaction.reply({
      content:
        "Uptime verileri sıfırlandı ve yeni dönem başlatıldı. Duyuru paylaşıldı.",
      ephemeral: true,
    });
  },
};
