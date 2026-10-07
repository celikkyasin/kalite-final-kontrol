/**
 * KMK PACK - KALİTE FİNAL KONTROL (FRI) SİSTEMİ
 * Endüstriyel Kalite Güvence ve ERP Entegrasyon Motoru
 */

// Global State
let activeInspection = null;
let currentStepNumber = 1;

// AQL Standart Tabloları (Madde 7.2 & 7.3)
const AQL_TABLES = {
  // Lot aralığına göre Genel Seviye II Kod Harfi
  getCodeLetterLevel2: function(lot) {
    if (lot <= 8) return { letter: 'A', sample: 2 };
    if (lot <= 15) return { letter: 'B', sample: 3 };
    if (lot <= 25) return { letter: 'C', sample: 5 };
    if (lot <= 50) return { letter: 'D', sample: 8 };
    if (lot <= 90) return { letter: 'E', sample: 13 };
    if (lot <= 150) return { letter: 'F', sample: 20 };
    if (lot <= 280) return { letter: 'G', sample: 32 };
    if (lot <= 500) return { letter: 'H', sample: 50 };
    if (lot <= 1200) return { letter: 'J', sample: 80 };
    if (lot <= 3200) return { letter: 'K', sample: 125 };
    if (lot <= 10000) return { letter: 'L', sample: 200 };
    if (lot <= 35000) return { letter: 'M', sample: 315 };
    if (lot <= 150000) return { letter: 'N', sample: 500 };
    if (lot <= 500000) return { letter: 'P', sample: 800 };
    return { letter: 'Q', sample: 1250 };
  },
  // Kod harfine göre AQL 1.5 (Major) ve AQL 4.0 (Minor) Kabul (Ac) / Red (Re) Limitleri
  getAcRe: function(letter) {
    const limits = {
      'A': { majorAc: 0, majorRe: 1, minorAc: 0, minorRe: 1 },
      'B': { majorAc: 0, majorRe: 1, minorAc: 0, minorRe: 1 },
      'C': { majorAc: 0, majorRe: 1, minorAc: 0, minorRe: 1 },
      'D': { majorAc: 0, majorRe: 1, minorAc: 1, minorRe: 2 },
      'E': { majorAc: 0, majorRe: 1, minorAc: 1, minorRe: 2 },
      'F': { majorAc: 1, majorRe: 2, minorAc: 2, minorRe: 3 },
      'G': { majorAc: 1, majorRe: 2, minorAc: 3, minorRe: 4 },
      'H': { majorAc: 2, majorRe: 3, minorAc: 5, minorRe: 6 },
      'J': { majorAc: 3, majorRe: 4, minorAc: 7, minorRe: 8 },
      'K': { majorAc: 5, majorRe: 6, minorAc: 10, minorRe: 11 },
      'L': { majorAc: 7, majorRe: 8, minorAc: 14, minorRe: 15 },
      'M': { majorAc: 10, majorRe: 11, minorAc: 21, minorRe: 22 },
      'N': { majorAc: 14, majorRe: 15, minorAc: 21, minorRe: 22 },
      'P': { majorAc: 21, majorRe: 22, minorAc: 21, minorRe: 22 }
    };
    return limits[letter] || { majorAc: 10, majorRe: 11, minorAc: 21, minorRe: 22 };
  }
};

// ==========================================
// 1. İSTEMCİ TARAFI GÖRSEL SIKIŞTIRMA MOTORU
// ==========================================
async function compressImageFile(file, maxWidth = 1600, maxHeight = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Oran koruyarak boyutlandırma
        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Pürüzsüz çizim kalitesi
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        const origSizeKb = Math.round(file.size / 1024);
        const compSizeKb = Math.round((compressedDataUrl.length * 3/4) / 1024);

        resolve({
          dataUrl: compressedDataUrl,
          origSizeKb,
          compSizeKb,
          width,
          height
        });
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

// ==========================================
// 2. SAYFA YÜKLENDİĞİNDE BAŞLATMA
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadInitialInspection();
});

async function loadInitialInspection() {
  try {
    // Önce sunucudan mevcut kayıtları çek
    const res = await fetch('/api/inspections');
    const data = await res.json();
    
    if (data.success && data.data.length > 0) {
      // En son kaydı aç
      await loadInspectionById(data.data[0].id);
    } else {
      // Yeni taslak oluştur
      await createNewInspection();
    }
  } catch (err) {
    console.error('Kayıt yüklenirken hata:', err);
    showToast('Sunucu bağlantısı kurulamadı, yerel taslak oluşturuluyor', 'warning');
  }
}

async function createNewInspection() {
  try {
    closeModal('archive-modal');
    const res = await fetch('/api/inspections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const result = await res.json();
    if (result.success) {
      activeInspection = result.data;
      currentStepNumber = 1;
      
      // Formu temiz verilerle dök ve 1. adıma geç (syncInputsToState yapmadan)
      renderAll();
      switchStep(1, true, true);
      
      // Stepper göstergelerini sıfırla
      document.querySelectorAll('.stepper-step').forEach(stepEl => {
        const s = parseInt(stepEl.getAttribute('data-step'), 10);
        stepEl.classList.remove('completed', 'active');
        if (s === 1) stepEl.classList.add('active');
      });

      showToast('Yeni denetim formu başlatıldı (Adım 1)', 'success');
    }
  } catch (err) {
    console.error('Yeni denetim oluşturma hatası:', err);
    showToast('Yeni form oluşturulamadı', 'error');
  }
}

async function loadInspectionById(id) {
  try {
    const res = await fetch(`/api/inspections/${id}`);
    const result = await res.json();
    if (result.success) {
      activeInspection = result.data;
      currentStepNumber = 1;
      
      // Önce tüm verileri ve fotoğrafları arayüze dök
      renderAll();
      // Ardından 1. adıma geç (stale sync yapmadan)
      switchStep(1, true, true);
      closeModal('archive-modal');
      showToast(`Rapor yüklendi: ${activeInspection.header?.reportNo || ''} (Düzenleme Modu)`, 'success');
    }
  } catch (err) {
    console.error('Rapor açma hatası:', err);
    showToast('Rapor yüklenemedi', 'error');
  }
}

// ==========================================
// 3. EVENT LISTENERS
// ==========================================
function setupEventListeners() {
  // Stepper Adım Tıklamaları
  document.querySelectorAll('.stepper-step').forEach(stepEl => {
    stepEl.addEventListener('click', () => {
      const stepIdx = parseInt(stepEl.getAttribute('data-step'), 10);
      switchStep(stepIdx);
    });
  });

  // Header Değiştirilebilir Alanlar (Görsel 3 gereksinimi)
  const reportNoInput = document.getElementById('hdr-report-no');
  const dateInput = document.getElementById('hdr-date');
  const inspectorInput = document.getElementById('hdr-inspector');
  const qcLeaderInput = document.getElementById('hdr-qc-leader');

  if (reportNoInput) {
    reportNoInput.addEventListener('input', (e) => {
      if (activeInspection) activeInspection.header.reportNo = e.target.value;
    });
  }
  if (dateInput) {
    dateInput.addEventListener('change', (e) => {
      if (activeInspection) activeInspection.header.inspectionDate = e.target.value;
    });
  }
  if (inspectorInput) {
    inspectorInput.addEventListener('input', (e) => {
      if (activeInspection) activeInspection.header.inspectorName = e.target.value;
    });
  }
  if (qcLeaderInput) {
    qcLeaderInput.addEventListener('input', (e) => {
      if (activeInspection) activeInspection.header.qcLeaderName = e.target.value;
    });
  }

  // Sipariş Adedi Değiştiğinde Otomatik AQL Hesaplama
  const inspectedPiecesInput = document.getElementById('inp-inspected-pieces');
  if (inspectedPiecesInput) {
    inspectedPiecesInput.addEventListener('input', (e) => {
      const lot = parseInt(e.target.value, 10);
      if (!isNaN(lot) && lot > 0) {
        autoCalculateAql(lot);
      }
    });
  }

  // Karar Butonları (PASS / PENDING / FAIL)
  document.querySelectorAll('.decision-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const decision = btn.getAttribute('data-decision');
      setInspectionDecision(decision);
    });
  });
}

// ==========================================
// 3b. FİRMA LOGOSU YÖNETİMİ (Tıklayarak Değiştirme)
// ==========================================
function triggerLogoUpload() {
  const input = document.getElementById('hdr-logo-input');
  if (input) input.click();
}

async function handleLogoUpload(inputEl) {
  const file = inputEl.files[0];
  if (!file) return;

  try {
    showToast('Firma logosu optimize ediliyor...', 'warning');
    const compResult = await compressImageFile(file, 800, 400, 0.9);

    if (activeInspection) {
      if (!activeInspection.header) activeInspection.header = {};
      activeInspection.header.logoUrl = compResult.dataUrl;
    }

    const logoImg = document.getElementById('hdr-logo-img');
    if (logoImg) logoImg.src = compResult.dataUrl;

    // Tarayıcı hafızasına varsayılan logo olarak kaydet
    localStorage.setItem('kmk_custom_logo', compResult.dataUrl);

    // Sunucuya tekil görsel olarak kaydet
    if (activeInspection) {
      await saveSinglePhotoToServer('header', 'logoUrl', { url: compResult.dataUrl });
    }

    showToast('Firma logosu başarıyla güncellendi!', 'success');
  } catch (err) {
    console.error('Logo yükleme hatası:', err);
    showToast('Logo yüklenirken hata oluştu', 'error');
  }
}

