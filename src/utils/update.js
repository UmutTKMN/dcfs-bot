const fs = require("fs");
const path = require("path");
require("dotenv-flow").config();

const dbPath = process.env.FS25_BOT_DB_PATH || "../data/fs25_bot.json";
if (!dbPath) {
  console.error(
    "❌ Veritabanı yolu tanımlanmadı. Lütfen .env dosyasını kontrol edin."
  );
  process.exit(1);
}

const {
  getDataFromAPI,
  parseData,
  getDefaultDatabase,
  fixColorCodes,
} = require("./utils");

/**
 * Veritabanı dosyasını günceller
 * Farming Simulator sunucusundan veri çeker ve veritabanı dosyasına yazar
 */
const update = async () => {
  console.log("Veritabanı güncelleniyor...");
  try {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`✅ Dizin oluşturuldu: ${dbDir}`);
    }
    const rawData = await getDataFromAPI();
    if (rawData?.serverData && typeof rawData.serverData === "string")
      rawData.serverData = fixColorCodes(rawData.serverData);
    if (
      rawData?.careerSaveGameData &&
      typeof rawData.careerSaveGameData === "string"
    )
      rawData.careerSaveGameData = fixColorCodes(rawData.careerSaveGameData);
    const data = parseData(rawData);
    const toWrite = data || getDefaultDatabase();
    fs.writeFileSync(dbPath, JSON.stringify(toWrite, null, 2), "utf8");
    if (data) {
      console.log("✅ Veritabanı yazıldı");
    } else {
      console.log(
        "⚠️ Sunucu çevrimdışı görünüyor, varsayılan veritabanı oluşturuldu"
      );
    }
  } catch (e) {
    console.error("❌ Güncelleme işlemi sırasında hata:", e);
    try {
      fs.writeFileSync(
        dbPath,
        JSON.stringify(getDefaultDatabase(), null, 2),
        "utf8"
      );
      console.log("⚠️ Hata oluştu, varsayılan veritabanı oluşturuldu");
    } catch (writeError) {
      console.error("❌ Varsayılan veritabanı yazılamadı:", writeError);
    }
  }
};

// Güncelleme işlemini çalıştır ve hataları düzgün şekilde yönet
update()
  .then(() => {
    console.log("✅ Güncelleme başarıyla tamamlandı");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Güncelleme başarısız:", error);
    process.exit(1);
  });
