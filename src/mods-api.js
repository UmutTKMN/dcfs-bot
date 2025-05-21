const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3001;

app.use(cors());

app.get('/api/mods', (req, res) => {
  const filePath = path.join(__dirname, '../data/fs25_bot.json');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Veri okunamadı.' });
    try {
      const json = JSON.parse(data);
      const mods = Object.values(json.mods || {});
      res.json(mods);
    } catch (e) {
      res.status(500).json({ error: 'JSON parse hatası.' });
    }
  });
});

app.listen(PORT, () => {
  console.log(`API sunucusu http://localhost:${PORT} adresinde çalışıyor.`);
});