// ==========================================
// 4. OTOMATİK AQL VE ÖRNEKLEM HESAPLAMA
// ==========================================
function autoCalculateAql(lotSize) {
  if (!activeInspection) return;
  const result = AQL_TABLES.getCodeLetterLevel2(lotSize);
  const acRe = AQL_TABLES.getAcRe(result.letter);

  // Örnek miktarı ve koli sayısını güncelle
  activeInspection.product.samplePieces = result.sample;
  const inspectedCartons = parseInt(activeInspection.product.inspectedCartons, 10) || 50;
  const sampleCartons = Math.max(2, Math.round((result.sample / (lotSize / inspectedCartons))));
  activeInspection.product.sampleCartons = sampleCartons;

  // AQL tablosunu doldur
  activeInspection.aqlChecklist.generalSampleQty = result.sample;
  activeInspection.aqlChecklist.generalDefects.major.maxAc = acRe.majorAc;
  activeInspection.aqlChecklist.generalDefects.minor.maxAc = acRe.minorAc;
  activeInspection.aqlChecklist.generalDefects.critical.maxAc = 0;

  // UI Alanlarını güncelle
  const samplePiecesInput = document.getElementById('inp-sample-pieces');
  const sampleCartonsInput = document.getElementById('inp-sample-cartons');
  if (samplePiecesInput) samplePiecesInput.value = result.sample;
  if (sampleCartonsInput) sampleCartonsInput.value = sampleCartons;

  document.getElementById('aql-gen-sample-qty').innerText = result.sample;
  document.getElementById('aql-max-ac-critical').innerText = '0';
  document.getElementById('aql-max-ac-major').innerText = acRe.majorAc;
  document.getElementById('aql-max-ac-minor').innerText = acRe.minorAc;

  showToast(`AQL Otomatik Hesaplandı: Kod Harfi ${result.letter}, Numune: ${result.sample} adet, Majör Sınır: ${acRe.majorAc}`, 'success');
  recalculateDefects();
}

// =========================================================================
// 5. GÖRSEL 1 ➔ GÖRSEL 2 OTOMATİK TOPLAMA VE SENKRONİZASYON (Kritik Mantık)
// =========================================================================
function recalculateDefects() {
  if (!activeInspection) return;

  const rows = activeInspection.aqlChecklist.defectRows || [];
  let totalCritical = 0;
  let totalMajor = 0;
  let totalMinor = 0;

  rows.forEach(row => {
    const c = parseInt(row.critical, 10);
    const m = parseInt(row.major, 10);
    const mi = parseInt(row.minor, 10);
    if (!isNaN(c) && c > 0) totalCritical += c;
    if (!isNaN(m) && m > 0) totalMajor += m;
    if (!isNaN(mi) && mi > 0) totalMinor += mi;
  });

  // State'i güncelle
  activeInspection.aqlChecklist.generalDefects.critical.found = totalCritical;
  activeInspection.aqlChecklist.generalDefects.major.found = totalMajor;
  activeInspection.aqlChecklist.generalDefects.minor.found = totalMinor;

  // 2. Görseldeki Tablo 3 "Found (Bulundu)" Satırını Anlık Doldur
  const foundCritEl = document.getElementById('found-critical');
  const foundMajEl = document.getElementById('found-major');
  const foundMinEl = document.getElementById('found-minor');

  if (foundCritEl) foundCritEl.innerText = totalCritical;
  if (foundMajEl) foundMajEl.innerText = totalMajor;
  if (foundMinEl) foundMinEl.innerText = totalMinor;

  // Max Ac Limit Kontrolü ve Akıllı Uyarı
  const maxAcMajor = activeInspection.aqlChecklist.generalDefects.major.maxAc;
  const maxAcMinor = activeInspection.aqlChecklist.generalDefects.minor.maxAc;

  const alertBox = document.getElementById('aql-status-alert');
  if (alertBox) {
    if (totalCritical > 0) {
      alertBox.className = 'aql-alert-box alert-danger';
      alertBox.innerHTML = `⚠️ <strong>KRİTİK HATA TESPİT EDİLDİ!</strong> (${totalCritical} adet). Sevkiyat Durdurulmalı / Karar: FAIL`;
      suggestDecision('FAIL');
    } else if (totalMajor > maxAcMajor) {
      alertBox.className = 'aql-alert-box alert-danger';
      alertBox.innerHTML = `⚠️ <strong>MAJÖR KUSUR SINIRI AŞILDI!</strong> Bulunan: ${totalMajor}, Kabul Sınırı (Ac): ${maxAcMajor}. Önerilen Karar: FAIL / PENDING`;
      suggestDecision('FAIL');
    } else if (totalMinor > maxAcMinor) {
      alertBox.className = 'aql-alert-box alert-warning';
      alertBox.innerHTML = `⚠️ <strong>MİNÖR KUSUR SINIRI AŞILDI!</strong> Bulunan: ${totalMinor}, Kabul Sınırı (Ac): ${maxAcMinor}. Önerilen Karar: PENDING`;
      suggestDecision('PENDING');
    } else {
      alertBox.className = 'aql-alert-box alert-success';
      alertBox.innerHTML = `✅ <strong>AQL KUSUR LİMİTLERİ DAHİLİNDE:</strong> Majör: ${totalMajor}/${maxAcMajor}, Minör: ${totalMinor}/${maxAcMinor}. Önerilen Karar: PASS`;
      suggestDecision('PASS');
    }
  }
}

function suggestDecision(suggested) {
  const badge = document.getElementById('suggested-decision-badge');
  if (badge) {
    badge.innerText = `Önerilen: ${suggested}`;
    badge.className = `decision-suggest-badge ${suggested.toLowerCase()}`;
  }
}

function setInspectionDecision(status) {
  if (!activeInspection) return;
  activeInspection.finalResult.status = status;
  document.querySelectorAll('.decision-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.getAttribute('data-decision') === status);
  });
  showToast(`Karar güncellendi: ${status}`, 'success');
}

