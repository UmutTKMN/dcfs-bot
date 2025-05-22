const { SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("resim-ekle")
    .setDescription("Galeriye yeni bir resim ekle")
    .addAttachmentOption((option) =>
      option
        .setName("resim")
        .setDescription("Yüklenecek resim")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("aciklama")
        .setDescription("Resim açıklaması (isteğe bağlı)")
        .setRequired(false)
    ),
  async execute(interaction) {
    // SADECE BELİRLİ ROL KULLANABİLSİN
    const YETKILI_ROL_ID = "786707483594719272"; // Buraya izin verilen rolün ID'sini yaz
    if (!interaction.member.roles.cache.has(YETKILI_ROL_ID)) {
      return interaction.reply({
        content: "Bu komutu kullanmak için yetkiniz yok.",
        ephemeral: true,
      });
    }

    const attachment = interaction.options.getAttachment("resim");
    const caption = interaction.options.getString("aciklama") || "";
    if (!attachment || !attachment.url) {
      return interaction.reply({
        content: "Resim bulunamadı.",
        ephemeral: true,
      });
    }
    // Sadece jpg/png izin ver
    if (!attachment.contentType.startsWith("image/")) {
      return interaction.reply({
        content: "Sadece resim dosyası yükleyebilirsin.",
        ephemeral: true,
      });
    }
    const ext = path.extname(attachment.name).toLowerCase();
    if (![".jpg", ".jpeg", ".png"].includes(ext)) {
      return interaction.reply({
        content: "Sadece JPG veya PNG dosyası yükleyebilirsin.",
        ephemeral: true,
      });
    }
    // Dosya adını benzersiz yap
    const fileName = `gallery_${Date.now()}${ext}`;
    const filePath = path.join(__dirname, "../data/assets", fileName);
    // Resmi indir
    const res = await fetch(attachment.url);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    // Galeri JSON güncelle
    const galleryJsonPath = path.join(__dirname, "../data/fs25_gallery.json");
    let gallery = [];
    if (fs.existsSync(galleryJsonPath)) {
      try {
        gallery = JSON.parse(fs.readFileSync(galleryJsonPath, "utf8"));
      } catch {}
    }
    gallery.push({ src: `./assets/${fileName}`, caption });
    fs.writeFileSync(galleryJsonPath, JSON.stringify(gallery, null, 2), "utf8");
    await interaction.reply({
      content: "Resim başarıyla galeriye eklendi!",
      ephemeral: false,
    });
  },
};
