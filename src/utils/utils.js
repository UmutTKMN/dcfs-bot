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

  getDataFromAPI: () =>
    Promise.all([
      fetch(process.env.FS25_BOT_URL_SERVER_STATS, {
        retries,
        retryDelay,
        body: null,
        method: "GET",
      }),
      fetch(process.env.FS25_BOT_URL_CAREER_SAVEGAME, {
        retries,
        retryDelay,
        body: null,
        method: "GET",
      }),
    ])
      .then(([serverStatsResponse, careerSavegameResponse]) =>
        Promise.all([serverStatsResponse.text(), careerSavegameResponse.text()])
      )
      .then(([serverStatsXml, careerSavegameXml]) => ({
        serverStats: JSON.parse(
          convert.xml2json(serverStatsXml, { compact: true })
        ),
        careerSavegame: JSON.parse(
          convert.xml2json(careerSavegameXml, { compact: true })
        ),
      })),

  parseData: ({ serverStats, careerSavegame: savegame }, previousServer) => {
    if (!serverStats || !serverStats?.Server?._attributes || !savegame) {
      return null;
    }

    const server = {
      game: serverStats.Server._attributes.game || previousServer.game,
      version: serverStats.Server._attributes.version || previousServer.version,
      name: serverStats.Server._attributes.name || previousServer.name,
      mapName: serverStats.Server._attributes.mapName || previousServer.mapName,
      online: true,
      unreachable: false,
    };

    let mods = {};
    if (serverStats.Server?.Mods?.Mod !== undefined) {
      mods = (
        Array.isArray(serverStats.Server.Mods.Mod)
          ? serverStats.Server.Mods.Mod
          : [serverStats.Server.Mods.Mod]
      )
        .map((mod) => ({
          hash: mod._attributes.hash,
          text: mod._text,
          name: mod._attributes.name,
          version: mod._attributes.version,
          author: mod._attributes.author,
        }))
        .reduce((obj, item) => Object.assign(obj, { [item.hash]: item }), {});
    }

    const careerSavegame = {
      money: parseInt(savegame.careerSavegame.statistics.money._text || 0, 10),
      playTime: parseInt(
        savegame.careerSavegame.statistics.playTime._text || 0,
        10
      ),
    };

    return {
      server,
      mods,
      careerSavegame,
    };
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
   * Geçersiz HEX renk kodlarını düzeltir
   * @param {string} str - Kontrol edilecek metin
   * @return {string} - Düzeltilmiş metin
   */
  fixColorCodes: (str) => {
    if (!str || typeof str !== 'string') return str;
    
    // 5 karakterli HEX renk kodlarını 6 karakterli formata dönüştür (#24a5b -> #24a5b0)
    return str.replace(/#([0-9a-fA-F]{5})\b/g, (match, p1) => {
      console.log(`⚠️ Geçersiz renk kodu düzeltiliyor: ${match} -> #${p1}0`);
      return `#${p1}0`;
    });
  },
};

module.exports = utils;