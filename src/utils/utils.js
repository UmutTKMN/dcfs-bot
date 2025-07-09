if (process.env.FS25_BOT_DISABLE_CERTIFICATE_VERIFICATION === "true") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;
}

const _ = require("lodash");
const convert = require("xml-js");
const fetch = require("fetch-retry")(global.fetch);

const ConfigUtils = {
  getNumber: (envVar, defaultValue = 0, minValue = null) => {
    const value = parseInt(process.env[envVar], 10) || defaultValue;
    return minValue !== null ? Math.max(value, minValue) : value;
  },

  getString: (envVar, defaultValue = "") => {
    return process.env[envVar] || defaultValue;
  },

  getBoolean: (envVar, defaultValue = false) => {
    if (process.env[envVar] === undefined) return defaultValue;
    return process.env[envVar] === "true";
  },
};

const retries = ConfigUtils.getNumber("FS25_BOT_FETCH_RETRIES", 3, 1);
const retryDelay = ConfigUtils.getNumber(
  "FS25_BOT_FETCH_RETRY_DELAY_MS",
  2000,
  1
);

const utils = {
  getDefaultDatabase: () =>
    _.cloneDeep({
      server: {
        game: "",
        version: "",
        name: "",
        mapName: "",
        online: false,
        unreachable: false,
      },
      mods: {},
      careerSavegame: {
        money: 0,
        playTime: 0,
      },
    }),

  getTimestamp: () => `<t:${Math.floor(new Date().getTime() / 1000)}>`,

  formatMinutes: (minutes) => {
    const remainingDays = Math.floor(minutes / 1440);
    const remainingHours = Math.floor((minutes % 1440) / 60);
    const remainingMinutes = minutes % 60;

    let string = "";
    if (remainingDays > 0) {
      string += `${remainingDays} gün `;
    }
    if (remainingDays > 0 || remainingHours > 0) {
      string += `${remainingHours} saat `;
    }
    return `${string}${remainingMinutes} dakika`;
  },

  getDataFromAPI: async () => {
    const errors = [];

    try {
      console.log("🔄 API verisi alınıyor...");
      
      // Her endpoint için ayrı ayrı kontrol et
      const serverStatsUrl = process.env.FS25_BOT_URL_SERVER_STATS;
      const careerSavegameUrl = process.env.FS25_BOT_URL_CAREER_SAVEGAME;
      
      console.log(`📡 Server Stats URL: ${serverStatsUrl}`);
      console.log(`📡 Career Savegame URL: ${careerSavegameUrl}`);

      const [serverStatsResponse, careerSavegameResponse] = await Promise.all([
        fetch(serverStatsUrl, {
          retries,
          retryDelay,
          body: null,
          method: "GET",
          timeout: 15000, // 15 saniye timeout (artırıldı)
          headers: {
            'User-Agent': 'FS25-Discord-Bot/1.0',
            'Accept': 'application/xml, text/xml, */*'
          }
        }).catch(err => {
          console.error("❌ Server stats fetch hatası:", err.message);
          console.error("📊 Hata detayları:", err.stack);
          errors.push(`Server stats API hatası: ${err.message} (URL: ${serverStatsUrl})`);
          return null;
        }),
        fetch(careerSavegameUrl, {
          retries,
          retryDelay,
          body: null,
          method: "GET",
          timeout: 15000, // 15 saniye timeout (artırıldı)
          headers: {
            'User-Agent': 'FS25-Discord-Bot/1.0',
            'Accept': 'application/xml, text/xml, */*'
          }
        }).catch(err => {
          console.error("❌ Career savegame fetch hatası:", err.message);
          console.error("📊 Hata detayları:", err.stack);
          errors.push(`Career savegame API hatası: ${err.message} (URL: ${careerSavegameUrl})`);
          return null;
        })
      ]);

      if (!serverStatsResponse || !careerSavegameResponse) {
        const errorMessage = `API yanıt hatası: ${errors.join(", ")}`;
        console.error(`❌ ${errorMessage}`);
        throw new Error(errorMessage);
      }

      console.log(`✅ Server stats status: ${serverStatsResponse.status}`);
      console.log(`✅ Career savegame status: ${careerSavegameResponse.status}`);

      // HTTP durum kodlarını kontrol et
      if (!serverStatsResponse.ok) {
        const errorMsg = `Server stats HTTP ${serverStatsResponse.status}: ${serverStatsResponse.statusText}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      }

      if (!careerSavegameResponse.ok) {
        const errorMsg = `Career savegame HTTP ${careerSavegameResponse.status}: ${careerSavegameResponse.statusText}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
      }

      if (errors.length > 0) {
        const errorMessage = `HTTP hataları: ${errors.join(", ")}`;
        console.error(`❌ ${errorMessage}`);
        throw new Error(errorMessage);
      }

      // XML içeriğini al
      const [serverStatsXml, careerSavegameXml] = await Promise.all([
        serverStatsResponse.text().catch(err => {
          console.error("❌ Server stats XML okuma hatası:", err.message);
          console.error("📊 Response headers:", Object.fromEntries(serverStatsResponse.headers));
          errors.push(`Server stats XML okuma hatası: ${err.message}`);
          return null;
        }),
        careerSavegameResponse.text().catch(err => {
          console.error("❌ Career savegame XML okuma hatası:", err.message);
          console.error("📊 Response headers:", Object.fromEntries(careerSavegameResponse.headers));
          errors.push(`Career savegame XML okuma hatası: ${err.message}`);
          return null;
        })
      ]);

      if (!serverStatsXml || !careerSavegameXml) {
        const errorMessage = `XML okuma hataları: ${errors.join(", ")}`;
        console.error(`❌ ${errorMessage}`);
        throw new Error(errorMessage);
      }

      // XML içeriğini doğrula
      if (serverStatsXml.length === 0) {
        console.error("❌ Server stats XML boş");
        errors.push("Server stats XML boş");
      }
      
      if (careerSavegameXml.length === 0) {
        console.error("❌ Career savegame XML boş");
        errors.push("Career savegame XML boş");
      }

      // XML içeriğini logla (kısaltılmış)
      console.log("📄 Server stats XML (ilk 200 karakter):", serverStatsXml.substring(0, 200));
      console.log("📄 Career savegame XML (ilk 200 karakter):", careerSavegameXml.substring(0, 200));

      // XML'i JSON'a dönüştür
      let serverStats, careerSavegame;

      try {
        serverStats = JSON.parse(convert.xml2json(serverStatsXml, { compact: true, ignoreComment: true, ignoreInstruction: true }));
        console.log("✅ Server stats XML başarıyla parse edildi");
      } catch (xmlError) {
        console.error("❌ Server stats XML parse hatası:", xmlError.message);
        console.error("📊 Problematik XML (ilk 500 karakter):", serverStatsXml.substring(0, 500));
        errors.push(`Server stats XML parse hatası: ${xmlError.message}`);
      }

      try {
        careerSavegame = JSON.parse(convert.xml2json(careerSavegameXml, { compact: true, ignoreComment: true, ignoreInstruction: true }));
        console.log("✅ Career savegame XML başarıyla parse edildi");
      } catch (xmlError) {
        console.error("❌ Career savegame XML parse hatası:", xmlError.message);
        console.error("📊 Problematik XML (ilk 500 karakter):", careerSavegameXml.substring(0, 500));
        errors.push(`Career savegame XML parse hatası: ${xmlError.message}`);
      }

      if (errors.length > 0) {
        const errorMessage = `XML parse hataları: ${errors.join(", ")}`;
        console.error(`❌ ${errorMessage}`);
        throw new Error(errorMessage);
      }

      console.log("✅ Tüm API verileri başarıyla alındı ve parse edildi");
      return {
        serverStats,
        careerSavegame,
      };

    } catch (error) {
      console.error("❌ getDataFromAPI genel hatası:", error.message);
      console.error("📊 Hata stack:", error.stack);
      
      // Hata tipine göre daha açıklayıcı mesaj
      let detailedError = `API veri alma hatası: ${error.message}`;
      
      if (error.message.includes('timeout')) {
        detailedError += " (Sunucu yanıt verme süresini aştı)";
      } else if (error.message.includes('ECONNRESET')) {
        detailedError += " (Bağlantı resetlendi)";
      } else if (error.message.includes('ENOTFOUND')) {
        detailedError += " (Sunucu bulunamadı)";
      } else if (error.message.includes('certificate')) {
        detailedError += " (SSL sertifika hatası)";
      }
      
      throw new Error(detailedError);
    }
  },

  parseData: ({ serverStats, careerSavegame: savegame }, previousServer) => {
    try {
      console.log("🔍 Veri parse ediliyor...");

      // Temel doğrulama
      if (!serverStats) {
        console.error("❌ serverStats verisi bulunamadı");
        return null;
      }

      if (!savegame) {
        console.error("❌ careerSavegame verisi bulunamadı");
        return null;
      }

      // Server verilerini kontrol et
      const serverAttributes = serverStats?.Server?._attributes;
      if (!serverAttributes) {
        console.error("❌ Server._attributes bulunamadı");
        console.log("📊 Mevcut serverStats yapısı:", JSON.stringify(serverStats, null, 2).substring(0, 500));
        return null;
      }

      const server = {
        game: serverAttributes.game || previousServer?.game || "Farming Simulator 25",
        version: serverAttributes.version || previousServer?.version || "Bilinmiyor",
        name: serverAttributes.name || previousServer?.name || "Bilinmiyor",
        mapName: serverAttributes.mapName || previousServer?.mapName || "Bilinmiyor",
        online: true,
        unreachable: false,
      };

      console.log("✅ Server bilgileri parse edildi:", server);

      // Mod verilerini parse et
      let mods = {};
      if (serverStats.Server?.Mods?.Mod !== undefined) {
        const modData = serverStats.Server.Mods.Mod;
        const modArray = Array.isArray(modData) ? modData : [modData];

        mods = modArray
          .filter(mod => mod && mod._attributes) // Geçersiz modları filtrele
          .map((mod) => ({
            hash: mod._attributes.hash || "",
            text: mod._text || mod._attributes.name || "Bilinmiyor",
            name: mod._attributes.name || "",
            version: mod._attributes.version || "1.0.0.0",
            author: mod._attributes.author || "Bilinmiyor",
          }))
          .reduce((obj, item) => {
            if (item.hash) { // Sadece hash'i olan modları ekle
              obj[item.hash] = item;
            }
            return obj;
          }, {});
      }

      console.log(`✅ ${Object.keys(mods).length} mod parse edildi`);

      // Kariyer save verilerini parse et
      let careerSavegameData = {
        money: 0,
        playTime: 0,
      };

      if (savegame?.careerSavegame?.statistics) {
        const stats = savegame.careerSavegame.statistics;
        careerSavegameData = {
          money: parseInt(stats.money?._text || stats.money || 0, 10),
          playTime: parseInt(stats.playTime?._text || stats.playTime || 0, 10),
        };
      }

      console.log("✅ Kariyer verileri parse edildi:", careerSavegameData);

      return {
        server,
        mods,
        careerSavegame: careerSavegameData,
      };

    } catch (error) {
      console.error("❌ parseData hatası:", error.message);
      console.error("📊 Hata detayları:", error.stack);
      return null;
    }
  },

  getModString(newData, previousMods, dlc) {
    const characterLimit = dlc ? 300 : 1200;
    const modType = dlc ? "DLC" : "mod";
    const emoji = dlc ? ":cd:" : ":joystick:";

    const filteredNew = Object.fromEntries(
      Object.entries(newData.mods).filter(([, { name: modName }]) =>
        dlc ? modName.startsWith("pdlc_") : !modName.startsWith("pdlc_")
      )
    );
    const filteredPrevious = Object.fromEntries(
      Object.entries(previousMods).filter(([, { name: modName }]) =>
        dlc ? modName.startsWith("pdlc_") : !modName.startsWith("pdlc_")
      )
    );

    let string = "";

    const newMods = [];
    const updatedMods = [];
    Object.values(filteredNew)
      .sort((modA, modB) =>
        modA.text.toLowerCase().localeCompare(modB.text.toLowerCase())
      )
      .forEach((mod) => {
        if (!Object.prototype.hasOwnProperty.call(filteredPrevious, mod.hash)) {
          if (
            Object.values(filteredPrevious)
              .map(({ name: modName }) => modName)
              .includes(mod.name)
          ) {
            updatedMods.push(mod);
          } else {
            newMods.push(mod);
          }
        }
      });

    const removedMods = [];
    Object.values(filteredPrevious)
      .sort((modA, modB) =>
        modA.text.toLowerCase().localeCompare(modB.text.toLowerCase())
      )
      .forEach((mod) => {
        if (!Object.prototype.hasOwnProperty.call(filteredNew, mod.hash)) {
          if (
            !Object.values(updatedMods)
              .map(({ name: modName }) => modName)
              .includes(mod.name)
          ) {
            removedMods.push(mod);
          }
        }
      });

    let tempModsString = "";
    if (newMods.length > 0) {
      tempModsString += `${emoji} Sunucuya **${newMods.length}** ${modType} yüklendi; \n`;
      newMods.forEach(({ text, version: modVersion, author }) => {
        tempModsString += `- **${text} ${modVersion}** by ${author}\n`;
      });
    }

    if (updatedMods.length > 0) {
      tempModsString += `${emoji} Sunucuda **${updatedMods.length}** ${modType} güncellendi; \n`;
      updatedMods.forEach(({ text, version: modVersion, author }) => {
        tempModsString += `- **${text} ${modVersion}** by ${author}\n`;
      });
    }

    if (removedMods.length > 0) {
      tempModsString += `${emoji} Sunucudan **${removedMods.length}** ${modType} kaldırıldı; \n`;
      removedMods.forEach(({ text, version: modVersion, author }) => {
        tempModsString += `- **${text} ${modVersion}** by ${author}\n`;
      });
    }

    if (tempModsString.length > 0) {
      if (tempModsString.length <= characterLimit) {
        string += tempModsString;
      } else {
        if (newMods.length > 0) {
          string += `Sunucuya **${newMods.length}** ${modType} yüklendi.\n`;
        }
        if (updatedMods.length > 0) {
          string += `Sunucuda **${updatedMods.length}** ${modType} güncellendi.\n`;
        }
        if (removedMods.length > 0) {
          string += `Sunucudan **${removedMods.length}** ${modType} kaldırıldı.\n`;
        }
      }
    }

    return string;
  },

  /**
   * Sunucu durumunu kontrol eder
   * @param {string} url - Kontrol edilecek URL
   * @return {Promise<boolean>} - Sunucu erişilebilir mi?
   */
  checkServerStatus: async (url) => {
    try {
      const response = await fetch(url, {
        method: "HEAD",
        timeout: 5000,
      });
      return response.ok;
    } catch (error) {
      console.error(`❌ Sunucu durumu kontrol hatası (${url}):`, error.message);
      return false;
    }
  },

  /**
   * Güvenli sayı parse etme
   * @param {any} value - Parse edilecek değer
   * @param {number} defaultValue - Varsayılan değer
   * @return {number} - Parse edilmiş sayı
   */
  safeParseInt: (value, defaultValue = 0) => {
    if (value === null || value === undefined) return defaultValue;

    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  },
};

module.exports = utils;