// ==========================================
// 6. ADIM GEÇİŞLERİ VE ZORUNLULUK DOĞRULAMASI
// ==========================================
function switchStep(targetStep, bypassValidation = false, skipSync = false) {
  if (targetStep < 1 || targetStep > 6) return;

  // İleriye geçiyorsa mevcut adımı doğrula
  if (targetStep > currentStepNumber && !bypassValidation) {
    const isValid = validateStep(currentStepNumber);
    if (!isValid) return; // Eksik varsa geçişi engelle
  }

  // Mevcut form verilerini activeInspection nesnesine topla
  if (!skipSync) {
    syncInputsToState();
  }

  currentStepNumber = targetStep;
  activeInspection.currentStep = currentStepNumber;

  // Stepper UI güncelle
  document.querySelectorAll('.stepper-step').forEach(stepEl => {
    const s = parseInt(stepEl.getAttribute('data-step'), 10);
    stepEl.classList.remove('active');
    if (s === currentStepNumber) {
      stepEl.classList.add('active');
    }
    if (s < currentStepNumber) {
      stepEl.classList.add('completed');
    } else {
      stepEl.classList.remove('completed');
    }
  });

  // Panelleri aç/kapa
  document.querySelectorAll('.step-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  const targetPanel = document.getElementById(`step-panel-${currentStepNumber}`);
  if (targetPanel) {
    targetPanel.classList.add('active');
  }

  // Header Sayfa Göstergesi (3. Görsel uyumu)
  const pageCell = document.getElementById('hdr-page-cell');
  if (pageCell) {
    pageCell.innerText = `Sayfa ${currentStepNumber} / 6`;
  }

  // Alt gezinme butonları görünürlüğü
  const prevBtn = document.getElementById('btn-nav-prev');
  const nextBtn = document.getElementById('btn-nav-next');
  const completeBtn = document.getElementById('btn-nav-complete');

  if (prevBtn) prevBtn.style.display = currentStepNumber === 1 ? 'none' : 'inline-flex';
  if (nextBtn) nextBtn.style.display = currentStepNumber === 6 ? 'none' : 'inline-flex';
  if (completeBtn) completeBtn.style.display = currentStepNumber === 6 ? 'inline-flex' : 'none';

  // Sayfayı yukarı yumuşak kaydır
  window.scrollTo({ top: 120, behavior: 'smooth' });
}

// Zorunlu alan kontrolü
function validateStep(step) {
  let isValid = true;
  let firstErrorEl = null;

  function markError(el, message) {
    isValid = false;
    if (el) {
      el.classList.add('is-invalid');
      if (!firstErrorEl) firstErrorEl = el;
    }
    showToast(message, 'error');
  }

  if (step === 1) {
    // Ürün & Sipariş zorunlu alanları
    const custEl = document.getElementById('inp-customer-name');
    const codeEl = document.getElementById('inp-product-code');
    const inspPiecesEl = document.getElementById('inp-inspected-pieces');
    const mainPhotoWrap = document.getElementById('card-main-photo');

    if (!custEl.value.trim()) markError(custEl, 'Lütfen Müşteri Adı giriniz.');
    if (!codeEl.value.trim()) markError(codeEl, 'Lütfen Ürün Kodu giriniz.');
    if (!inspPiecesEl.value.trim()) markError(inspPiecesEl, 'Lütfen İncelenen Parça Adedini giriniz.');
    if (!activeInspection.product.mainPhoto) {
      isValid = false;
      if (mainPhotoWrap) {
        mainPhotoWrap.classList.add('is-missing');
        if (!firstErrorEl) firstErrorEl = mainPhotoWrap;
      }
      showToast('Lütfen zorunlu Ürün Ana Fotoğrafını ekleyiniz.', 'error');
    }
  } else if (step === 2) {
    // Depo ve Paketleme Fotoğrafları
    const requiredPhotos = [
      { key: 'warehouse.stockPic', elId: 'card-photo-stockPic', name: 'Stok Fotoğrafı' },
      { key: 'warehouse.selectingCartons', elId: 'card-photo-selectingCartons', name: 'Karton Seçimi Fotoğrafı' },
      { key: 'packaging.cartonViewLogo', elId: 'card-photo-cartonViewLogo', name: 'Koli Logo Görünümü' },
      { key: 'packaging.shippingMark', elId: 'card-photo-shippingMark', name: 'Shipping Mark Fotoğrafı' },
      { key: 'packaging.barcodeScan', elId: 'card-photo-barcodeScan', name: 'Barkod Tarama Fotoğrafı' },
      { key: 'packaging.scanResult', elId: 'card-photo-scanResult', name: 'Barkod Tarama Sonucu' }
    ];

    requiredPhotos.forEach(item => {
      const parts = item.key.split('.');
      const val = activeInspection.photos[parts[0]][parts[1]]?.url;
      const cardEl = document.getElementById(item.elId);
      if (!val) {
        isValid = false;
        if (cardEl) {
          cardEl.classList.add('is-missing');
          if (!firstErrorEl) firstErrorEl = cardEl;
        }
        showToast(`Lütfen zorunlu '${item.name}' fotoğrafını yükleyiniz.`, 'error');
      }
    });
  } else if (step === 4) {
    // Ürün & Boyut Fotoğrafları
    const reqPhotosStep4 = [
      { key: 'products.product1', elId: 'card-photo-product1', name: 'ÜRÜN 1 (Ön Yüz)' },
      { key: 'products.printForm', elId: 'card-photo-printForm', name: 'Ürün ve Baskı Formu' },
      { key: 'specificChecking.dimensionCheck1', elId: 'card-photo-dimensionCheck1', name: 'En Kontrolü Fotoğrafı' },
      { key: 'specificChecking.weightCheck', elId: 'card-photo-weightCheck', name: 'Ağırlık Kontrolü Fotoğrafı' }
    ];

    reqPhotosStep4.forEach(item => {
      const parts = item.key.split('.');
      const val = activeInspection.photos[parts[0]][parts[1]]?.url;
      const cardEl = document.getElementById(item.elId);
      if (!val) {
        isValid = false;
        if (cardEl) {
          cardEl.classList.add('is-missing');
          if (!firstErrorEl) firstErrorEl = cardEl;
        }
        showToast(`Lütfen zorunlu '${item.name}' fotoğrafını ekleyiniz.`, 'error');
      }
    });
  } else if (step === 5) {
    // Spesifik Test Fotoğrafları
    const reqPhotosStep5 = [
      { key: 'specificChecking.cartonWeight', elId: 'card-photo-cartonWeight', name: 'Koli Tartımı Fotoğrafı' },
      { key: 'specificChecking.dynamicTest1', elId: 'card-photo-dynamicTest1', name: 'Dinamik Test Cihaz Fotoğrafı' },
      { key: 'specificChecking.staticTest1', elId: 'card-photo-staticTest1', name: 'Statik Test Fotoğrafı' },
      { key: 'specificChecking.dropTest1', elId: 'card-photo-dropTest1', name: 'Düşme Testi Fotoğrafı' }
    ];

    reqPhotosStep5.forEach(item => {
      const parts = item.key.split('.');
      const val = activeInspection.photos[parts[0]][parts[1]]?.url;
      const cardEl = document.getElementById(item.elId);
      if (!val) {
        isValid = false;
        if (cardEl) {
          cardEl.classList.add('is-missing');
          if (!firstErrorEl) firstErrorEl = cardEl;
        }
        showToast(`Lütfen zorunlu '${item.name}' test fotoğrafını ekleyiniz.`, 'error');
      }
    });
  }

  if (!isValid && firstErrorEl) {
    firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return isValid;
}

// Kaydet ve Sonraki Adıma Geç Butonu
async function handleSaveAndNext() {
  const isValid = validateStep(currentStepNumber);
  if (!isValid) return;

  syncInputsToState();
  await saveInspectionToServer();

  if (currentStepNumber < 6) {
    switchStep(currentStepNumber + 1);
    showToast(`Adım ${currentStepNumber - 1} kaydedildi, sonraki adıma geçildi.`, 'success');
  }
}

// ==========================================
// 7. INPUTLAR İLE STATE SENKRONİZASYONU
// ==========================================
function syncInputsToState() {
  if (!activeInspection) return;

  // Header
  activeInspection.header.reportNo = document.getElementById('hdr-report-no').value;
  activeInspection.header.inspectionDate = document.getElementById('hdr-date').value;
  activeInspection.header.inspectorName = document.getElementById('hdr-inspector').value;
  activeInspection.header.qcLeaderName = document.getElementById('hdr-qc-leader').value;

  // Adım 1: Ürün & Sipariş
  activeInspection.product.customerName = document.getElementById('inp-customer-name').value;
  activeInspection.product.productCode = document.getElementById('inp-product-code').value;
  activeInspection.product.customerRefCode = document.getElementById('inp-customer-ref').value;
  activeInspection.product.productName = document.getElementById('inp-product-name').value;
  activeInspection.product.barcode = document.getElementById('inp-barcode').value;
  activeInspection.product.inspectedPieces = document.getElementById('inp-inspected-pieces').value;
  activeInspection.product.inspectedCartons = document.getElementById('inp-inspected-cartons').value;
  activeInspection.product.samplePieces = document.getElementById('inp-sample-pieces').value;
  activeInspection.product.sampleCartons = document.getElementById('inp-sample-cartons').value;

  // Adım 2: Lojistik Tablosu
  activeInspection.logistic.cartonWeight = {
    techFile: document.getElementById('log-cw-tech').value,
    realCheck: document.getElementById('log-cw-real').value,
    shippingMark: document.getElementById('log-cw-ship').value,
    discrepancy: document.getElementById('log-cw-disc').value,
    remarks: document.getElementById('log-cw-rem').value
  };
  activeInspection.logistic.cartonDimension = {
    techFile: document.getElementById('log-cd-tech').value,
    realCheck: document.getElementById('log-cd-real').value,
    shippingMark: document.getElementById('log-cd-ship').value,
    discrepancy: document.getElementById('log-cd-disc').value,
    remarks: document.getElementById('log-cd-rem').value
  };
  activeInspection.logistic.palletWeight = {
    techFile: document.getElementById('log-pw-tech').value,
    realCheck: document.getElementById('log-pw-real').value,
    shippingMark: document.getElementById('log-pw-ship').value,
    discrepancy: document.getElementById('log-pw-disc').value,
    remarks: document.getElementById('log-pw-rem').value
  };
  activeInspection.logistic.palletDimension = {
    techFile: document.getElementById('log-pd-tech').value,
    realCheck: document.getElementById('log-pd-real').value,
    shippingMark: document.getElementById('log-pd-ship').value,
    discrepancy: document.getElementById('log-pd-disc').value,
    remarks: document.getElementById('log-pd-rem').value
  };
  activeInspection.logistic.cartonBarcode = document.getElementById('log-carton-barcode').value;
  activeInspection.logistic.palletBarcode = document.getElementById('log-pallet-barcode').value;

  // Adım 3: Spesifik S-3 Kontrolleri
  if (activeInspection.aqlChecklist) {
    if (!activeInspection.aqlChecklist.specificChecks) {
      activeInspection.aqlChecklist.specificChecks = {
        barcodeScan: { result: 'PASS', remarks: '' },
        dimensionCheck: { result: 'PASS', remarks: '' },
        otherTesting: { result: 'PASS', remarks: '' }
      };
    }
    const sbRes = document.getElementById('spec-barcode-res');
    const sbRem = document.getElementById('spec-barcode-rem');
    if (sbRes) activeInspection.aqlChecklist.specificChecks.barcodeScan.result = sbRes.value;
    if (sbRem) activeInspection.aqlChecklist.specificChecks.barcodeScan.remarks = sbRem.value;

    const sdRes = document.getElementById('spec-dim-res');
    const sdRem = document.getElementById('spec-dim-rem');
    if (sdRes) activeInspection.aqlChecklist.specificChecks.dimensionCheck.result = sdRes.value;
    if (sdRem) activeInspection.aqlChecklist.specificChecks.dimensionCheck.remarks = sdRem.value;

    const stRes = document.getElementById('spec-test-res');
    const stRem = document.getElementById('spec-test-rem');
    if (stRes) activeInspection.aqlChecklist.specificChecks.otherTesting.result = stRes.value;
    if (stRem) activeInspection.aqlChecklist.specificChecks.otherTesting.remarks = stRem.value;
  }

  // Adım 6: Nihai Karar ve Açıklamalar
  activeInspection.finalResult.globalComments = document.getElementById('inp-global-comments').value;
  activeInspection.finalResult.inspectorBadge = document.getElementById('inp-inspector-badge').value;
  activeInspection.finalResult.qcLeaderBadge = document.getElementById('inp-qcleader-badge').value;
}

// Sunucuya Kaydetme (Hafif ve Vercel 4.5MB limitine takılmayan mimari)
async function saveInspectionToServer() {
  if (!activeInspection) return;
  try {
    // Form metin verilerini klonla ve devasa base64 fotoğrafları bu istekten ayıkla (~15 KB)
    const payload = JSON.parse(JSON.stringify(activeInspection));
    if (payload.product) delete payload.product.mainPhoto;
    delete payload.photos;

    const res = await fetch(`/api/inspections/${activeInspection.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const result = await res.json();
    if (result.success) {
      updateSyncStatus('Kaydedildi (' + new Date().toLocaleTimeString() + ')');
      // Tarayıcı hafızasına güvenli yerel yedek al
      try {
        localStorage.setItem(`insp_${activeInspection.id}`, JSON.stringify(activeInspection));
      } catch (e) {}
    } else {
      throw new Error(result.message || 'Kayıt başarısız');
    }
  } catch (err) {
    console.error('Kayıt hatası:', err);
    updateSyncStatus('Bağlantı hatası!');
  }
}

// Tekil fotoğrafı sunucuya hafif POST olarak kaydetme (~50-80 KB)
async function saveSinglePhotoToServer(category, photoKey, photoData) {
  if (!activeInspection) return;
  try {
    const res = await fetch(`/api/inspections/${activeInspection.id}/photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, photoKey, photoData })
    });
    if (res.ok) {
      updateSyncStatus('Kaydedildi (' + new Date().toLocaleTimeString() + ')');
      try {
        localStorage.setItem(`insp_${activeInspection.id}`, JSON.stringify(activeInspection));
      } catch (e) {}
    }
  } catch (err) {
    console.error('Fotoğraf kayıt hatası:', err);
  }
}

