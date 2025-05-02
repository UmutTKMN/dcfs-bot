const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('temizle')
    .setDescription('Belirtilen kadar son mesajı siler.')
    .addIntegerOption(option =>
      option.setName('sayi')
        .setDescription('Silinecek mesaj sayısı (1-100)')
        .setRequired(true)
    ),
  async execute(interaction) {
    const sayi = interaction.options.getInteger('sayi');
    if (!interaction.member.permissions.has('ManageMessages')) {
      return await interaction.reply({ content: 'Bu komutu kullanmak için mesajları yönet iznine sahip olmalısın.', ephemeral: true });
    }
    if (sayi < 1 || sayi > 100) {
      return await interaction.reply({ content: '1 ile 100 arasında bir sayı belirtmelisin.', ephemeral: true });
    }
    try {
      const deleted = await interaction.channel.bulkDelete(sayi, true);
      await interaction.reply({ content: `${deleted.size} mesaj silindi.`, ephemeral: true });
    } catch (err) {
      await interaction.reply({ content: 'Mesajlar silinirken bir hata oluştu.', ephemeral: true });
    }
  },
};