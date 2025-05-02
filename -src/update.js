const fs = require('fs');
const path = require('path');
require('dotenv-flow').config();

const dbPath = process.env.FS25_BOT_DB_PATH || './data/fs25_bot.json';

const {
  getDataFromAPI,
  parseData,
  getDefaultDatabase,
  fixColorCodes,
} = require('./utils/utils');

/**
 * Veritabanı dosyasını günceller
 * Farming Simulator sunucusundan veri çeker ve veritabanı dosyasına yazar
 */
const update = async () => {
  console.log('Veritabanı güncelleniyor...');
  
  try {
    // Veritabanı dizininin varlığını kontrol et ve oluştur
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`✅ Dizin oluşturuldu: ${dbDir}`);
    }
    
    // Veriyi çek ve işle
    const rawData = await getDataFromAPI();
    
    // Renk kodu düzeltme işlemini uygula
    if (rawData && rawData.serverData && typeof rawData.serverData === 'string') {
      rawData.serverData = fixColorCodes(rawData.serverData);
    }
    if (rawData && rawData.careerSaveGameData && typeof rawData.careerSaveGameData === 'string') {
      rawData.careerSaveGameData = fixColorCodes(rawData.careerSaveGameData);
    }
    
    const data = parseData(rawData);
    
    if (data) {
      fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
      console.log('✅ Veritabanı yazıldı');
    } else {
      // Sunucu çevrimdışı görünüyorsa varsayılan veritabanı oluştur
      const defaultData = getDefaultDatabase();
      fs.writeFileSync(dbPath, JSON.stringify(defaultData, null, 2), 'utf8');
      console.log('⚠️ Sunucu çevrimdışı görünüyor, varsayılan veritabanı oluşturuldu');
    }
  } catch (e) {
    console.error('❌ Güncelleme işlemi sırasında hata:', e);
    
    // Hata durumunda varsayılan veritabanı oluşturmayı dene
    try {
      const defaultData = getDefaultDatabase();
      fs.writeFileSync(dbPath, JSON.stringify(defaultData, null, 2), 'utf8');
      console.log('⚠️ Hata oluştu, varsayılan veritabanı oluşturuldu');
    } catch (writeError) {
      console.error('❌ Varsayılan veritabanı yazılamadı:', writeError);
    }
  }
};

// Güncelleme işlemini çalıştır ve hataları düzgün şekilde yönet
update()
  .then(() => {
    console.log('✅ Güncelleme başarıyla tamamlandı');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Güncelleme başarısız:', error);
    process.exit(1);
  });