// Kusur fotoğraflarını senkronize etme
async function saveDefectPhotoToServer(action, defectIndex, defectPhoto, defectPhotos) {
  if (!activeInspection) return;
  try {
    const res = await fetch(`/api/inspections/${activeInspection.id}/defect-photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, defectIndex, defectPhoto, defectPhotos })
    });
    if (res.ok) {
      updateSyncStatus('Kaydedildi (' + new Date().toLocaleTimeString() + ')');
      try {
        localStorage.setItem(`insp_${activeInspection.id}`, JSON.stringify(activeInspection));
      } catch (e) {}
    }
  } catch (err) {
    console.error('Kusur fotoğrafı kayıt hatası:', err);
  }
}

function updateSyncStatus(text) {
  const el = document.getElementById('sync-status-indicator');
  if (el) el.innerText = text;
}

// ==========================================
// 8. FOTOĞRAF YÜKLEME VE YÖNETİMİ
// ==========================================
async function handlePhotoUpload(inputEl, category, photoKey) {
  const file = inputEl.files[0];
  if (!file) return;

  try {
    showToast('Fotoğraf işleniyor ve optimize ediliyor...', 'warning');

    // İstemci tarafında çözünürlük korunarak optimize sıkıştırma (1200px, 0.72)
    const compResult = await compressImageFile(file, 1200, 1200, 0.72);

    // activeInspection içine doğrudan kaydet
    if (category === 'mainPhoto') {
      activeInspection.product.mainPhoto = compResult.dataUrl;
    } else {
      if (!activeInspection.photos[category][photoKey]) {
        activeInspection.photos[category][photoKey] = {};
      }
      activeInspection.photos[category][photoKey].url = compResult.dataUrl;
    }

    // UI'daki ilgili kartı güncelle
    renderPhotoCard(category, photoKey, compResult);
    showToast(`Görsel optimize edildi: ${compResult.origSizeKb} KB ➔ ${compResult.compSizeKb} KB`, 'success');

    // Sunucuya tekil fotoğraf olarak kaydet (~60 KB)
    const photoPayload = category === 'mainPhoto' ? { url: compResult.dataUrl } : { url: compResult.dataUrl };
    await saveSinglePhotoToServer(category, photoKey, photoPayload);
  } catch (err) {
    console.error('Fotoğraf yükleme hatası:', err);
    showToast('Fotoğraf optimize edilirken hata oluştu', 'error');
  }
}

function renderPhotoCard(category, photoKey, compResult) {
  let photoData;
  let cardEl;
  let inputId;

  if (category === 'mainPhoto') {
    cardEl = document.getElementById('card-main-photo');
    photoData = { url: activeInspection?.product?.mainPhoto, title: 'Ürün Ana Görseli' };
    inputId = 'file-input-mainPhoto';
  } else {
    cardEl = document.getElementById(`card-photo-${photoKey}`);
    photoData = activeInspection?.photos?.[category]?.[photoKey];
    inputId = `file-input-${photoKey}`;
  }

  if (!cardEl) return;
  cardEl.classList.remove('is-missing');

  const bodyEl = cardEl.querySelector('.photo-card-body');
  if (!bodyEl) return;

  if (photoData && photoData.url) {
    const sizeInfo = compResult ? `${compResult.compSizeKb} KB` : 'Optimize';
    bodyEl.innerHTML = `
      <div class="photo-preview-wrap">
        <span class="photo-badge-compressed">⚡ ${sizeInfo}</span>
        <img src="${photoData.url}" class="photo-preview-img" alt="${photoData.title || ''}" onclick="previewImageModal('${photoData.url}')" />
        <div class="photo-actions">
          <button type="button" class="btn-photo-action" onclick="triggerFileInput('${category}', '${photoKey || ''}')">🔄 Değiştir</button>
          <button type="button" class="btn-photo-action delete" onclick="removePhoto('${category}', '${photoKey || ''}')">🗑️ Sil</button>
        </div>
      </div>
      <input type="file" id="${inputId}" accept="image/*" capture="environment" style="display: none;" 
             onchange="handlePhotoUpload(this, '${category}', '${photoKey || ''}')">
    `;
  } else {
    const hint = category === 'mainPhoto' ? 'Paketlenmiş referans ürün fotoğrafı' : 'Otomatik sıkıştırılır (Max ~300KB)';
    bodyEl.innerHTML = `
      <div class="photo-upload-zone" onclick="document.getElementById('${inputId}').click()">
        <span class="photo-upload-icon">📷</span>
        <span class="photo-upload-text">Fotoğraf Seç veya Kamera Aç</span>
        <span class="photo-upload-hint">${hint}</span>
        <input type="file" id="${inputId}" accept="image/*" capture="environment" style="display: none;" 
               onchange="handlePhotoUpload(this, '${category}', '${photoKey || ''}')">
      </div>
    `;
  }
}

function triggerFileInput(category, photoKey) {
  const inputId = category === 'mainPhoto' ? 'file-input-mainPhoto' : `file-input-${photoKey}`;
  const inputEl = document.getElementById(inputId);
  if (inputEl) inputEl.click();
}

function removePhoto(category, photoKey) {
  if (!confirm('Fotoğrafı kaldırmak istediğinize emin misiniz?')) return;
  if (category === 'mainPhoto') {
    if (activeInspection.product) activeInspection.product.mainPhoto = null;
  } else {
    if (activeInspection.photos?.[category]?.[photoKey]) {
      activeInspection.photos[category][photoKey].url = null;
    }
  }
  renderPhotoCard(category, photoKey);
  saveSinglePhotoToServer(category, photoKey, { url: null });
  showToast('Fotoğraf kaldırıldı', 'warning');
}

// ==========================================
// 9. DİNAMİK KUSUR SATIRLARI (B1 Tablosu)
// ==========================================
function renderDefectRows() {
  const tbody = document.getElementById('defect-rows-tbody');
  if (!tbody || !activeInspection) return;

  const rows = activeInspection.aqlChecklist.defectRows || [];
  tbody.innerHTML = '';

  rows.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align: center; font-weight: 700; width: 40px;">${idx + 1}</td>
      <td>
        <input type="text" value="${escapeHtml(row.detail || '')}" 
               onchange="updateDefectRow(${idx}, 'detail', this.value)" 
               placeholder="Hata adı (Dürtücü Kesiği vb.)" style="font-weight: 600;" />
      </td>
      <td style="width: 85px;">
        <input type="number" class="num-center" value="${row.critical || ''}" min="0"
               oninput="updateDefectRow(${idx}, 'critical', this.value)" placeholder="0" />
      </td>
      <td style="width: 85px;">
        <input type="number" class="num-center" value="${row.major || ''}" min="0"
               oninput="updateDefectRow(${idx}, 'major', this.value)" placeholder="0" />
      </td>
      <td style="width: 85px;">
        <input type="number" class="num-center" value="${row.minor || ''}" min="0"
               oninput="updateDefectRow(${idx}, 'minor', this.value)" placeholder="0" />
      </td>
      <td>
        <input type="text" value="${escapeHtml(row.remarks || '')}" 
               onchange="updateDefectRow(${idx}, 'remarks', this.value)" 
               placeholder="Açıklama" />
      </td>
      <td style="text-align: center; width: 50px;">
        <button type="button" class="btn-sys" style="padding: 2px 6px; color: #ef4444;" 
                onclick="deleteDefectRow(${idx})">✕</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  recalculateDefects();
}

function addDefectRow() {
  if (!activeInspection) return;
  activeInspection.aqlChecklist.defectRows.push({
    id: Date.now(),
    detail: '',
    critical: '',
    major: '',
    minor: '',
    remarks: ''
  });
  renderDefectRows();
  showToast('Yeni kusur satırı eklendi', 'success');
}

function updateDefectRow(idx, field, value) {
  if (!activeInspection || !activeInspection.aqlChecklist.defectRows[idx]) return;
  activeInspection.aqlChecklist.defectRows[idx][field] = value;
  recalculateDefects();
}

function deleteDefectRow(idx) {
  if (!activeInspection) return;
  activeInspection.aqlChecklist.defectRows.splice(idx, 1);
  renderDefectRows();
  showToast('Kusur satırı silindi', 'warning');
}

// ==========================================
// 10. DİNAMİK KUSUR FOTOĞRAFLARI (Adım 6)
// ==========================================
function renderDefectPhotos() {
  const container = document.getElementById('defect-photos-container');
  if (!container || !activeInspection) return;

  const photos = activeInspection.photos.defectPhotos || [];
  container.innerHTML = '';

  if (photos.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 24px; background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 8px;">
        <p style="color: #64748b; font-size: 13.5px; margin-bottom: 8px;">Henüz kusur fotoğrafı eklenmedi.</p>
        <button type="button" class="btn-sys btn-sys-primary" onclick="addDefectPhotoCard()">➕ Kusur Fotoğrafı Ekle</button>
      </div>
    `;
    return;
  }

  photos.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.innerHTML = `
      <div class="photo-card-header">
        <div class="photo-card-title">
          <input type="text" value="${escapeHtml(item.title || `Kusur ${idx + 1}`)}" 
                 onchange="updateDefectPhoto(${idx}, 'title', this.value)" 
                 style="font-weight: 800; border: none; background: transparent; width: 70%;" />
          <select onchange="updateDefectPhoto(${idx}, 'type', this.value)" style="padding: 2px 6px; font-size: 12px; border-radius: 4px;">
            <option value="Major" ${item.type === 'Major' ? 'selected' : ''}>Majör</option>
            <option value="Minor" ${item.type === 'Minor' ? 'selected' : ''}>Minör</option>
            <option value="Critical" ${item.type === 'Critical' ? 'selected' : ''}>Kritik</option>
          </select>
        </div>
      </div>
      <div class="photo-card-body">
        ${item.url ? `
          <div class="photo-preview-wrap">
            <img src="${item.url}" class="photo-preview-img" onclick="previewImageModal('${item.url}')" />
            <div class="photo-actions">
              <button type="button" class="btn-photo-action delete" onclick="deleteDefectPhoto(${idx})">🗑️ Sil</button>
            </div>
          </div>
        ` : `
          <div class="photo-upload-zone" onclick="document.getElementById('defect-upload-${idx}').click()">
            <span class="photo-upload-icon">📷</span>
            <span class="photo-upload-text">Fotoğraf Seç veya Kamera Aç</span>
            <input type="file" id="defect-upload-${idx}" accept="image/*" capture="environment" style="display: none;" 
                   onchange="handleDefectPhotoUpload(this, ${idx})" />
          </div>
        `}
      </div>
      <div style="padding: 8px 14px; background: #fff; border-top: 1px solid #f1f5f9;">
        <input type="text" value="${escapeHtml(item.remarks || '')}" placeholder="Kusur detayı (Örn: 1 adette yüzeyde leke görüldü)" 
               onchange="updateDefectPhoto(${idx}, 'remarks', this.value)" 
               style="width: 100%; border: 1px solid #e2e8f0; padding: 4px 8px; border-radius: 4px; font-size: 12px;" />
      </div>
    `;
    container.appendChild(card);
  });
}

