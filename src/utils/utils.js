if (process.env.FS25_BOT_DISABLE_CERTIFICATE_VERIFICATION === "true") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;
}

const _ = require("lodash");
const convert = require("xml-js");
const fetch = require("fetch-retry")(global.fetch);
const axios = require("axios");
const fs = require("fs");
const xml2js = require("xml2js");

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
  }
};

const retries = ConfigUtils.getNumber("FS25_BOT_FETCH_RETRIES", 3, 1);
const retryDelay = ConfigUtils.getNumber("FS25_BOT_FETCH_RETRY_DELAY_MS", 2000, 1);

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
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}s ${mins}dk`;
  },

  getDataFromAPI: async (serverStatsUrl, careerSavegameUrl) => {
    try {
      // Get server data
      const serverPromise = axios.get(serverStatsUrl);
      // Get career savegame data
      const careerPromise = axios.get(careerSavegameUrl);

      // Wait for both promises
      const [serverRes, careerRes] = await Promise.all([
        serverPromise,
        careerPromise,
      ]);

      return {
        serverData: serverRes.data,
        careerSaveGameData: careerRes.data,
      };
    } catch (error) {
      console.error("❌ Sunucu verisi alınırken hata:", error.message);
      throw error;
    }
  },

  parseData: (data, previousServer) => {
    if (!data) {
      return null;
    }

    try {
      let serverData;
      let parsedServer = {};

      // Parse server data
      if (data.serverData) {
        try {
          serverData = xml2js.parseStringSync(data.serverData, {
            explicitArray: false,
          });
          
          // Basic server info
          parsedServer = {
            name:
              (serverData.Server && serverData.Server.$.name) ||
              previousServer.name,
            mapName:
              (serverData.Server && serverData.Server.$.mapName) ||
              previousServer.mapName,
            game:
              (serverData.Server && serverData.Server.$.gameName) ||
              previousServer.game,
            version:
              (serverData.Server && serverData.Server.$.version) ||
              previousServer.version,
            online: true,
            unreachable: false,
          };

          // Parse mods
          let mods = {};
          if (serverData.Server && serverData.Server.Mods && serverData.Server.Mods.Mod) {
            // Handle single mod vs array of mods
            const modsArr = Array.isArray(serverData.Server.Mods.Mod)
              ? serverData.Server.Mods.Mod
              : [serverData.Server.Mods.Mod];

            modsArr.forEach((mod) => {
              mods[mod.$.name] = {
                name: mod.$.name,
                title: mod.$.title,
                version: mod.$.version,
              };
            });
          }

          // Parse career savegame data
          let careerSavegame = {
            money: 0,
            playTime: 0,
          };

          if (data.careerSaveGameData) {
            try {
              const careerData = xml2js.parseStringSync(data.careerSaveGameData, {
                explicitArray: false,
              });
              if (careerData.CareerSavegame) {
                careerSavegame = {
                  money: parseInt(careerData.CareerSavegame.$.money || "0", 10),
                  playTime: parseInt(careerData.CareerSavegame.$.playTime || "0", 10),
                };
              }
            } catch (e) {
              console.error("❌ Kariyer verisi ayrıştırma hatası:", e.message);
            }
          }

          return {
            server: parsedServer,
            mods: mods,
            careerSavegame: careerSavegame,
          };
        } catch (e) {
          console.error("❌ Sunucu verisi ayrıştırma hatası:", e.message);
          return null;
        }
      }
    } catch (e) {
      console.error("❌ Veri ayrıştırma hatası:", e.message);
      return null;
    }

    return null;
  },

  getModString: (newData, previousMods, isDlc) => {
    let modString = "";
    const newMods = newData.mods;
    
    // Select the right type of mods based on isDlc
    const isCorrectModType = (modName) => 
      isDlc ? modName.startsWith("pdlc_") : !modName.startsWith("pdlc_");
    
    // Find added mods
    const addedMods = Object.values(newMods).filter(
      ({ name: modName }) => 
        isCorrectModType(modName) && !previousMods[modName]
    );
    
    // Find removed mods
    const removedMods = Object.values(previousMods).filter(
      ({ name: modName }) => 
        isCorrectModType(modName) && !newMods[modName]
    );
    
    // Generate message for added mods
    if (addedMods.length > 0) {
      modString += `**Eklenen ${isDlc ? "DLC" : "Mod"}${addedMods.length > 1 ? "'ler" : ""}:**\n`;
      addedMods.forEach(({ title }) => {
        modString += `➕ ${title}\n`;
      });
    }
    
    // Generate message for removed mods
    if (removedMods.length > 0) {
      modString += `**Kaldırılan ${isDlc ? "DLC" : "Mod"}${removedMods.length > 1 ? "'ler" : ""}:**\n`;
      removedMods.forEach(({ title }) => {
        modString += `➖ ${title}\n`;
      });
    }
    
    return modString;
  },

  /**
   * XML içindeki renk kodlarını düzeltir
   * @param {string} xmlString - XML içeriği
   * @returns {string} - Düzeltilmiş XML içeriği
   */
  fixColorCodes: (xmlString) => {
    if (!xmlString) return xmlString;
    // Fix color codes in XML to prevent parsing errors
    return xmlString.replace(/&([^;]+);/g, "&amp;$1;");
  },
};

module.exports = utils;