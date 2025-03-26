# FS25 Discord Bot

Bu Discord botu, Farming Simulator 25 sunucu durumunu izlemek ve Discord kanallarına güncellemeler göndermek için tasarlanmıştır.

## Özellikler

- **Sunucu Durumu İzleme:** Sunucunun çevrimiçi/çevrimdışı durumunu takip eder ve bildirir
- **Mod ve DLC Takibi:** Sunucuya eklenen, güncellenen veya kaldırılan modları ve DLC'leri bildirir
- **Finansal Durum Takibi:** Sunucunun finansal verilerindeki değişiklikleri takip eder
- **Oyuncu Süresi İzleme:** Oyuncuların oyunda geçirdikleri süreyi takip eder
- **Otomatik Mesaj Temizleme:** Belirli bir süreden sonra eski bot mesajlarını otomatik olarak temizler
- **Günlük Raporlar:** Sunucu istatistiklerini belirli zamanlarda paylaşır
- **Güçlü Hata Toleransı:** Bağlantı kopması veya hata durumlarında otomatik olarak yeniden bağlanır
- **Watchdog Mekanizması:** Bot tamamen çökse bile otomatik olarak yeniden başlatır

## Gereksinimler

- Node.js (v16+)
- Discord.js (v14+)
- Farming Simulator 25 Dedicated Server (XML veri akışı erişimine sahip)

## Kurulum

1. Repoyu klonlayın
```bash
git clone https://github.com/UmutTKMN/dcfs-bot.git
cd dcfs-bot
```

2. Bağımlılıkları yükleyin
```bash
npm install
```

3. `.env.example` -> `.env` olarak düzenleyip ve yapılandırın

## Kullanım

Aşağıdaki komutlarla botu çalıştırabilirsiniz:

```bash
# Normal başlatma
npm run start

# Watchdog ile başlatma (önerilir, sürekli çalışmayı garantiler)
npm run watchdog

# Üretim ortamında başlatma
npm run start:prod

# Veritabanını manuel güncelleme
npm run update
```

## Çevre Değişkenleri Yapılandırması

| Değişken | Açıklama |
|----------|-----------|
| FS25_BOT_DB_PATH | Veritabanı dosyasının yolu |
| FS25_BOT_DISCORD_TOKEN | Discord bot token |
| FS25_BOT_URL_SERVER_STATS | FS25 sunucu istatistikleri XML URL'si |
| FS25_BOT_URL_CAREER_SAVEGAME | FS25 kariyer kayıt dosyası URL'si |
| FS25_BOT_UPTIME_FILE | Oyuncu süre takibi dosyasının yolu |
| DAILY_SUMMARY_CHANNEL_ID | Günlük özet mesajlarının gönderileceği kanal ID'si |
| UPDATE_CHANNEL_ID | Güncelleme mesajlarının gönderileceği kanal ID'si |
| FS25_BOT_DISCORD_SERVER_NAME | Discord sunucu adı |
| FS25_BOT_DISCORD_CHANNEL_NAME | Discord kanal adı |
| FS25_BOT_POLL_INTERVAL_MINUTES | Sunucu durumunun kaç dakikada bir kontrol edileceği |
| FS25_BOT_PURGE_DISCORD_CHANNEL_AFTER_DAYS | Mesajların kaç gün sonra temizleneceği |
| FS25_BOT_PURGE_DISCORD_CHANNEL_HOUR | Mesaj temizleme saati |
| FS25_BOT_DAILY_STATS_HOUR | Günlük istatistiklerin gönderileceği saat |
| FS25_BOT_DAILY_STATS_MINUTE | Günlük istatistiklerin gönderileceği dakika |

## Watchdog Yapılandırması

Bot'un sürekli çalışmasını sağlayan watchdog aşağıdaki ayarları içerir:

```javascript
const CONFIG = {
  BOT_SCRIPT: './src/server.js',             // Bot başlangıç dosyası
  CHECK_INTERVAL_MS: 60000,                  // Kontrol aralığı (1 dakika)
  RESTART_DELAY_MS: 5000,                    // Yeniden başlatma gecikmesi (5 saniye)
  MAX_CRASHES: 10,                           // İzin verilen maksimum çökme sayısı
  CRASH_RESET_TIME_MS: 3600000,              // Çökme sayacını sıfırlama süresi (1 saat)
};
```

## Sorun Giderme

Bot bağlantı sorunları yaşıyor veya beklenmedik şekilde kapanıyorsa:

1. `.env` dosyasındaki token ve URL'lerin doğru olduğundan emin olun
2. Farming Simulator sunucusunun çalıştığını ve XML beslemesinin erişilebilir olduğunu kontrol edin
3. Discord token'ınızın geçerli olduğunu doğrulayın
4. `logs` klasöründeki günlük dosyalarını kontrol edin
5. Watchdog ile başlatarak otomatik yeniden başlatmayı etkinleştirin: `npm run watchdog`

## Proje Yapısı

```
dcfs-bot/
├── src/                      # Kaynak kodları
│   ├── server.js             # Ana bot uygulaması
│   ├── update.js             # Veritabanı güncelleme scripti
│   └── utils/                # Yardımcı fonksiyonlar
│       ├── utils.js          # Genel yardımcı fonksiyonlar
│       └── purge.js          # Mesaj temizleme fonksiyonları
├── watchdog.js               # Otomatik yeniden başlatma sistemi
├── logs/                     # Log dosyaları (otomatik oluşturulur)
├── db.json                   # Veritabanı (otomatik oluşturulur)
├── uptime_data.json          # Oyuncu süresi verileri (otomatik oluşturulur)
├── .env                      # Çevre değişkenleri konfigürasyonu
├── package.json              # Proje bağımlılıkları ve komutları
└── README.md                 # Bu dosya
```

## Lisans

Bu proje MIT lisansı altında lisanslanmıştır. 