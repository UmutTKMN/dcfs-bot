const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("bot-test")
    .setDescription(
      "Botun temel işlevlerini ve kanal izinlerini test eder, bot hakkında bilgi raporu yayınlar."
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const { client, guild } = interaction;
    const results = [];
    // Test edilecek kanal ID'leri ve açıklamaları
    const testChannels = [
      { id: process.env.FS25_BOT_UPDATE_CHANNEL_ID, name: "Güncelleme Kanalı" },
      {
        id: process.env.FS25_BOT_DAILY_SUMMARY_CHANNEL_ID,
        name: "Günlük Özet Kanalı",
      },
      { id: process.env.FS25_BOT_MODS_CHANNEL_ID, name: "Modlar Kanalı" },
      {
        id: process.env.FS25_BOT_PLAYER_ACTIVITY_CHANNEL_ID,
        name: "Oyuncu Aktivite Kanalı",
      },
    ];
    for (const { id, name } of testChannels) {
      if (!id) continue;
      const channel = guild.channels.cache.get(id);
      if (!channel) {
        results.push(`❌ **${name}** (ID: ${id}) bulunamadı.`);
        continue;
      }
      // İzin testi
      const perms = channel.permissionsFor(guild.members.me);
      if (!perms.has("ViewChannel") || !perms.has("SendMessages")) {
        results.push(`❌ **${name}**: Botun mesaj gönderme/görme izni yok!`);
        continue;
      }
      try {
        await channel.send({
          content: `✅ Bot test mesajı: ${name} başarıyla çalışıyor! (${new Date().toLocaleString()})`,
        });
        results.push(`✅ **${name}**: Test mesajı gönderildi.`);
      } catch (e) {
        results.push(`❌ **${name}**: Mesaj gönderilemedi! (${e.message})`);
      }
    }
    // Bot hakkında genel bilgi
    const embed = new EmbedBuilder()
      .setColor("#2980b9")
      .setTitle("🤖 Bot Test ve Bilgilendirme Raporu")
      .setDescription(
        [
          `• Sunucu: **${guild.name}**`,
          `• Bot: **${client.user.tag}**`,
          `• Çalışma zamanı: <t:${Math.floor(client.readyTimestamp / 1000)}:R>`,
          `• Toplam komut: **${client.commands.size}**`,
          "",
          ...results,
        ].join("\n")
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
