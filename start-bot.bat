@echo off
chcp 65001 > nul
title FS25 Discord Bot Yöneticisi
color 0A

:: Değişkenler
set LOG_DIR=logs
set DATA_DIR=data

echo ╔═══════════════════════════════════════════════╗
echo ║        FS25 DISCORD BOT YÖNETİM PANELİ        ║
echo ╚═══════════════════════════════════════════════╝

:: Gerekli klasörleri oluştur
if not exist "%LOG_DIR%" (
    mkdir "%LOG_DIR%"
    echo [✓] Logs klasörü oluşturuldu.
) else (
    echo [i] Logs klasörü zaten mevcut.
)

if not exist "%DATA_DIR%" (
    mkdir "%DATA_DIR%"
    echo [✓] Data klasörü oluşturuldu.
) else (
    echo [i] Data klasörü zaten mevcut.
)

:: Bağımlılıkları kontrol et
echo.
echo Node.js bağımlılıkları kontrol ediliyor...
call npm list --depth=0 > nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] Bazı bağımlılıklar eksik olabilir, yükleme işlemi başlatılıyor...
    call npm install
) else (
    echo [✓] Tüm bağımlılıklar yüklü.
)

:menu
echo.
echo ╔═══════════════════════════════════════════════╗
echo ║                  ANA MENÜ                     ║
echo ╠═══════════════════════════════════════════════╣
echo ║ 1. Botu Başlat                                ║
echo ║ 2. Botu Watchdog İle Başlat (Önerilen)        ║
echo ║ 3. Veritabanını Güncelle                      ║
echo ║ 4. Bot Loglarını Görüntüle                    ║
echo ║ 5. .env Dosyasını Düzenle                     ║
echo ║ 6. Botu Bakım Modunda Başlat                  ║
echo ║ 7. Çıkış                                      ║
echo ╚═══════════════════════════════════════════════╝
echo.

set /p choice=Seçiminiz: 

if "%choice%"=="1" goto start_bot
if "%choice%"=="2" goto start_watchdog
if "%choice%"=="3" goto update_db
if "%choice%"=="4" goto view_logs
if "%choice%"=="5" goto edit_env
if "%choice%"=="6" goto maintenance_mode
if "%choice%"=="7" goto exit
goto menu

:start_bot
cls
echo FS25 Discord Botu başlatılıyor...
echo Bot çalışırken bu pencereyi kapatmayın!
echo Durdurmak için CTRL+C tuşlarına basın.
echo.
start "FS25 Discord Bot" /wait node ./src/server.js
echo.
echo Bot durduruldu. Ana menüye dönmek için bir tuşa basın.
pause > nul
cls
goto menu

:start_watchdog
cls
echo FS25 Discord Botu Watchdog ile başlatılıyor...
echo Bot çalışırken bu pencereyi kapatmayın!
echo Durdurmak için CTRL+C tuşlarına basın.
echo.
start "FS25 Discord Bot (Watchdog)" /wait node ./src/utils/watchdog.js
echo.
echo Bot durduruldu. Ana menüye dönmek için bir tuşa basın.
pause > nul
cls
goto menu

:update_db
cls
echo Veritabanı güncelleniyor...
call node ./src/utils/update.js
echo.
echo İşlem tamamlandı. Ana menüye dönmek için bir tuşa basın.
pause > nul
cls
goto menu

:view_logs
cls
echo Log dosyaları:
echo.
dir /b "%LOG_DIR%\*.log"
echo.
set /p logfile=Görüntülemek istediğiniz log dosyasını yazın (ana menü için boş bırakın): 
if "%logfile%"=="" (
    cls
    goto menu
)
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
cls
goto menu

:edit_env
cls
echo .env dosyası açılıyor...
notepad .env
cls
goto menu

:maintenance_mode
cls
echo Bot bakım modunda başlatılıyor...
powershell -Command "(Get-Content .env) -replace 'FS25_BOT_MAINTENANCE_MODE=.*', 'FS25_BOT_MAINTENANCE_MODE=true' | Set-Content .env"
echo Bakım modu aktif edildi.
echo Bot çalışırken bu pencereyi kapatmayın!
echo Durdurmak için CTRL+C tuşlarına basın.
echo.
start "FS25 Discord Bot (Bakım Modu)" /wait node ./src/server.js
echo.
echo Bot durduruldu. Bakım modu kapatılıyor...
powershell -Command "(Get-Content .env) -replace 'FS25_BOT_MAINTENANCE_MODE=.*', 'FS25_BOT_MAINTENANCE_MODE=false' | Set-Content .env"
echo Ana menüye dönmek için bir tuşa basın.
pause > nul
cls
goto menu

:exit
echo Bot yöneticisi kapatılıyor...
timeout /t 2 > nul
exit