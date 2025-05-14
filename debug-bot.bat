@echo off
chcp 65001 > nul
title FS25 Discord Bot Gelişmiş Hata Ayıklama
color 0E

set LOG_DIR=logs
set DATA_DIR=data

:menu
cls
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                GELİŞMİŞ HATA AYIKLAMA MENÜSÜ               ║
echo ╠══════════════════════════════════════════════════════════════╣
echo ║ 1. Tüm JSON Dosyalarını Doğrula                            ║
echo ║ 2. .env Dosyasını Doğrula                                  ║
echo ║ 3. Renk Kodlarını Tüm JSON'larda Düzelt                    ║
echo ║ 4. Sunucu Bağlantılarını Test Et                           ║
echo ║ 5. Discord Token ve Kanal ID Kontrolü                      ║
echo ║ 6. Log Dosyalarını Listele ve Görüntüle                    ║
echo ║ 7. Watchdog Testi Başlat                                   ║
echo ║ 8. Ana Menüye Dön                                          ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

set /p choice=Seçiminiz: 

if "%choice%"=="1" goto validate_json
if "%choice%"=="2" goto validate_env
if "%choice%"=="3" goto fix_all_color_codes
if "%choice%"=="4" goto test_server_connections
if "%choice%"=="5" goto check_discord_env
if "%choice%"=="6" goto view_logs
if "%choice%"=="7" goto test_watchdog
if "%choice%"=="8" goto exit
goto menu

:validate_json
cls
echo Tüm JSON dosyaları kontrol ediliyor...
for %%f in (%DATA_DIR%\*.json) do (
    echo %%f dosyası doğrulanıyor...
    node -e "try { require('./%%f'); console.log('[✓] Dosya geçerli JSON.'); } catch(e) { console.log('[✗] HATA:', e.message); }"
    echo.
)
echo İşlem tamamlandı. Ana menüye dönmek için bir tuşa basın.
pause > nul
goto menu

:validate_env
cls
echo .env dosyası kontrol ediliyor...
findstr /R /C:"^FS25_BOT_" .env > nul
if %ERRORLEVEL% neq 0 (
    echo [✗] .env dosyasında FS25_BOT_ ile başlayan değişkenler bulunamadı!
) else (
    echo [✓] .env dosyası temel değişkenleri içeriyor.
)
echo Ana menüye dönmek için bir tuşa basın.
pause > nul
goto menu

:fix_all_color_codes
cls
echo Tüm JSON dosyalarında renk kodları düzeltiliyor...
for %%f in (%DATA_DIR%\*.json) do (
    echo %%f dosyası işleniyor...
    copy "%%f" "%%f.bak" > nul
    node -e "const fs = require('fs'); let data = fs.readFileSync('%%f', 'utf8'); data = data.replace(/#([0-9a-f]{5})\b/gi, (m, p1) => '#' + p1 + '0'); fs.writeFileSync('%%f', data, 'utf8');"
)
echo Tüm dosyalar işlendi. Ana menüye dönmek için bir tuşa basın.
pause > nul
goto menu

:test_server_connections
cls
echo Sunucu bağlantıları test ediliyor...
for /f "tokens=1,* delims==" %%a in ('findstr /B "FS25_BOT_URL_SERVER_STATS" .env') do set SERVER_URL=%%b
for /f "tokens=1,* delims==" %%a in ('findstr /B "FS25_BOT_URL_CAREER_SAVEGAME" .env') do set SAVEGAME_URL=%%b
set SERVER_URL=%SERVER_URL: =%
set SAVEGAME_URL=%SAVEGAME_URL: =%
if "%SERVER_URL%"=="" (
    echo [✗] .env dosyasında sunucu istatistikleri URL'si bulunamadı!
) else (
    echo Sunucu İstatistikleri URL: %SERVER_URL%
    curl -s -o nul -w "Durum Kodu: %%{http_code}\nYanıt Süresi: %%{time_total} saniye\n" %SERVER_URL%
)
if "%SAVEGAME_URL%"=="" (
    echo [✗] .env dosyasında kariyer kayıt URL'si bulunamadı!
) else (
    echo Kariyer Kayıt URL: %SAVEGAME_URL%
    curl -s -o nul -w "Durum Kodu: %%{http_code}\nYanıt Süresi: %%{time_total} saniye\n" %SAVEGAME_URL%
)
echo Test tamamlandı. Ana menüye dönmek için bir tuşa basın.
pause > nul
goto menu

:check_discord_env
cls
echo Discord token ve kanal ID'leri kontrol ediliyor...
for /f "tokens=1,* delims==" %%a in ('findstr /B "FS25_BOT_DISCORD_TOKEN" .env') do set TOKEN=%%b
for /f "tokens=1,* delims==" %%a in ('findstr /B "FS25_BOT_UPDATE_CHANNEL_ID" .env') do set UPDATEID=%%b
for /f "tokens=1,* delims==" %%a in ('findstr /B "FS25_BOT_DAILY_SUMMARY_CHANNEL_ID" .env') do set DAILYID=%%b
for /f "tokens=1,* delims==" %%a in ('findstr /B "FS25_BOT_MODS_CHANNEL_ID" .env') do set MODSID=%%b
for /f "tokens=1,* delims==" %%a in ('findstr /B "FS25_BOT_PLAYER_ACTIVITY_CHANNEL_ID" .env') do set ACTIVITYID=%%b
set TOKEN=%TOKEN: =%
set UPDATEID=%UPDATEID: =%
set DAILYID=%DAILYID: =%
set MODSID=%MODSID: =%
set ACTIVITYID=%ACTIVITYID: =%
if "%TOKEN%"=="" (
    echo [✗] Discord token bulunamadı!
) else (
    echo [✓] Discord token bulundu.
)
if "%UPDATEID%"=="" echo [✗] Güncelleme kanalı ID'si eksik!
if "%DAILYID%"=="" echo [✗] Günlük özet kanalı ID'si eksik!
if "%MODSID%"=="" echo [✗] Mod kanalı ID'si eksik!
if "%ACTIVITYID%"=="" echo [✗] Oyuncu aktivite kanalı ID'si eksik!
if not "%UPDATEID%"=="" echo [✓] Güncelleme kanalı ID'si bulundu.
if not "%DAILYID%"=="" echo [✓] Günlük özet kanalı ID'si bulundu.
if not "%MODSID%"=="" echo [✓] Mod kanalı ID'si bulundu.
if not "%ACTIVITYID%"=="" echo [✓] Oyuncu aktivite kanalı ID'si bulundu.
echo Ana menüye dönmek için bir tuşa basın.
pause > nul
goto menu

:view_logs
cls
echo Log dosyaları:
echo.
dir /b "%LOG_DIR%\*.log"
echo.
set /p logfile=Görüntülemek istediğiniz log dosyasını yazın (ana menü için boş bırakın): 
if "%logfile%"=="" goto menu
if not exist "%LOG_DIR%\%logfile%" (
    echo Dosya bulunamadı!
    timeout /t 2 > nul
    goto view_logs
)
cls
echo %logfile% dosyası gösteriliyor...
echo.
type "%LOG_DIR%\%logfile%"
echo.
echo Ana menüye dönmek için bir tuşa basın.
pause > nul
goto menu

:test_watchdog
cls
echo Watchdog test başlatılıyor...
start "FS25 Discord Bot (Watchdog Test)" /wait node ./src/utils/watchdog.js
echo.
echo Watchdog testi tamamlandı. Ana menüye dönmek için bir tuşa basın.
pause > nul
goto menu

:exit
cls
start start-bot.bat
exit