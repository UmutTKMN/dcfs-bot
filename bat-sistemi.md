# FS25 Discord Bot - BAT Sistemi Kılavuzu

## Genel Bakış

Bu BAT sistemi, FS25 Discord Bot'un yönetimini kolaylaştırmak için tasarlanmış Windows batch betikleri koleksiyonudur. Bu araçlar, bot kurulumunu, çalıştırılmasını ve olası hataların giderilmesini otomatikleştirir.

## BAT Dosyaları

### 1. start-bot.bat

Bot yönetiminin ana arayüzüdür. Aşağıdaki işlevleri sağlar:

- **Botu Normal Başlatma**: Standart modda botu çalıştırır
- **Botu Watchdog ile Başlatma**: Çökme durumunda otomatik yeniden başlatma sağlar (önerilen)
- **Veritabanı Güncelleme**: Bot veritabanını günceller
- **Log Dosyalarını Görüntüleme**: Bot log dosyalarını kolay bir şekilde izlemenizi sağlar
- **Yapılandırma Düzenleme**: `.env` dosyasını düzenlemenize olanak tanır

![start-bot.bat menüsü](https://i.ibb.co/G3x72SV/fs25-start-bot.png)

### 2. debug-bot.bat

Sorun giderme aracıdır. Aşağıdaki işlevleri sunar:

- **JSON Dosyalarını Doğrulama**: Veri dosyalarının geçerli olup olmadığını kontrol eder
- **JSON Ayrıştırma Hatalarını Düzeltme**: Geçersiz renk kodları gibi sorunları düzeltir
- **Renk Kodlarını Düzeltme**: 5 karakterli hatalı renk kodlarını (#24a5b) 6 karaktere dönüştürür (#24a5b0)
- **Sunucu Bağlantısını Test Etme**: FS25 sunucusuyla bağlantıyı test eder

**Sunduğu özellikler:**

- **Bot Yönetim Paneli**: start-bot.bat'ı başlatır
- **Hata Ayıklama Aracı**: debug-bot.bat'ı başlatır
- **Günlük Özeti Görüntüleme**: Log dosyalarından günlük özetleri filtreler
- **Bot Durumu Görüntüleme**: Botun çalışma durumunu ve sunucu bağlantısını kontrol eder

Bu araç, diğer tüm araçlara tek bir yerden erişim sağlamak ve bazı rutin görevleri otomatikleştirmek için kullanılır.

## Kurulum

1. Bat dosyalarını bot dizininize yerleştirin (FS25 Discord Bot ana klasörü)
2. Dosyaların çalıştırılabilir olduğundan emin olun
3. Windows Defender veya antivirüs programınız tarafından engellenmediğinden emin olun

## Kullanım Talimatları

### Bot Başlatma

```
1. start-bot.bat dosyasını çift tıklayarak çalıştırın
2. Ana menüden "2. Botu Watchdog İle Başlatma (Önerilen)" seçeneğini seçin
3. Bot çalışmaya başlayacak ve otomatik yeniden başlatma korumasına sahip olacaktır
```

### Hata Ayıklama

```
1. Bir hata durumunda debug-bot.bat dosyasını çift tıklayarak çalıştırın
2. Olası sorunun tipine göre menüden bir seçenek belirleyin:
   - "Unable to convert #24a5b to a number" hatası için "3. Renk Kodlarını Düzelt" seçeneğini kullanın
   - Sunucu bağlantı sorunları için "4. Sunucu Bağlantısını Test Et" seçeneğini kullanın
```

## Sık Karşılaşılan Sorunlar ve Çözümleri

### 1. JSON Ayrıştırma Hatası

**Sorun**: "Unable to convert #24a5b to a number" gibi hatalar

**Çözüm**:
1. `debug-bot.bat` dosyasını çalıştırın
2. "3. Renk Kodlarını Düzelt" seçeneğini seçin
3. Düzeltilecek dosyanın yolunu girin (örn: `data/fs25_bot.json`)

### 2. Sunucu Bağlantı Hatası

**Sorun**: Bot sunucuya bağlanamıyor

**Çözüm**:
1. `debug-bot.bat` dosyasını çalıştırın
2. "4. Sunucu Bağlantısını Test Et" seçeneğini seçin
3. Bağlantı durumunu kontrol edin, hata alıyorsanız `.env` dosyasındaki URL'leri gözden geçirin

### 3. Bot Çalışmayı Durduruyor

**Sorun**: Bot belirli bir süre sonra çalışmayı durduruyor

**Çözüm**:
1. `start-bot.bat` dosyasını çalıştırın
2. "2. Botu Watchdog İle Başlatma (Önerilen)" seçeneğini kullanın

## İpuçları

- Sistem loglarını düzenli olarak kontrol edin
- Watchdog ile başlatma, çökme durumlarında otomatik yeniden başlatma sağlar
- Herhangi bir dosyayı değiştirmeden önce yedek almayı unutmayın

## Teknik Detaylar

### Watchdog Yapılandırması

Bot'un sürekli çalışmasını sağlayan Watchdog aşağıdaki parametrelerle çalışır:

```
BOT_SCRIPT: './src/server.js'             // Bot başlangıç dosyası
CHECK_INTERVAL_MS: 60000                  // Kontrol aralığı (1 dakika)
RESTART_DELAY_MS: 5000                    // Yeniden başlatma gecikmesi (5 saniye)
MAX_CRASHES: 10                           // İzin verilen maksimum çökme sayısı
CRASH_RESET_TIME_MS: 3600000              // Çökme sayacını sıfırlama süresi (1 saat)
```

## İleri Seviye Kullanım

Kendi bat dosyalarınızı oluşturmak veya mevcut olanları özelleştirmek için Windows Batch betik dilini kullanabilirsiniz. Temel komutlar:

- `@echo off`: Komut çıktılarını gizler
- `chcp 65001`: UTF-8 karakter kodlamasını etkinleştirir
- `title [başlık]`: Konsol penceresinin başlığını ayarlar
- `color [kod]`: Konsol renklerini ayarlar

## JavaScript Yardımcı Araçları

Bat sistemini desteklemek için bazı JavaScript araçları da mevcuttur:

## Kaynaklar

- [Windows Batch Betikleme Rehberi](https://ss64.com/nt/)
- [Node.js Dokümantasyonu](https://nodejs.org/en/docs/)
- [Farming Simulator 25 Sunucu Dokümantasyonu](https://farming-simulator.com/)

## En İyi Kullanım Uygulamaları

BAT sistemini en etkili şekilde kullanmak için aşağıdaki önerileri dikkate alın:

1. **Otomatik Başlatma**: Sunucu yeniden başladığında botun otomatik olarak başlaması için bir görev zamanlayıcı oluşturun:
   ```
   SCHTASKS /CREATE /SC ONSTART /TN "FS25 Bot" /TR "C:\path\to\start-bot.bat" /RU SYSTEM
   ```

2. **Düzenli Bakım**: Haftada bir kez aşağıdaki kontrolleri yapın:
   - Log dosyalarını kontrol edin ve eski olanları temizleyin
   - Veritabanı dosyalarının boyutunu kontrol edin
   - Renk kodu hatası olup olmadığını kontrol edin

3. **Yedekleme**: Önemli veri dosyalarını düzenli olarak yedekleyin:
   ```
   xcopy /s /i /y data backups\data_%date:~-4,4%%date:~-7,2%%date:~-10,2%
   ```

4. **Performans İzleme**: Uzun süre çalışan botlar için bellek kullanımını izleyin:
   ```
   tasklist /fi "imagename eq node.exe" /v
   ``` 