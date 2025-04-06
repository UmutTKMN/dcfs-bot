@echo off
chcp 65001 > nul
title FS25 Discord Bot Hata Ayıklama
color 0E

:: Değişkenler
set LOG_DIR=logs
set DATA_DIR=data

echo ╔═══════════════════════════════════════════════╗
echo ║       FS25 DISCORD BOT HATA AYIKLAMA          ║
echo ╚═══════════════════════════════════════════════╝

:menu
echo.
echo ╔═══════════════════════════════════════════════╗
echo ║              HATA AYIKLAMA MENÜSÜ             ║
echo ╠═══════════════════════════════════════════════╣
echo ║ 1. JSON Dosyalarını Doğrula                   ║
echo ║ 2. JSON Ayrıştırma Hatasını Düzelt            ║
echo ║ 3. Renk Kodlarını Düzelt                      ║
echo ║ 4. Sunucu Bağlantısını Test Et                ║
echo ║ 5. Ana Menüye Dön                             ║
echo ╚═══════════════════════════════════════════════╝
echo.

set /p choice=Seçiminiz: 

if "%choice%"=="1" goto validate_json
if "%choice%"=="2" goto fix_json_parse
if "%choice%"=="3" goto fix_color_codes
if "%choice%"=="4" goto test_connection
if "%choice%"=="5" goto exit
goto menu

:validate_json
cls
echo JSON dosyaları kontrol ediliyor...
echo.

:: data klasöründeki tüm JSON dosyalarını kontrol et
for %%f in (%DATA_DIR%\*.json) do (
    echo %%f dosyası doğrulanıyor...
    node -e "try { require('./%%f'); console.log('[✓] Dosya geçerli JSON.'); } catch(e) { console.log('[✗] HATA:', e.message); }"
    echo.
)

echo İşlem tamamlandı. Ana menüye dönmek için bir tuşa basın.
pause > nul
cls
goto menu

:fix_json_parse
cls
echo JSON ayrıştırma hatalarını düzeltme işlemi başlatılıyor...
echo.
echo Bu işlem, "#24a5b" gibi geçersiz renk kodlarını düzeltmeye çalışacak.
echo.

set /p file=Düzeltilecek JSON dosyasının yolunu girin: 
if not exist "%file%" (
    echo Dosya bulunamadı!
    timeout /t 2 > nul
    goto fix_json_parse
)

echo Dosya yedekleniyor...
copy "%file%" "%file%.bak" > nul

echo Renk kodları düzeltiliyor...
node -e "const fs = require('fs'); let data = fs.readFileSync('%file%', 'utf8'); data = data.replace(/#[0-9a-f]{5}\b/gi, '#000000'); fs.writeFileSync('%file%', data, 'utf8'); console.log('İşlem tamamlandı.');"

echo.
echo Onarım tamamlandı. Yedek dosya %file%.bak olarak kaydedildi.
echo Ana menüye dönmek için bir tuşa basın.
pause > nul
cls
goto menu

:fix_color_codes
cls
echo Renk kodlarını düzeltme işlemi başlatılıyor...
echo.
echo Bu işlem, 5 karakterli HEX renk kodlarını standart 6 karakterli formata dönüştürecek.
echo Örneğin: #24a5b -> #24a5b0
echo.

set /p file=Düzeltilecek dosyanın yolunu girin: 
if not exist "%file%" (
    echo Dosya bulunamadı!
    timeout /t 2 > nul
    goto fix_color_codes
)

echo Dosya yedekleniyor...
copy "%file%" "%file%.bak" > nul

echo Renk kodları düzeltiliyor...
node -e "const fs = require('fs'); let data = fs.readFileSync('%file%', 'utf8'); data = data.replace(/#([0-9a-f]{5})\b/gi, (m, p1) => '#' + p1 + '0'); fs.writeFileSync('%file%', data, 'utf8'); console.log('İşlem tamamlandı.');"

echo.
echo Onarım tamamlandı. Yedek dosya %file%.bak olarak kaydedildi.
echo Ana menüye dönmek için bir tuşa basın.
pause > nul
cls
goto menu

:test_connection
cls
echo Sunucu bağlantısı test ediliyor...
echo.

for /f "tokens=1,* delims==" %%a in ('findstr /B "FS25_BOT_URL_SERVER_STATS" .env') do set SERVER_URL=%%b
set SERVER_URL=%SERVER_URL: =%

if "%SERVER_URL%"=="" (
    echo .env dosyasında sunucu URL'si bulunamadı!
    echo Ana menüye dönmek için bir tuşa basın.
    pause > nul
    cls
    goto menu
)

echo Sunucu URL: %SERVER_URL%
echo.
echo Bağlantı testi yapılıyor...

curl -s -o nul -w "Durum Kodu: %%{http_code}\nYanıt Süresi: %%{time_total} saniye\n" %SERVER_URL%

echo.
echo Test tamamlandı. Ana menüye dönmek için bir tuşa basın.
pause > nul
cls
goto menu

:exit
cls
start start-bot.bat
exit 