const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('temizle')
    .setDescription('Kanal mesajlarını temizle')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction) {
    if (!interaction.member.permissions.has('ManageMessages')) {
      return await interaction.reply({ content: 'Bu komutu kullanmak için mesajları yönet iznine sahip olmalısın.', ephemeral: true });
    }
    // Menü oluştur
    const menu = new StringSelectMenuBuilder()
      .setCustomId('temizle_menu')
      .setPlaceholder('Silinecek mesaj sayısını seçin')
      .addOptions([
        { label: '10 Mesaj', value: '10' },
        { label: '50 Mesaj', value: '50' },
        { label: '100 Mesaj', value: '100' },
        { label: 'Bu kanaldaki her şey', value: 'all', description: 'Kanalda silinebilen tüm mesajlar' },
      ]);
    const row = new ActionRowBuilder().addComponents(menu);
    await interaction.reply({ content: 'Kaç mesaj silinsin?', components: [row], ephemeral: true });

    // Menü 15 saniye sonra devre dışı bırakılır
    setTimeout(async () => {
      try {
        await interaction.editReply({
          content: 'İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.',
          components: []
        });
      } catch (e) {
        // Zaten yanıtlandıysa hata oluşabilir, görmezden gel
      }
    }, 15000);
  },
  // Menüden seçim yapılınca çalışacak handler
  async handleSelect(interaction) {
    if (!interaction.member.permissions.has('ManageMessages')) {
      return await interaction.reply({ content: 'Bu işlemi yapmak için mesajları yönet iznine sahip olmalısın.', ephemeral: true });
    }
    const value = interaction.values[0];
    let deletedCount = 0;
    try {
      if (value === 'all') {
        let deleted;
        do {
          deleted = await interaction.channel.bulkDelete(100, true);
          deletedCount += deleted.size;
        } while (deleted.size === 100);
        await interaction.update({ content: `Kanalda toplam ${deletedCount} mesaj silindi.`, components: [] });
      } else {
        const count = parseInt(value, 10);
        const deleted = await interaction.channel.bulkDelete(count, true);
        await interaction.update({ content: `${deleted.size} mesaj silindi.`, components: [] });
      }
    } catch (err) {
      await interaction.update({ content: 'Mesajlar silinirken bir hata oluştu.', components: [] });
    }
  }
};