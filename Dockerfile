# syntax=docker/dockerfile:1
FROM node:20-alpine

# Çalışma dizinini oluştur ve ayarla
WORKDIR /app

# Bağımlılıkları yüklemeden önce package.json ve package-lock.json'u kopyala
COPY package*.json ./

# Bağımlılıkları yükle
RUN npm install --production

# Uygulama dosyalarını kopyala
COPY . .

# Ortam değişkenleri için örnek .env dosyası (varsa)
# COPY .env .env

# Gerekli portları aç (Discord botu için genellikle gerekmez)

# Varsayılan başlatma komutu (watchdog ile başlatılır)
CMD ["npm", "run", "start:watchdog"]
