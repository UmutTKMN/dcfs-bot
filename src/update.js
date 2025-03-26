const fs = require('fs');
const path = require('path');
require('dotenv-flow').config();

const dbPath = process.env.FS25_BOT_DB_PATH;

const {
  getDataFromAPI,
  parseData,
  getDefaultDatabase,
} = require('./utils/utils');

const update = async () => {
  console.log('Updating ...');
  
  try {
    // Ensure database directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`Created directory: ${dbDir}`);
    }
    
    // Get and process data
    const rawData = await getDataFromAPI();
    const data = parseData(rawData);
    
    if (data) {
      fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
      console.log('Database written');
    } else {
      // Create default database if server appears offline
      const defaultData = getDefaultDatabase();
      fs.writeFileSync(dbPath, JSON.stringify(defaultData, null, 2), 'utf8');
      console.log('Server appears to be offline, created default database');
    }
  } catch (e) {
    console.error('Error during update process:', e);
    
    // Try to write a default database if an error occurs
    try {
      const defaultData = getDefaultDatabase();
      fs.writeFileSync(dbPath, JSON.stringify(defaultData, null, 2), 'utf8');
      console.log('Error encountered, created default database');
    } catch (writeError) {
      console.error('Failed to write default database:', writeError);
    }
  }
};

// Use a promise to run the update and properly handle errors
update()
  .then(() => {
    console.log('Update completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Update failed:', error);
    process.exit(1);
  });