function addDefectPhotoCard() {
  if (!activeInspection) return;
  const newCard = {
    id: Date.now(),
    title: 'Major-1 Yeni Kusur',
    type: 'Major',
    url: null,
    remarks: ''
  };
  activeInspection.photos.defectPhotos.push(newCard);
  renderDefectPhotos();
  saveDefectPhotoToServer('add', null, newCard);
}

async function handleDefectPhotoUpload(inputEl, idx) {
  const file = inputEl.files[0];
  if (!file) return;
  const comp = await compressImageFile(file, 1200, 1200, 0.72);
  activeInspection.photos.defectPhotos[idx].url = comp.dataUrl;
  renderDefectPhotos();
  saveDefectPhotoToServer('update', idx, activeInspection.photos.defectPhotos[idx]);
}

function updateDefectPhoto(idx, field, val) {
  if (!activeInspection || !activeInspection.photos.defectPhotos[idx]) return;
  activeInspection.photos.defectPhotos[idx][field] = val;
  saveDefectPhotoToServer('update', idx, activeInspection.photos.defectPhotos[idx]);
}

function deleteDefectPhoto(idx) {
  activeInspection.photos.defectPhotos.splice(idx, 1);
  renderDefectPhotos();
  saveDefectPhotoToServer('delete', idx);
}

// ==========================================
// 11. ONAY MADDELERİ (Remarks for Approval)
// ==========================================
function renderApprovalRemarks() {
  const container = document.getElementById('approval-remarks-container');
  if (!container || !activeInspection) return;

  const remarks = activeInspection.finalResult.approvalRemarks || [];
  container.innerHTML = '';

  remarks.forEach((item, idx) => {
    const div = document.createElement('div');
    div.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 8px;';
    div.innerHTML = `
      <span style="font-weight: 700; width: 24px; text-align: center;">${idx + 1}.</span>
      <input type="text" value="${escapeHtml(item.text || '')}" placeholder="Onay / denetim notu giriniz..." 
             onchange="updateApprovalRemark(${idx}, this.value)" class="form-input" style="flex: 1; padding: 6px 10px;" />
      <button type="button" class="btn-sys" style="color: #ef4444;" onclick="deleteApprovalRemark(${idx})">✕</button>
    `;
    container.appendChild(div);
  });
}

function addApprovalRemark() {
  if (!activeInspection) return;
  activeInspection.finalResult.approvalRemarks.push({ id: Date.now(), text: '' });
  renderApprovalRemarks();
}

function updateApprovalRemark(idx, text) {
  if (!activeInspection || !activeInspection.finalResult.approvalRemarks[idx]) return;
  activeInspection.finalResult.approvalRemarks[idx].text = text;
}

function deleteApprovalRemark(idx) {
  activeInspection.finalResult.approvalRemarks.splice(idx, 1);
  renderApprovalRemarks();
}

// ==========================================
// 12. TÜM VERİLERİ ARAYÜZE DÖKME (RENDER ALL)
// ==========================================
function renderAll() {
  if (!activeInspection) return;

  // Header
  document.getElementById('hdr-report-no').value = activeInspection.header?.reportNo || '';
  document.getElementById('hdr-date').value = activeInspection.header?.inspectionDate || '';
  document.getElementById('hdr-inspector').value = activeInspection.header?.inspectorName || '';
  document.getElementById('hdr-qc-leader').value = activeInspection.header?.qcLeaderName || '';
  document.getElementById('hdr-page-cell').innerText = `Sayfa ${currentStepNumber} / 6`;

  // Header Logo
  const logoImg = document.getElementById('hdr-logo-img');
  const savedCustomLogo = localStorage.getItem('kmk_custom_logo');
  const activeLogo = activeInspection.header?.logoUrl || savedCustomLogo || '/assets/kmk-logo.svg';
  if (logoImg) logoImg.src = activeLogo;

  // Adım 1: Ürün & Sipariş
  const p = activeInspection.product || {};
  document.getElementById('inp-customer-name').value = p.customerName || '';
  document.getElementById('inp-product-code').value = p.productCode || '';
  document.getElementById('inp-customer-ref').value = p.customerRefCode || '';
  document.getElementById('inp-product-name').value = p.productName || '';
  document.getElementById('inp-barcode').value = p.barcode || '';
  document.getElementById('inp-inspected-pieces').value = p.inspectedPieces || '';
  document.getElementById('inp-inspected-cartons').value = p.inspectedCartons || '';
  document.getElementById('inp-sample-pieces').value = p.samplePieces || '';
  document.getElementById('inp-sample-cartons').value = p.sampleCartons || '';

  // Adım 2: Lojistik
  const log = activeInspection.logistic || {};
  document.getElementById('log-cw-tech').value = log.cartonWeight?.techFile || '';
  document.getElementById('log-cw-real').value = log.cartonWeight?.realCheck || '';
  document.getElementById('log-cw-ship').value = log.cartonWeight?.shippingMark || '';
  document.getElementById('log-cw-disc').value = log.cartonWeight?.discrepancy || '';
  document.getElementById('log-cw-rem').value = log.cartonWeight?.remarks || '';

  document.getElementById('log-cd-tech').value = log.cartonDimension?.techFile || '';
  document.getElementById('log-cd-real').value = log.cartonDimension?.realCheck || '';
  document.getElementById('log-cd-ship').value = log.cartonDimension?.shippingMark || '';
  document.getElementById('log-cd-disc').value = log.cartonDimension?.discrepancy || '';
  document.getElementById('log-cd-rem').value = log.cartonDimension?.remarks || '';

  document.getElementById('log-pw-tech').value = log.palletWeight?.techFile || '';
  document.getElementById('log-pw-real').value = log.palletWeight?.realCheck || '';
  document.getElementById('log-pw-ship').value = log.palletWeight?.shippingMark || '';
  document.getElementById('log-pw-disc').value = log.palletWeight?.discrepancy || '';
  document.getElementById('log-pw-rem').value = log.palletWeight?.remarks || '';

  document.getElementById('log-pd-tech').value = log.palletDimension?.techFile || '';
  document.getElementById('log-pd-real').value = log.palletDimension?.realCheck || '';
  document.getElementById('log-pd-ship').value = log.palletDimension?.shippingMark || '';
  document.getElementById('log-pd-disc').value = log.palletDimension?.discrepancy || '';
  document.getElementById('log-pd-rem').value = log.palletDimension?.remarks || '';

  document.getElementById('log-carton-barcode').value = log.cartonBarcode || '';
  document.getElementById('log-pallet-barcode').value = log.palletBarcode || '';

  // Adım 3: Kusurlar ve AQL Tablosu
  const aql = activeInspection.aqlChecklist;
  if (aql) {
    const genSampleEl = document.getElementById('aql-gen-sample-qty');
    const maxCritEl = document.getElementById('aql-max-ac-critical');
    const maxMajEl = document.getElementById('aql-max-ac-major');
    const maxMinEl = document.getElementById('aql-max-ac-minor');

    if (genSampleEl) genSampleEl.innerText = aql.generalSampleQty || p.samplePieces || '-';
    if (maxCritEl) maxCritEl.innerText = aql.generalDefects?.critical?.maxAc ?? '0';
    if (maxMajEl) maxMajEl.innerText = aql.generalDefects?.major?.maxAc ?? '10';
    if (maxMinEl) maxMinEl.innerText = aql.generalDefects?.minor?.maxAc ?? '21';

    if (aql.specificChecks) {
      const sbRes = document.getElementById('spec-barcode-res');
      const sbRem = document.getElementById('spec-barcode-rem');
      if (sbRes) sbRes.value = aql.specificChecks.barcodeScan?.result || 'PASS';
      if (sbRem) sbRem.value = aql.specificChecks.barcodeScan?.remarks || '';

      const sdRes = document.getElementById('spec-dim-res');
      const sdRem = document.getElementById('spec-dim-rem');
      if (sdRes) sdRes.value = aql.specificChecks.dimensionCheck?.result || 'PASS';
      if (sdRem) sdRem.value = aql.specificChecks.dimensionCheck?.remarks || '';

      const stRes = document.getElementById('spec-test-res');
      const stRem = document.getElementById('spec-test-rem');
      if (stRes) stRes.value = aql.specificChecks.otherTesting?.result || 'PASS';
      if (stRem) stRem.value = aql.specificChecks.otherTesting?.remarks || '';
    }
  }
  renderDefectRows();

  // Adım 6: Karar
  const fr = activeInspection.finalResult || {};
  document.getElementById('inp-global-comments').value = fr.globalComments || '';
  document.getElementById('inp-inspector-badge').value = fr.inspectorBadge || '';
  document.getElementById('inp-qcleader-badge').value = fr.qcLeaderBadge || '';
  setInspectionDecision(fr.status || 'PASS');
  renderApprovalRemarks();
  renderDefectPhotos();

  // Tüm Fotoğraf Kartlarını Güncelle
  renderAllPhotos();
}

