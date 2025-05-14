# FS25 Discord Bot

Farming Simulator 25 sunucu durumunu ve oyuncu aktivitelerini izleyip Discord kanallarına otomatik bildirimler gönderen, gelişmiş ve modüler bir Discord botu.

---

## Özellikler

- **Sunucu Durumu İzleme:** Sunucunun çevrimiçi/çevrimdışı durumunu ve oyuncu listesini takip eder.
- **Mod & DLC Takibi:** Eklenen, güncellenen veya kaldırılan mod/DLC’leri bildirir.
- **Finansal Takip:** Sunucu finansal verilerindeki değişiklikleri raporlar.
- **Oyuncu Süresi:** Oyuncuların oyunda geçirdiği süreyi takip eder ve günlük özet olarak paylaşır.
- **Otomatik Mesaj Temizleme:** Belirli bir süre sonra eski mesajları temizler.
- **Bakım Modu:** Botu bakımda moduna alıp sadece bilgilendirme mesajı yayınlar.
- **Watchdog:** Bot çökse bile otomatik yeniden başlatma.
- **Gelişmiş Hata Ayıklama:** `debug-bot.bat` ile JSON, .env, bağlantı ve log kontrolleri.
- **Slash Komutları:** /temizle gibi yönetimsel komutlar.

---

## Gereksinimler

- Node.js v16+
- Discord.js v14+
- Farming Simulator 25 Dedicated Server (XML veri akışına erişim)
- Windows (BAT dosyaları için) veya Docker desteği
- İnternet bağlantısı

---

## Kurulum

1. Repoyu klonlayın:
   ```bash
   git clone https://github.com/UmutTKMN/dcfs-bot.git
   cd dcfs-bot
   ```

2. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```

3. `.env.example` dosyasını `.env` olarak kopyalayıp düzenleyin:
   ```bash
   copy .env.example .env
   # veya Linux için: cp .env.example .env
   ```

4. Gerekli klasörlerin var olduğundan emin olun:
   ```bash
   mkdir data logs
   ```

---

## Kullanım

- **Botu başlatmak için:**
  ```bash
  npm run start
  ```
- **Watchdog ile başlatmak için (önerilir):**
  ```bash
  npm run watchdog
  ```
- **Bakım modunda başlatmak için:**
  - `start-bot.bat` menüsünden "Bakım Modunda Başlat" seçeneğini kullanın.
- **Veritabanını manuel güncellemek için:**
  ```bash
  npm run update
  ```
- **Gelişmiş hata ayıklama menüsü için:**
  ```
  debug-bot.bat
  ```

---

## Komutlar

- `/temizle`  
  Kanalda toplu mesaj silme ve yönetimsel temizlik işlemleri.

---

## Çevre Değişkenleri (.env)

| Değişken | Açıklama |
|----------|----------|
| FS25_BOT_DB_PATH | Veritabanı dosya yolu |
| FS25_BOT_UPTIME_FILE | Oyuncu süre takibi dosya yolu |
| FS25_BOT_DISCORD_TOKEN | Discord bot token |
| FS25_BOT_URL_SERVER_STATS | FS25 sunucu istatistikleri XML URL |
| FS25_BOT_URL_CAREER_SAVEGAME | FS25 kariyer kayıt dosyası XML URL |
| FS25_BOT_UPDATE_CHANNEL_ID | Güncelleme mesajlarının gönderileceği kanal ID |
| FS25_BOT_DAILY_SUMMARY_CHANNEL_ID | Günlük özet mesajlarının gönderileceği kanal ID |
| FS25_BOT_MODS_CHANNEL_ID | Mod/DLC bildirimlerinin gönderileceği kanal ID |
| FS25_BOT_PLAYER_ACTIVITY_CHANNEL_ID | Oyuncu aktivite bildirimlerinin gönderileceği kanal ID |
| FS25_BOT_MAINTENANCE_MODE | Bakım modu (true/false) |
| ... | Diğer gelişmiş ayarlar için `.env.example` dosyasına bakın |

---

## Watchdog & Bakım Modu

- **Watchdog:**  
  `src/utils/watchdog.js` ile botun çökmesi durumunda otomatik yeniden başlatma sağlanır.  
  Ayarları `.env` dosyasından yönetebilirsiniz.

- **Bakım Modu:**  
  Bakımda iken bot sadece "Bakımda" embed mesajı yayınlar ve diğer işlevleri devre dışı bırakır.  
  `start-bot.bat` veya `.env` üzerinden kolayca aktif/pasif yapılabilir.

---

## Hata Ayıklama ve Bakım

- `debug-bot.bat` ile:
  - JSON ve .env dosyalarını doğrulayın
  - Renk kodlarını otomatik düzeltin
  - Sunucu bağlantılarını test edin
  - Discord token ve kanal ID’lerini kontrol edin
  - Log dosyalarını görüntüleyin
  - Watchdog testini başlatın

---

## Proje Yapısı

```
dcfs-bot/
├── src/
│   ├── server.js
│   ├── update.js
│   ├── watchdog.js
│   ├── commands/
│   └── utils/
├── data/
├── logs/
├── debug-bot.bat
├── start-bot.bat
├── package.json
├── .env
└── README.md
```

---

## Güncelleme

```bash
git pull
npm update
```

---

## Lisans

MIT Lisansı

---

## Katkı

Hata raporları, öneriler ve pull request’ler memnuniyetle karşılanır. Büyük değişiklikler için lütfen önce bir konu açarak tartışın.

---

Daha fazla bilgi için:  
- [Farming Simulator Dedicated Server Docs](https://gdn.giants-software.com/documentation_scripting_fs25.php?version=script&category=70&class=103)
- [Discord.js Belgeleri](https://discordjs.guide/)
