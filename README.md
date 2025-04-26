# Farming Simulator 25 Discord Botu

Bu proje, Farming Simulator 25 oyun sunucusunun durumunu izleyen ve çeşitli bilgileri Discord kanallarına aktaran bir bot uygulamasıdır.

## Özellikler

- Sunucu durumunu gerçek zamanlı izleme
- Oyuncu çalışma sürelerini takip etme
- Sunucu ayarları ve mod değişikliklerini bildirme
- Günlük özet mesajları gönderme
- Otomatik mesaj temizleme
- Gelişmiş hata yönetimi ve yeniden bağlanma

## Kurulum

1. Projeyi klonlayın:
```bash
git clone https://github.com/yourusername/dcfs-bot.git
cd dcfs-bot
```

2. Gerekli paketleri yükleyin:
```bash
npm install
```

3. `.env` dosyası oluşturun:
```bash
cp .env.example .env
```

4. `.env` dosyasını düzenleyin ve gerekli ayarları yapın.

## Çevre Değişkenleri

Bot, aşağıdaki çevre değişkenlerini kullanır:

| Değişken | Açıklama |
|----------|----------|
| FS25_BOT_DISCORD_TOKEN | Discord Bot Token |
| FS25_BOT_URL_SERVER_STATS | Sunucu istatistiklerini içeren XML URL'si |
| FS25_BOT_URL_CAREER_SAVEGAME | Kariyer kayıt verilerini içeren XML URL'si |
| FS25_BOT_UPTIME_FILE | Oyuncu çalışma süresi verilerinin kaydedileceği dosya |
| FS25_BOT_DB_PATH | Veritabanı dosya yolu |
| FS25_BOT_DAILY_SUMMARY_CHANNEL_ID | Günlük özet kanalı ID'si |
| FS25_BOT_UPDATE_CHANNEL_ID | Güncelleme mesajlarının gönderileceği kanal ID'si |
| FS25_BOT_DISCORD_SERVER_NAME | Discord sunucu adı (opsiyonel) |
| FS25_BOT_DISCORD_CHANNEL_NAME | Discord kanal adı (opsiyonel) |
| FS25_BOT_POLL_INTERVAL_MINUTES | Kontrol aralığı (dakika) |
| FS25_BOT_DAILY_STATS_HOUR | Günlük istatistiklerin gönderileceği saat |
| FS25_BOT_DAILY_STATS_MINUTE | Günlük istatistiklerin gönderileceği dakika |
| FS25_BOT_DISABLE_SAVEGAME_MESSAGES | Kariyer kayıt mesajlarını devre dışı bırak (true/false) |
| FS25_BOT_DISABLE_UNREACHABLE_FOUND_MESSAGES | Erişilemezlik mesajlarını devre dışı bırak (true/false) |
| FS25_BOT_PURGE_DISCORD_CHANNEL_ON_STARTUP | Başlangıçta kanalları temizle (true/false) |

## Kullanım

Botu başlatmak için:

```bash
npm start
```

Geliştirme modunda çalıştırmak için:

```bash
npm run dev
```

## Proje Yapısı

```
dcfs-bot/
├── src/                      # Kaynak kodları
│   ├── server.js             # Ana dosya
│   ├── utils/                # Yardımcı fonksiyonlar
│       ├── messages.js       # Mesaj işlemleri
│       ├── purge.js          # Mesaj temizleme işlemleri
│       ├── stats.js          # İstatistik işlemleri
│       ├── uptime.js         # Çalışma süresi işlemleri
│       └── utils.js          # Genel yardımcı fonksiyonlar
├── .env                      # Çevre değişkenleri
├── .env.example              # Örnek çevre değişkenleri
├── package.json              # NPM yapılandırması
└── README.md                 # Bu belge
```

## Katkıda Bulunma

1. Projeyi fork edin
2. Yeni bir branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Değişikliklerinizi commit edin (`git commit -m 'feat: harika bir özellik ekle'`)
4. Branch'inizi push edin (`git push origin feature/amazing-feature`)
5. Pull Request açın

## Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Detaylar için `LICENSE` dosyasını inceleyebilirsiniz.