function renderAllPhotos() {
  if (!activeInspection || !activeInspection.photos) return;

  // Ana Ürün Fotoğrafı
  renderPhotoCard('mainPhoto', null, null);

  // Depo ve Paketleme
  if (activeInspection.photos.warehouse) {
    Object.keys(activeInspection.photos.warehouse).forEach(k => renderPhotoCard('warehouse', k, null));
  }
  if (activeInspection.photos.packaging) {
    Object.keys(activeInspection.photos.packaging).forEach(k => renderPhotoCard('packaging', k, null));
  }

  // Ürünler ve Boyutlar
  if (activeInspection.photos.products) {
    Object.keys(activeInspection.photos.products).forEach(k => renderPhotoCard('products', k, null));
  }
  if (activeInspection.photos.specificChecking) {
    Object.keys(activeInspection.photos.specificChecking).forEach(k => renderPhotoCard('specificChecking', k, null));
  }
}

// ==========================================
// 13. ARŞİV / GEÇMİŞ DENETİMLER LİSTESİ MODALI
// ==========================================
async function openArchiveModal() {
  const modal = document.getElementById('archive-modal');
  const tbody = document.getElementById('archive-tbody');
  if (!modal || !tbody) return;

  modal.classList.add('active');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">Yükleniyor...</td></tr>';

  try {
    const res = await fetch('/api/inspections');
    const data = await res.json();
    if (!data.success || data.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #64748b;">Henüz kayıtlı denetim bulunmuyor.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    data.data.forEach(item => {
      const tr = document.createElement('tr');
      const statusClass = (item.status || 'TASLAK').toLowerCase();
      tr.innerHTML = `
        <td style="font-weight: 700; color: #1d4ed8;">${item.reportNo}</td>
        <td>${item.inspectionDate || '-'}</td>
        <td style="font-weight: 600;">${item.customerName || '-'}</td>
        <td>${item.productName || item.productCode || '-'}</td>
        <td><span class="decision-suggest-badge ${statusClass}">${item.status}</span></td>
        <td>${item.inspectorName || '-'}</td>
        <td style="text-align: right; white-space: nowrap;">
          <button type="button" class="btn-sys btn-sys-green" style="padding: 4px 10px; margin-right: 4px;" onclick="downloadInspectionPdf('${item.id}')">📄 PDF İndir</button>
          <button type="button" class="btn-sys btn-sys-primary" style="padding: 4px 8px; margin-right: 4px;" onclick="loadInspectionById('${item.id}')">Aç</button>
          <button type="button" class="btn-sys" style="padding: 4px 8px; color: #ef4444;" onclick="deleteInspection('${item.id}')">Sil</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Arşiv hatası:', err);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: red;">Veriler alınamadı</td></tr>';
  }
}

async function deleteInspection(id) {
  if (!confirm('Bu denetim kaydını silmek istediğinize emin misiniz?')) return;
  try {
    const res = await fetch(`/api/inspections/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Kayıt silindi', 'success');
      await openArchiveModal();
    }
  } catch (err) {
    showToast('Silinemedi', 'error');
  }
}

// ==========================================
// 14. DENETİMİ TAMAMLA (ARŞİVE KALICI KAYDET)
// ==========================================
async function handleCompleteInspection() {
  syncInputsToState();
  if (!activeInspection) return;

  activeInspection.finalResult.isCompleted = true;
  await saveInspectionToServer();

  showToast('🎉 Denetim başarıyla tamamlandı ve sisteme kaydedildi!', 'success');
  
  // Bildirim kutusu
  setTimeout(() => {
    alert(`Tebrikler! ${activeInspection.header.reportNo} numaralı denetim başarıyla tamamlandı ve sisteme kaydedildi.\n\nİstediğiniz zaman 'Denetim Arşivi' butonuna tıklayarak bu denetimi PDF olarak indirebilir veya inceleyebilirsiniz.`);
  }, 300);
}

// ==========================================
// 15. PDF RAPOR ÇIKTISI (BİREBİR WORD ŞABLONU)
// ==========================================
async function downloadInspectionPdf(id) {
  let targetInspection = activeInspection;
  
  if (id && (!activeInspection || activeInspection.id !== id)) {
    try {
      const res = await fetch(`/api/inspections/${id}`);
      const result = await res.json();
      if (result.success) {
        targetInspection = result.data;
      }
    } catch (err) {
      console.error('PDF için rapor çekme hatası:', err);
      showToast('Rapor yüklenemedi', 'error');
      return;
    }
  }

  if (!targetInspection) {
    showToast('Yazdırılacak denetim bulunamadı', 'error');
    return;
  }

  // Baskı şablonunu hazırla ve DOM'a göm
  renderPrintableReport(targetInspection);

  // Arşiv modalı açıksa gizle
  closeModal('archive-modal');

  // Tarayıcının yazdırma penceresini aç
  setTimeout(() => {
    window.print();
  }, 250);
}

function generatePdfReport() {
  syncInputsToState();
  saveInspectionToServer();
  if (activeInspection) {
    downloadInspectionPdf(activeInspection.id);
  }
}

