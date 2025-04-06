/**
 * FS25 Discord Bot - Geçersiz HEX Renk Kodu Düzeltici
 * Bu betik, veri dosyalarındaki hatalı HEX renk kodlarını otomatik olarak düzeltir.
 */

const fs = require('fs');
const path = require('path');
const { fixColorCodes } = require('./src/utils/utils');

// Taranacak dizinler
const DIRECTORIES = ['./data'];

// Taranacak dosya uzantıları
const FILE_EXTENSIONS = ['.json', '.xml', '.html'];

// Dosyaları tarayıp düzelt
const processFiles = (directory) => {
  console.log(`📂 "${directory}" dizini taranıyor...`);
  
  try {
    const files = fs.readdirSync(directory);
    
    for (const file of files) {
      const filePath = path.join(directory, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        // Alt dizinleri özyinelemeli olarak tara
        processFiles(filePath);
      } else if (stats.isFile() && FILE_EXTENSIONS.includes(path.extname(file).toLowerCase())) {
        processFile(filePath);
      }
    }
  } catch (error) {
    console.error(`❌ Dizin taranırken hata: ${directory}`, error.message);
  }
};

// Dosyayı işle ve düzelt
const processFile = (filePath) => {
  console.log(`🔍 İşleniyor: ${filePath}`);
  
  try {
    // Dosya içeriğini oku
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Geçersiz renk kodlarını kontrol et
    const hasBadColorCodes = /#[0-9a-fA-F]{5}\b/g.test(content);
    
    if (hasBadColorCodes) {
      console.log(`⚠️ Geçersiz renk kodları bulundu: ${filePath}`);
      
      // Yedek oluştur
      const backupPath = `${filePath}.bak`;
      fs.writeFileSync(backupPath, content, 'utf8');
      console.log(`📄 Yedek oluşturuldu: ${backupPath}`);
      
      // Renk kodlarını düzelt
      const fixedContent = fixColorCodes(content);
      
      // Düzeltilmiş içeriği kaydet
      fs.writeFileSync(filePath, fixedContent, 'utf8');
      console.log(`✅ Renk kodları düzeltildi: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Dosya işlenirken hata: ${filePath}`, error.message);
    return false;
  }
};

// Ana işlev
const main = () => {
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║      FS25 HEX RENK KODU DÜZELTME ARACI        ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log('');
  
  let fixedFiles = 0;
  let scannedFiles = 0;
  
  // Her dizini tarayıp dosyaları işle
  for (const dir of DIRECTORIES) {
    if (fs.existsSync(dir)) {
      const result = processFiles(dir);
      if (result) fixedFiles++;
      scannedFiles++;
    } else {
      console.warn(`⚠️ Dizin bulunamadı: ${dir}`);
    }
  }
  
  console.log('');
  console.log('╔═══════════════════════════════════════════════╗');
  console.log(`║ Taranan dosya sayısı: ${scannedFiles.toString().padStart(24, ' ')} ║`);
  console.log(`║ Düzeltilen dosya sayısı: ${fixedFiles.toString().padStart(20, ' ')} ║`);
  console.log('╚═══════════════════════════════════════════════╝');
  
  if (fixedFiles > 0) {
    console.log('✅ İşlem başarıyla tamamlandı, dosyalar düzeltildi!');
  } else {
    console.log('ℹ️ Geçersiz renk kodu bulunamadı.');
  }
};

// Betiği çalıştır
main(); 