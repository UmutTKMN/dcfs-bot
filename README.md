# FS25 Discord Bot

Bu Discord botu, Farming Simulator 25 sunucu durumunu izlemek ve Discord kanallarına güncellemeler göndermek için tasarlanmıştır.

## Özellikler

- **Sunucu Durumu İzleme:** Sunucunun çevrimiçi/çevrimdışı durumunu takip eder ve bildirir
- **Mod ve DLC Takibi:** Sunucuya eklenen, güncellenen veya kaldırılan modları ve DLC'leri bildirir
- **Finansal Durum Takibi:** Sunucunun finansal verilerindeki değişiklikleri takip eder
- **Oyuncu Süresi İzleme:** Oyuncuların oyunda geçirdikleri süreyi ayrıntılı olarak takip eder ve raporlar
- **Otomatik Mesaj Temizleme:** Belirli bir süreden sonra eski bot mesajlarını otomatik olarak temizler
- **Günlük Özet Raporları:** Sunucunun günlük istatistiklerini belirli zamanlarda kapsamlı bir şekilde paylaşır
- **Güçlü Hata Toleransı:** Bağlantı kopması veya hata durumlarında otomatik olarak yeniden bağlanır
- **Watchdog Mekanizması:** Bot tamamen çökse bile otomatik olarak yeniden başlatır

## Gereksinimler

- Node.js (v16+)
- Discord.js (v14+)
- Farming Simulator 25 Dedicated Server (XML veri akışına erişim)
- İnternet bağlantısı (Discord API ve FS25 sunucusuyla iletişim için)

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

3. `.env.example` dosyasını `.env` olarak kopyalayıp konfigüre edin
```bash
cp .env.example .env
# Sonra .env dosyasını düzenleyin
```

4. Gerekli dizinlerin oluşturulduğundan emin olun
```bash
mkdir -p data logs
```

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
| FS25_BOT_DAILY_SUMMARY_CHANNEL_ID | Günlük özet mesajlarının gönderileceği kanal ID'si |
| FS25_BOT_UPDATE_CHANNEL_ID | Güncelleme mesajlarının gönderileceği kanal ID'si |
| FS25_BOT_DISCORD_SERVER_NAME | Discord sunucu adı |
| FS25_BOT_DISCORD_CHANNEL_NAME | Discord kanal adı |
| FS25_BOT_POLL_INTERVAL_MINUTES | Sunucu durumunun kaç dakikada bir kontrol edileceği |
| FS25_BOT_PURGE_DISCORD_CHANNEL_AFTER_DAYS | Mesajların kaç gün sonra temizleneceği |
| FS25_BOT_PURGE_DISCORD_CHANNEL_HOUR | Mesaj temizleme saati |
| FS25_BOT_DAILY_STATS_HOUR | Günlük istatistiklerin gönderileceği saat |
| FS25_BOT_DAILY_STATS_MINUTE | Günlük istatistiklerin gönderileceği dakika |
| FS25_BOT_DISABLE_SAVEGAME_MESSAGES | Kayıt dosyası bildirimlerini devre dışı bırakma |
| FS25_BOT_DISABLE_UNREACHABLE_FOUND_MESSAGES | Erişilemez sunucu mesajlarını devre dışı bırakma |
| FS25_BOT_DISABLE_CERTIFICATE_VERIFICATION | SSL sertifika doğrulamasını devre dışı bırakma |
| FS25_BOT_FETCH_RETRIES | API bağlantı hatası durumunda yeniden deneme sayısı |
| FS25_BOT_FETCH_RETRY_DELAY_MS | Yeniden denemeler arasındaki bekleme süresi |

## Watchdog Yapılandırması

Bot'un sürekli çalışmasını sağlayan watchdog aşağıdaki ayarları içerir ve `src/watchdog.js` dosyasında veya `.env` dosyasında yapılandırılabilir:

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
4. `logs` klasöründeki günlük dosyalarını inceleyin
5. Watchdog ile başlatarak otomatik yeniden başlatmayı etkinleştirin: `npm run watchdog`
6. Bağlantı sorunlarında `.env` dosyasında `FS25_BOT_FETCH_RETRIES` değerini artırın
7. SSL hatalarında `FS25_BOT_DISABLE_CERTIFICATE_VERIFICATION=true` ayarını deneyin (güvenli olmayan ortamlarda)

## Discord Bot Ayarları

Discord Developer Portal'da botunuzu oluştururken şu izinleri etkinleştirdiğinizden emin olun:
- `Bot` yetkisi
- İntentler: `SERVER MEMBERS`, `MESSAGE CONTENT`, `GUILD MESSAGES`
- Bot izinleri: `Send Messages`, `Manage Messages`, `Read Message History`, `Embed Links`

## Proje Yapısı

```
dcfs-bot/
├── src/                      # Kaynak kodları
│   ├── server.js             # Ana bot uygulaması
│   ├── update.js             # Veritabanı güncelleme scripti
│   ├── watchdog.js           # Otomatik yeniden başlatma sistemi
│   └── utils/                # Yardımcı fonksiyonlar
│       ├── utils.js          # Genel yardımcı fonksiyonlar
│       └── purge.js          # Mesaj temizleme fonksiyonları
├── logs/                     # Log dosyaları (otomatik oluşturulur)
├── data/                     # Tüm veriler (otomatik oluşturulur)
├── db.json                   # Veritabanı (otomatik oluşturulur)
├── .env                      # Çevre değişkenleri konfigürasyonu
├── package.json              # Proje bağımlılıkları ve komutları
└── README.md                 # Bu dosya
```

## Güncelleme

Bot'un güncel kalmak için düzenli olarak:

```bash
# Son değişiklikleri çekin
git pull

# Bağımlılıkları güncelleyin
npm update

# veya tüm bağımlılıkları en son sürüme yükseltin
npm install
```

## Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Detaylar için LICENSE dosyasını inceleyebilirsiniz.

## Katkıda Bulunma

Hata raporları, özellik istekleri ve pull request'ler memnuniyetle karşılanır. Büyük değişiklikler için lütfen önce bir konu açarak değişikliği tartışın.