function renderPrintHeader(insp, pageNum, totalPages) {
  const savedCustomLogo = localStorage.getItem('kmk_custom_logo');
  const printLogoSrc = insp.header?.logoUrl || savedCustomLogo || '/assets/kmk-logo.svg';
  return `
    <table class="print-table" style="margin-bottom: 5px; border: 1.5px solid #000;">
      <tr>
        <td style="width: 140px; text-align: center; padding: 2px 4px; background: #fff;">
          <img src="${printLogoSrc}" style="height: 36px; max-width: 130px; display: block; margin: 0 auto; object-fit: contain;">
        </td>
        <td style="text-align: center; font-size: 8.5pt; font-weight: bold; line-height: 1.25; padding: 2px 4px;">
          SELF-INSPECTION REPORT FORM<br>
          KENDİNDEN KONTROL RAPORU FORMU
        </td>
        <td style="width: 260px; padding: 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 7.5pt;">
            <tr>
              <td style="background: #e5e5e5; font-weight: bold; width: 105px; border-bottom: 1px solid #000; border-right: 1px solid #000; padding: 1.5px 4px;">Report No:</td>
              <td style="border-bottom: 1px solid #000; padding: 1.5px 4px; font-weight: bold; color: #0044aa;">${insp.header?.reportNo || '-'}</td>
            </tr>
            <tr>
              <td style="background: #e5e5e5; font-weight: bold; border-bottom: 1px solid #000; border-right: 1px solid #000; padding: 1.5px 4px;">Inspection Date:</td>
              <td style="border-bottom: 1px solid #000; padding: 1.5px 4px;">${insp.header?.inspectionDate || '-'}</td>
            </tr>
            <tr>
              <td style="background: #e5e5e5; font-weight: bold; border-bottom: 1px solid #000; border-right: 1px solid #000; padding: 1.5px 4px;">Inspector Name:</td>
              <td style="border-bottom: 1px solid #000; padding: 1.5px 4px;">${insp.header?.inspectorName || '-'}</td>
            </tr>
            <tr>
              <td style="background: #e5e5e5; font-weight: bold; border-right: 1px solid #000; padding: 1.5px 4px;">QC Leader Name:</td>
              <td style="padding: 1.5px 4px; display: flex; justify-content: space-between;">
                <span>${insp.header?.qcLeaderName || '-'}</span>
                <span style="font-weight: bold; color: #000;">${pageNum} of ${totalPages}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

function renderPrintPhotoBox(title, photoObj) {
  const url = photoObj && typeof photoObj === 'object' ? photoObj.url : (typeof photoObj === 'string' ? photoObj : null);
  const desc = photoObj && photoObj.desc ? photoObj.desc : (photoObj && photoObj.remarks ? photoObj.remarks : '');

  return `
    <div class="print-photo-box">
      <div class="print-photo-title">${escapeHtml(title)}</div>
      <div class="print-photo-img-wrap">
        ${url ? `<img src="${url}" class="print-photo-img" alt="${escapeHtml(title)}">` : `<div style="color: #aaa; font-size: 7.5pt; font-style: italic; padding: 20px;">[Fotoğraf Eklenmedi]</div>`}
      </div>
      ${desc ? `<div class="print-photo-desc">${escapeHtml(desc)}</div>` : ''}
    </div>
  `;
}

function renderPrintableReport(insp) {
  const container = document.getElementById('printable-report');
  if (!container) return;

  const totalPages = 10;
  const statusColor = insp.finalResult?.status === 'PASS' ? '#dcfce7; color: #166534;' : 
                      (insp.finalResult?.status === 'PENDING' ? '#fef3c7; color: #92400e;' : '#fee2e2; color: #991b1b;');

  const defects = insp.photos?.defectPhotos || [];

  container.innerHTML = `
    <!-- SAYFA 1: TÜM BİLGİ VE TABLOLAR -->
    <div class="print-page">
      ${renderPrintHeader(insp, 1, totalPages)}

      <!-- 1. PRODUCT & ORDER DETAIL -->
      <div class="print-banner">PRODUCT & ORDER DETAIL (ÜRÜN & SATIŞ DETAYLARI)</div>
      <table class="print-table">
        <tr>
          <td rowspan="7" style="width: 170px; text-align: center; vertical-align: middle; padding: 3px;">
            ${insp.product?.mainPhoto ? `<img src="${insp.product.mainPhoto}" style="max-height: 110px; max-width: 160px; object-fit: contain;">` : '<div style="color: #999; font-size: 7.5pt; padding: 25px;">[Ürün Ana Görseli]</div>'}
          </td>
          <td style="width: 20px; text-align: center; font-weight: bold;">1</td>
          <td style="width: 170px; font-weight: bold;">Customer Name (Müşteri Adı):</td>
          <td>${insp.product?.customerName || '-'}</td>
        </tr>
        <tr>
          <td style="text-align: center; font-weight: bold;">2</td>
          <td style="font-weight: bold;">Product Code (Ürün Kodu):</td>
          <td>${insp.product?.productCode || '-'}</td>
        </tr>
        <tr>
          <td style="text-align: center; font-weight: bold;">3</td>
          <td style="font-weight: bold;">Customer’s Ref. code:</td>
          <td>${insp.product?.customerRefCode || '-'}</td>
        </tr>
        <tr>
          <td style="text-align: center; font-weight: bold;">4</td>
          <td style="font-weight: bold;">Product Name (Ürün Adı):</td>
          <td>${insp.product?.productName || '-'}</td>
        </tr>
        <tr>
          <td style="text-align: center; font-weight: bold;">5</td>
          <td style="font-weight: bold;">Barcode (Barkod):</td>
          <td>${insp.product?.barcode || '-'}</td>
        </tr>
        <tr>
          <td style="text-align: center; font-weight: bold;">6</td>
          <td style="font-weight: bold;">Inspected Qty (İncelenen Miktar):</td>
          <td>Pieces: <strong>${insp.product?.inspectedPieces || '-'}</strong> | Cartons: <strong>${insp.product?.inspectedCartons || '-'}</strong></td>
        </tr>
        <tr>
          <td style="text-align: center; font-weight: bold;">7</td>
          <td style="font-weight: bold;">Sample Qty (Örnek Miktar):</td>
          <td>Pieces: <strong>${insp.product?.samplePieces || '-'}</strong> | Cartons: <strong>${insp.product?.sampleCartons || '-'}</strong></td>
        </tr>
      </table>

      <!-- 2. LOGISTIC -->
      <div class="print-banner">LOGISTIC (LOJİSTİK)</div>
      <table class="print-table">
        <thead>
          <tr>
            <th style="width: 20px;">No</th>
            <th>Carton & Pallet</th>
            <th>Technical File (A)</th>
            <th>Real Checking (B)</th>
            <th>Shipping Mark (C)</th>
            <th>Discrepancy (%)</th>
            <th>Remarks</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="text-align: center; font-weight: bold;">1</td>
            <td>Carton WEIGHT (Karton Ağırlığı)</td>
            <td style="text-align: center;">${insp.logistic?.cartonWeight?.techFile || '-'}</td>
            <td style="text-align: center;">${insp.logistic?.cartonWeight?.realCheck || '-'}</td>
            <td style="text-align: center;">${insp.logistic?.cartonWeight?.shippingMark || '-'}</td>
            <td style="text-align: center;">${insp.logistic?.cartonWeight?.discrepancy || '-'}</td>
            <td>${insp.logistic?.cartonWeight?.remarks || '-'}</td>
          </tr>
          <tr>
            <td style="text-align: center; font-weight: bold;">2</td>
            <td>Carton DIMENSION (Karton Boyutu)</td>
            <td style="text-align: center;">${insp.logistic?.cartonDimension?.techFile || '-'}</td>
            <td style="text-align: center;">${insp.logistic?.cartonDimension?.realCheck || '-'}</td>
            <td style="text-align: center;">${insp.logistic?.cartonDimension?.shippingMark || '-'}</td>
            <td style="text-align: center;">${insp.logistic?.cartonDimension?.discrepancy || '-'}</td>
            <td>${insp.logistic?.cartonDimension?.remarks || '-'}</td>
          </tr>
          <tr>
            <td style="text-align: center; font-weight: bold;">3</td>
            <td>Pallet WEIGHT (Palet Ağırlığı)</td>
            <td style="text-align: center;">${insp.logistic?.palletWeight?.techFile || '-'}</td>
            <td style="text-align: center;">${insp.logistic?.palletWeight?.realCheck || '-'}</td>
            <td style="text-align: center;">${insp.logistic?.palletWeight?.shippingMark || '-'}</td>
            <td style="text-align: center;">${insp.logistic?.palletWeight?.discrepancy || '-'}</td>
            <td>${insp.logistic?.palletWeight?.remarks || '-'}</td>
          </tr>
          <tr>
            <td style="text-align: center; font-weight: bold;">4</td>
            <td>Pallet DIMENSION (Palet Boyutu)</td>
            <td style="text-align: center;">${insp.logistic?.palletDimension?.techFile || '-'}</td>
            <td style="text-align: center;">${insp.logistic?.palletDimension?.realCheck || '-'}</td>
            <td style="text-align: center;">${insp.logistic?.palletDimension?.shippingMark || '-'}</td>
            <td style="text-align: center;">${insp.logistic?.palletDimension?.discrepancy || '-'}</td>
            <td>${insp.logistic?.palletDimension?.remarks || '-'}</td>
          </tr>
          <tr>
            <td style="text-align: center; font-weight: bold;">5</td>
            <td>CARTON BARCODE</td>
            <td colspan="5" style="font-weight: bold; color: #0044aa;">${insp.logistic?.cartonBarcode || '-'}</td>
          </tr>
          <tr>
            <td style="text-align: center; font-weight: bold;">6</td>
            <td>PALLET BARCODE</td>
            <td colspan="5">${insp.logistic?.palletBarcode || '-'}</td>
          </tr>
        </tbody>
      </table>

      <!-- 3. FINAL INSPECTION RESULT -->
      <div class="print-banner">FINAL INSPECTION RESULT (SON DENETİM SONUCU)</div>
      <table class="print-table">
        <tr>
          <td style="width: 250px; font-weight: bold;">GLOBAL COMMENTS (veya BAŞARISIZ olmanın ana nedeni):</td>
          <td style="font-size: 11pt; font-weight: bold; text-align: center; width: 100px; background: ${statusColor}">
            ${insp.finalResult?.status || 'PASS'}
          </td>
          <td style="font-style: italic;">
            ${insp.finalResult?.globalComments || '-'}
          </td>
        </tr>
      </table>

      <!-- 4. AQL CHECKLIST & DEFECTS -->
      <div class="print-banner">INSPECTION Checklist & Defects (DENETLEME Kontrol & Hatalar)</div>
      <table class="print-table">
        <thead>
          <tr>
            <th colspan="4" style="background: #e0f2fe !important;">A. GENERAL level II</th>
            <th colspan="4">B. SPECIFIC S-3</th>
          </tr>
          <tr>
            <th style="width: 130px;">Sample qty</th>
            <th colspan="3">${insp.aqlChecklist?.generalSampleQty || '315'}</th>
            <th style="width: 130px;">Sample qty</th>
            <th colspan="3">-</th>
          </tr>
          <tr style="background: #f9f9f9;">
            <th>Defects</th><th>Critical 0</th><th>Major 1.5</th><th>Minor 4.0</th>
            <th>Defects</th><th>Critical 0</th><th>Major 1.5</th><th>Minor 4.0</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Max Ac</strong></td>
            <td style="text-align: center;">${insp.aqlChecklist?.generalDefects?.critical?.maxAc ?? 0}</td>
            <td style="text-align: center; font-weight: bold;">${insp.aqlChecklist?.generalDefects?.major?.maxAc ?? 10}</td>
            <td style="text-align: center; font-weight: bold;">${insp.aqlChecklist?.generalDefects?.minor?.maxAc ?? 21}</td>
            <td><strong>Max Ac</strong></td>
            <td style="text-align: center;">0</td><td style="text-align: center;">0</td><td style="text-align: center;">0</td>
          </tr>
          <tr style="background: #fefce8; font-weight: bold;">
            <td><strong>Found (Bulundu)</strong></td>
            <td style="text-align: center; color: red;">${insp.aqlChecklist?.generalDefects?.critical?.found ?? 0}</td>
            <td style="text-align: center; color: blue;">${insp.aqlChecklist?.generalDefects?.major?.found ?? 0}</td>
            <td style="text-align: center; color: green;">${insp.aqlChecklist?.generalDefects?.minor?.found ?? 0}</td>
            <td><strong>Found</strong></td>
            <td style="text-align: center;">-</td><td style="text-align: center;">-</td><td style="text-align: center;">-</td>
          </tr>
        </tbody>
      </table>

      <!-- B1. GENERAL LEVEL II DEFECTS -->
      <div class="print-banner">B1. GENERAL level II (GENEL seviye 2 - Bulunan Kusurlar)</div>
      <table class="print-table" style="margin-bottom: 0;">
        <thead>
          <tr>
            <th style="width: 20px;">No</th>
            <th>Details and methods (Detaylar ve Yöntemler)</th>
            <th style="width: 60px;">critical</th>
            <th style="width: 60px;">major</th>
            <th style="width: 60px;">minor</th>
            <th>Remarks (Açıklamalar)</th>
          </tr>
        </thead>
        <tbody>
          ${(insp.aqlChecklist?.defectRows || []).map((row, idx) => `
            <tr>
              <td style="text-align: center; font-weight: bold;">${idx + 1}</td>
              <td>${escapeHtml(row.detail || '-')}</td>
              <td style="text-align: center; font-weight: bold; color: red;">${row.critical || ''}</td>
              <td style="text-align: center; font-weight: bold; color: blue;">${row.major || ''}</td>
              <td style="text-align: center; font-weight: bold; color: green;">${row.minor || ''}</td>
              <td>${escapeHtml(row.remarks || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- SAYFA 2: DEPO VE PAKETLEME (4 BÜYÜK RESİM) -->
    <div class="print-page">
      ${renderPrintHeader(insp, 2, totalPages)}
      <div class="print-banner">PICTURES: WAREHOUSE & PACKAGING (DEPO VE PAKETLEME)</div>
      <div class="print-photo-grid">
        ${renderPrintPhotoBox('Stock Pic (Stok fotoğrafı)', insp.photos?.warehouse?.stockPic)}
        ${renderPrintPhotoBox('Selecting Cartons (Karton Seçimi)', insp.photos?.warehouse?.selectingCartons)}
        ${renderPrintPhotoBox('Carton view LOGO (Karton LOGO)', insp.photos?.packaging?.cartonViewLogo)}
        ${renderPrintPhotoBox('Shipping Mark (Nakliye Marksı)', insp.photos?.packaging?.shippingMark)}
      </div>
    </div>

    <!-- SAYFA 3: BARKOD TARAMA VE ÜRÜNLER (4 BÜYÜK RESİM) -->
    <div class="print-page">
      ${renderPrintHeader(insp, 3, totalPages)}
      <div class="print-banner">PICTURES: BARCODE & PRODUCTS (BARKOD VE ÜRÜNLER)</div>
      <div class="print-photo-grid">
        ${renderPrintPhotoBox('Barcode Scan (Barkod Tarama)', insp.photos?.packaging?.barcodeScan)}
        ${renderPrintPhotoBox('Scan result of barcode (Tarama Sonucu)', insp.photos?.packaging?.scanResult)}
        ${renderPrintPhotoBox('PRODUCT 1 (ÜRÜN 1)', insp.photos?.products?.product1)}
        ${renderPrintPhotoBox('PRODUCT 2 (ÜRÜN 2)', insp.photos?.products?.product2)}
      </div>
    </div>

    <!-- SAYFA 4: ÜRÜN KÖRÜK, BASKI FORMU VE BOYUTLAR (4 BÜYÜK RESİM) -->
    <div class="print-page">
      ${renderPrintHeader(insp, 4, totalPages)}
      <div class="print-banner">PICTURES: PRODUCTS & DIMENSIONS (ÜRÜN VE BOYUT KONTROLLERİ)</div>
      <div class="print-photo-grid">
        ${renderPrintPhotoBox('PRODUCT 3 (ÜRÜN 3)', insp.photos?.products?.product3)}
        ${renderPrintPhotoBox('Product and Print Form (Baskı Formu)', insp.photos?.products?.printForm)}
        ${renderPrintPhotoBox('Dimension check 1 (En Kontrolü)', insp.photos?.specificChecking?.dimensionCheck1)}
        ${renderPrintPhotoBox('Dimension check 2 (Körük Kontrolü)', insp.photos?.specificChecking?.dimensionCheck2)}
      </div>
    </div>

    <!-- SAYFA 5: BOY, ÜRÜN AĞIRLIĞI VE GRAMAJLAR (4 BÜYÜK RESİM) -->
    <div class="print-page">
      ${renderPrintHeader(insp, 5, totalPages)}
      <div class="print-banner">PICTURES: DIMENSION, WEIGHT & GRAMMAGE (BOY, AĞIRLIK VE GRAMAJ)</div>
      <div class="print-photo-grid">
        ${renderPrintPhotoBox('Dimension Check 3 (Boy Kontrolü)', insp.photos?.specificChecking?.dimensionCheck3)}
        ${renderPrintPhotoBox('Weight Check (Ürün Ağırlık Kontrolü)', insp.photos?.specificChecking?.weightCheck)}
        ${renderPrintPhotoBox('Grammage Check 1 (Numune Kesme Aparatı)', insp.photos?.specificChecking?.grammageCheck1)}
        ${renderPrintPhotoBox('Grammage Check 2 (Hassas Terazi Gramajı)', insp.photos?.specificChecking?.grammageCheck2)}
      </div>
    </div>

    <!-- SAYFA 6: DESTE, ADET VE KOLİ TARTIMI (4 BÜYÜK RESİM) -->
    <div class="print-page">
      ${renderPrintHeader(insp, 6, totalPages)}
      <div class="print-banner">PICTURES: DECK, PIECE & CARTON WEIGHT (DESTE, ADET VE KOLİ TARTIMI)</div>
      <div class="print-photo-grid">
        ${renderPrintPhotoBox('Deck Check (Deste Kontrolü)', insp.photos?.specificChecking?.deckCheck)}
        ${renderPrintPhotoBox('Piece Check (Adet Kontrolü)', insp.photos?.specificChecking?.pieceCheck)}
        ${renderPrintPhotoBox('Carton Weight (Karton Tartımı)', insp.photos?.specificChecking?.cartonWeight)}
        ${renderPrintPhotoBox('Carton Weight Display (Baskül Ekranı)', insp.photos?.specificChecking?.cartonWeightScale)}
      </div>
    </div>

    <!-- SAYFA 7: DİNAMİK VE STATİK TESTLER (4 BÜYÜK RESİM) -->
    <div class="print-page">
      ${renderPrintHeader(insp, 7, totalPages)}
      <div class="print-banner">PICTURES: DYNAMIC & STATIC TESTS (DİNAMİK VE STATİK TESTLER)</div>
      <div class="print-photo-grid">
        ${renderPrintPhotoBox('Dinamic Test 1 (Dinamik Cihaz)', insp.photos?.specificChecking?.dynamicTest1)}
        ${renderPrintPhotoBox('Dinamic Test 2 (Sayaç Ekranı)', insp.photos?.specificChecking?.dynamicTest2)}
        ${renderPrintPhotoBox('Static Test (Statik Askı)', insp.photos?.specificChecking?.staticTest1)}
        ${renderPrintPhotoBox('Test Result (Statik Sonuç)', insp.photos?.specificChecking?.staticTestResult)}
      </div>
    </div>

    <!-- SAYFA 8: KATLAMA, SALLAMA VE DÜŞME TESTLERİ (4 BÜYÜK RESİM) -->
    <div class="print-page">
      ${renderPrintHeader(insp, 8, totalPages)}
      <div class="print-banner">PICTURES: TEAR, SHAKE & DROP TESTS (KATLAMA, SALLAMA VE DÜŞME)</div>
      <div class="print-photo-grid">
        ${renderPrintPhotoBox('Tear / Folding Test 1', insp.photos?.specificChecking?.tearFolding1)}
        ${renderPrintPhotoBox('Tear / Folding Test 2', insp.photos?.specificChecking?.tearFolding2)}
        ${renderPrintPhotoBox('Shake Test 1 (Sallama Testi)', insp.photos?.specificChecking?.shakeTest1)}
        ${renderPrintPhotoBox('Drop Test (61 cm Düşme Testi)', insp.photos?.specificChecking?.dropTest1)}
      </div>
    </div>

    <!-- SAYFA 9: DÜŞME SONUCU VE KUSUR FOTOĞRAFLARI (4 BÜYÜK RESİM) -->
    <div class="print-page">
      ${renderPrintHeader(insp, 9, totalPages)}
      <div class="print-banner">PICTURES: DROP RESULT & DEFECTS (DÜŞME SONUCU VE KUSURLAR)</div>
      <div class="print-photo-grid">
        ${renderPrintPhotoBox('Drop Test Result (Düşme Sonucu)', insp.photos?.specificChecking?.dropTestResult)}
        ${defects[0] ? renderPrintPhotoBox(`${defects[0].title || 'Kusur 1'} (${defects[0].type || 'Major'})`, defects[0]) : renderPrintPhotoBox('Major-1 Yüzeyde Leke (Örnek)', null)}
        ${defects[1] ? renderPrintPhotoBox(`${defects[1].title || 'Kusur 2'} (${defects[1].type || 'Major'})`, defects[1]) : renderPrintPhotoBox('Major-1 Zarf Bozuk (Örnek)', null)}
        ${defects[2] ? renderPrintPhotoBox(`${defects[2].title || 'Kusur 3'} (${defects[2].type || 'Major'})`, defects[2]) : renderPrintPhotoBox('Major-1 Dürtücü Kesiği (Örnek)', null)}
      </div>
    </div>

    <!-- SAYFA 10: DİĞER KUSURLAR, ONAY MADDELERİ VE İMZALAR -->
    <div class="print-page">
      ${renderPrintHeader(insp, 10, totalPages)}

      <div class="print-banner">DEFECTS CONT'D (DİĞER KUSUR FOTOĞRAFLARI)</div>
      <div class="print-photo-grid">
        ${defects[3] ? renderPrintPhotoBox(`${defects[3].title || 'Kusur 4'} (${defects[3].type || 'Minor'})`, defects[3]) : renderPrintPhotoBox('Minor-1 Tutkal İzi (Örnek)', null)}
        ${defects[4] ? renderPrintPhotoBox(`${defects[4].title || 'Kusur 5'}`, defects[4]) : '<div class="print-photo-box" style="border: 1.5px dashed #ccc; display: flex; align-items: center; justify-content: center; font-size: 8pt; color: #999; height: 230px;">[Ek Kusur Yok]</div>'}
      </div>

      <!-- ONAY VE AÇIKLAMA MADDELERİ -->
      <div class="print-banner" style="margin-top: 10px;">Remarks for Approval (Açıklama ve Onay Maddeleri)</div>
      <table class="print-table">
        <thead>
          <tr><th style="width: 25px;">No</th><th>Details (Detaylar)</th></tr>
        </thead>
        <tbody>
          ${(insp.finalResult?.approvalRemarks || []).map((r, i) => `
            <tr><td style="text-align: center; font-weight: bold;">${i + 1}</td><td>${escapeHtml(r.text || '-')}</td></tr>
          `).join('')}
        </tbody>
      </table>

      <!-- İMZA VE SİCİL TABLOSU -->
      <table class="print-table" style="margin-top: 10px;">
        <tr>
          <td style="width: 50%; padding: 10px; vertical-align: top;">
            <strong>Inspector batch (Denetçi Sicil / İmza):</strong><br>
            <span style="font-size: 10.5pt; color: #0044aa; font-weight: bold;">${insp.header?.inspectorName || '-'}</span><br>
            Sicil / Batch: ${insp.finalResult?.inspectorBadge || '-'}<br>
            Tarih: ${insp.header?.inspectionDate || '-'}
          </td>
          <td style="width: 50%; padding: 10px; vertical-align: top;">
            <strong>QC leader batch (Kalite Lideri Sicil / İmza):</strong><br>
            <span style="font-size: 10.5pt; color: #0044aa; font-weight: bold;">${insp.header?.qcLeaderName || '-'}</span><br>
            Sicil / Batch: ${insp.finalResult?.qcLeaderBadge || '-'}<br>
            Tarih: ${insp.header?.inspectionDate || '-'}
          </td>
        </tr>
      </table>
    </div>
  `;
}

// ==========================================
// 16. MODAL & YARDIMCI FONKSİYONLAR
// ==========================================
function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

function previewImageModal(url) {
  const modal = document.getElementById('image-preview-modal');
  const imgEl = document.getElementById('preview-modal-img');
  if (modal && imgEl) {
    imgEl.src = url;
    modal.classList.add('active');
  }
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast-notification');
  if (!toast) return;

  toast.innerText = message;
  toast.className = `toast-msg ${type}`;
  toast.style.display = 'flex';

  setTimeout(() => {
    toast.style.display = 'none';
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
