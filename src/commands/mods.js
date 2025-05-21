const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mods')
    .setDescription('Tüm aktif modları indirmen için bağlantı gönderir.'),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#43b581')
      .setTitle('Tüm Aktif Modları İndir')
      .setDescription('Aşağıdaki butona tıklayarak sunucudaki tüm aktif modları tek tıkla indirebilirsin.');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Tıkla & İndir')
        .setStyle(ButtonStyle.Link)
        .setURL('https://gs-85-14-206-57.server.4netplayers.com:20820/all_mods_download?onlyActive=true')
    );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  },
};
