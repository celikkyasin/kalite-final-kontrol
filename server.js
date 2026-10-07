const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3050;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure directories
const isVercel = !!process.env.VERCEL;
const dataDir = isVercel ? path.join('/tmp', 'data') : path.join(__dirname, 'data');
const uploadsDir = isVercel ? path.join('/tmp', 'uploads') : path.join(__dirname, 'uploads');

if (!fs.existsSync(dataDir)) {
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}
}
if (!fs.existsSync(uploadsDir)) {
  try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (e) {}
}

const bundledDbPath = path.join(__dirname, 'data', 'inspections.json');
const dbFilePath = path.join(dataDir, 'inspections.json');

if (isVercel && !fs.existsSync(dbFilePath) && fs.existsSync(bundledDbPath)) {
  try {
    fs.copyFileSync(bundledDbPath, dbFilePath);
  } catch (e) {
    console.error('Failed to copy initial DB to /tmp:', e);
  }
} else if (!fs.existsSync(dbFilePath)) {
  try {
    fs.writeFileSync(dbFilePath, JSON.stringify([]), 'utf-8');
  } catch (e) {}
}

// Multer storage for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

// Helper functions for DB
function getInspections() {
  try {
    const content = fs.readFileSync(dbFilePath, 'utf-8');
    return JSON.parse(content || '[]');
  } catch (err) {
    console.error('Error reading inspections DB:', err);
    return [];
  }
}

function saveInspections(list) {
  fs.writeFileSync(dbFilePath, JSON.stringify(list, null, 2), 'utf-8');
}

// ==========================================
// REST API Endpoints (ERP Entegrasyonuna Uygun)
// ==========================================

// 1. Get all inspections (list view with search & filters)
app.get('/api/inspections', (req, res) => {
  const { search, status, date } = req.query;
  let list = getInspections();

  if (search) {
    const s = search.toLowerCase();
    list = list.filter(i => 
      (i.header?.reportNo && i.header.reportNo.toLowerCase().includes(s)) ||
      (i.product?.customerName && i.product.customerName.toLowerCase().includes(s)) ||
      (i.product?.productCode && i.product.productCode.toLowerCase().includes(s)) ||
      (i.header?.inspectorName && i.header.inspectorName.toLowerCase().includes(s))
    );
  }

  if (status) {
    list = list.filter(i => (i.finalResult?.status || '').toUpperCase() === status.toUpperCase());
  }

  if (date) {
    list = list.filter(i => i.header?.inspectionDate === date);
  }

  // Return summary list for performance
  const summaries = list.map(i => ({
    id: i.id,
    reportNo: i.header?.reportNo || 'Yeni Rapor',
    inspectionDate: i.header?.inspectionDate || '',
    inspectorName: i.header?.inspectorName || '',
    qcLeaderName: i.header?.qcLeaderName || '',
    customerName: i.product?.customerName || '',
    productName: i.product?.productName || '',
    productCode: i.product?.productCode || '',
    inspectedQty: i.product?.inspectedPieces || 0,
    status: i.finalResult?.status || 'TASLAK',
    currentStep: i.currentStep || 1,
    updatedAt: i.updatedAt || i.createdAt
  }));

  res.json({ success: true, count: summaries.length, data: summaries });
});

// 2. Get single inspection by ID
app.get('/api/inspections/:id', (req, res) => {
  const list = getInspections();
  const item = list.find(i => i.id === req.params.id);
  if (!item) {
    return res.status(404).json({ success: false, message: 'Denetim raporu bulunamadı' });
  }
  res.json({ success: true, data: item });
});

// 3. Create new inspection (draft)
app.post('/api/inspections', (req, res) => {
  const list = getInspections();
  const now = new Date();
  
  // Format default date: DD.MM.YYYY
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const defaultDate = `${dd}.${mm}.${yyyy}`;
  
  // Format default report no: YYMMFK00X
  const reportPrefix = `${String(yyyy).slice(-2)}${mm}FK`;
  const countThisMonth = list.filter(i => (i.header?.reportNo || '').startsWith(reportPrefix)).length + 1;
  const defaultReportNo = `${reportPrefix}${String(countThisMonth).padStart(3, '0')}`;

  const newInspection = {
    id: `insp-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    currentStep: 1,
    header: {
      reportNo: defaultReportNo,
      inspectionDate: defaultDate,
      inspectorName: '',
      qcLeaderName: '',
      companyName: 'Kütahya Ambalaj San. ve Tic. A.Ş.',
      reportTitle: 'SELF-INSPECTION REPORT FORM/KENDİNDEN KONTROL RAPORU FORMU'
    },
    product: {
      mainPhoto: null,
      customerName: '',
      productCode: '',
      customerRefCode: '',
      productName: '',
      barcode: '',
      inspectedPieces: '',
      inspectedCartons: '',
      samplePieces: '',
      sampleCartons: ''
    },
    logistic: {
      cartonWeight: { techFile: '', realCheck: '', shippingMark: '', discrepancy: '', remarks: '' },
      cartonDimension: { techFile: '', realCheck: '', shippingMark: '', discrepancy: '', remarks: '' },
      palletWeight: { techFile: '', realCheck: '', shippingMark: '', discrepancy: '', remarks: '' },
      palletDimension: { techFile: '', realCheck: '', shippingMark: '', discrepancy: '', remarks: '' },
      cartonBarcode: '',
      palletBarcode: ''
    },
    aqlChecklist: {
      generalLevel: 'II',
      specificLevel: 'S-3',
      generalSampleQty: '',
      specificSampleQty: '',
      generalDefects: {
        critical: { aql: 0, maxAc: 0, found: 0 },
        major: { aql: 1.5, maxAc: 10, found: 0 },
        minor: { aql: 4.0, maxAc: 21, found: 0 }
      },
      specificDefects: {
        critical: { aql: 0, maxAc: 0, found: 0 },
        major: { aql: 1.5, maxAc: 0, found: 0 },
        minor: { aql: 4.0, maxAc: 0, found: 0 }
      },
      defectRows: [
        { id: 1, detail: 'Dürtücü Kesiği', critical: '', major: '', minor: '', remarks: '' },
        { id: 2, detail: 'Zarf Bozuk', critical: '', major: '', minor: '', remarks: '' },
        { id: 3, detail: 'Yüzeyde Leke', critical: '', major: '', minor: '', remarks: '' },
        { id: 4, detail: 'Tutkal İzi', critical: '', major: '', minor: '', remarks: '' }
      ],
      specificChecks: {
        barcodeScan: { result: 'PASS', remarks: '' },
        dimensionCheck: { result: 'PASS', remarks: '' },
        otherTesting: { result: 'PASS', remarks: '' }
      }
    },
    photos: {
      warehouse: {
        stockPic: { url: null, title: 'Stock Pic (Stok fotoğrafı)', desc: 'Depodaki palet dizilimi ve stok durumu', required: true },
        selectingCartons: { url: null, title: 'Selecting Cartons (Karton Seçimi)', desc: 'Rastgele seçilen koli açılımı ve yerleşimi', required: true }
      },
      packaging: {
        cartonViewLogo: { url: null, title: 'Carton view LOGO (Karton görünümü LOGO)', desc: 'Koli dış yüzeyi ve logo baskısı', required: true },
        shippingMark: { url: null, title: 'Shipping Mark (Nakliye Marksı)', desc: 'Koli sevkiyat etiketi ve bilgileri', required: true },
        barcodeScan: { url: null, title: 'Barcode Scan (Barkod tarama)', desc: 'Barkod okutulurken çekilen fotoğraf', required: true },
        scanResult: { url: null, title: 'Scan result of barcode (Barkod tarama sonucu)', desc: 'Barkod okuyucu ekranında çıkan kod sonucu', required: true }
      },
      products: {
        product1: { url: null, title: 'PRODUCT 1 (ÜRÜN 1)', desc: 'Ürünün ön yüz baskı ve kulp görünümü', required: true },
        product2: { url: null, title: 'PRODUCT 2 (ÜRÜN 2)', desc: 'Ürünün arka yüz görünümü', required: true },
        product3: { url: null, title: 'PRODUCT 3 (ÜRÜN 3)', desc: 'Ürünün körük ve taban katlama detayı', required: true },
        printForm: { url: null, title: 'Product and Print Form (Ürün ve Baskı Formu)', desc: 'Onaylı baskı şablonu / Golden Sample ile yan yana karşılaştırma', required: true }
      },
      specificChecking: {
        dimensionCheck1: { url: null, title: 'Dimension check 1 (En Kontrolü)', desc: 'Cetvel ile ürün en ölçüsü', required: true },
        dimensionCheck2: { url: null, title: 'Dimension check 2 (Körük Kontrolü)', desc: 'Cetvel ile ürün körük/yan ölçüsü', required: true },
        dimensionCheck3: { url: null, title: 'Dimension Check 3 (Boy Kontrolü)', desc: 'Cetvel ile ürün boy ölçüsü', required: true },
        weightCheck: { url: null, title: 'Weight Check (Ürün Ağırlık Kontrolü)', desc: 'Tek adet ürünün hassas terazi tartımı', required: true },
        grammageCheck1: { url: null, title: 'Grammage Check 1 (Numune Kesme Aparatı)', desc: 'Numune kesim aparatı ile kesilen kağıt', required: true },
        grammageCheck2: { url: null, title: 'Grammage Check 2 (Hassas Terazi Gramajı)', desc: 'Kesilen numunenin hassas terazideki gramajı', required: true },
        deckCheck: { url: null, title: 'Deck Check (Deste Kontrolü)', desc: 'Destelenmiş torbaların dizilimi', required: true },
        pieceCheck: { url: null, title: 'Piece Check (Adet Kontrolü)', desc: 'Koli içi adet kontrolü ve masa serimi', required: true },
        cartonWeight: { url: null, title: 'Carton Weight (Karton Tartımı)', desc: 'Koli tartım anı fotoğrafı', required: true },
        cartonWeightScale: { url: null, title: 'Carton Ağırlık Kontrol (Terazi Ekranı)', desc: 'Koli tartım terazi göstergesi', required: true },
        dynamicTest1: { url: null, title: 'Dynamic Test 1 (Dinamik Test Cihazı)', desc: 'Dinamik test cihazında 6 kg yüklü asılı torba', required: true },
        dynamicTest2: { url: null, title: 'Dynamic Test 2 (Dinamik Cihaz Sayacı)', desc: 'Dinamik test sayacı ve periyot ekranı', required: true },
        staticTest1: { url: null, title: 'Static Test (Statik Test)', desc: 'Statik test askı aparatında 6 kg asılı torba', required: true },
        staticTestResult: { url: null, title: 'Test Result (Statik Test Sonucu)', desc: 'Statik test bitimi sonrası torbanın durumu', required: true },
        tearFolding1: { url: null, title: 'Tear / Folding Test 1 (Katlama Mukavemeti)', desc: 'Katlama yerlerinin mukavemet testi 1', required: true },
        tearFolding2: { url: null, title: 'Tear / Folding Test 2 (Katlama Mukavemeti)', desc: 'Katlama yerlerinin mukavemet testi 2', required: true },
        tearFolding3: { url: null, title: 'Tear / Folding Test 3 (Yırtılma Dayanımı)', desc: 'Kuvvet uygulama anı 3', required: true },
        tearFolding4: { url: null, title: 'Tear / Folding Test 4 (Açılım ve Sağlamlık)', desc: 'Açılım sonrası yırtık kontrolü 4', required: true },
        shakeTest1: { url: null, title: 'Shake Test 1 (Sallama Testi)', desc: 'Koli sallama testi başlangıç pozu', required: true },
        shakeTest2: { url: null, title: 'Shake Test 2 (Sallama Testi)', desc: 'Koli sallama testi bitiş pozu', required: true },
        dropTest1: { url: null, title: 'Drop Test (Düşme Testi)', desc: '61 cm yükseklikten bırakılma açısı', required: true },
        dropTestResult: { url: null, title: 'Drop Test Result (Düşme Testi Sonucu)', desc: 'Düşme sonrası koli köşeleri ve ürün durumu', required: true }
      },
      defectPhotos: [] // Dinamik eklenebilir kusur fotoğrafları [{ id, title, type: 'Major'|'Minor'|'Critical', url, remarks }]
    },
    finalResult: {
      status: 'PASS', // PASS, FAIL, PENDING
      globalComments: '',
      approvalRemarks: [
        { id: 1, text: '' }
      ],
      inspectorBadge: '',
      qcLeaderBadge: '',
      isCompleted: false
    },
    ...req.body
  };

  list.unshift(newInspection);
  saveInspections(list);

  res.status(201).json({ success: true, message: 'Yeni kontrol oluşturuldu', data: newInspection });
});

// 4. Update / Save step of inspection
app.put('/api/inspections/:id', (req, res) => {
  const list = getInspections();
  const index = list.findIndex(i => i.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Denetim bulunamadı' });
  }

  // Merge updates
  const updatedItem = {
    ...list[index],
    ...req.body,
    updatedAt: new Date().toISOString()
  };

  list[index] = updatedItem;
  saveInspections(list);

  res.json({ success: true, message: 'Kayıt güncellendi', data: updatedItem });
});

// 5. Image upload endpoint (stores locally or directly accepts base64)
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Fotoğraf yüklenemedi' });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ success: true, url: fileUrl, filename: req.file.filename, size: req.file.size });
});

// 6. Delete inspection
app.delete('/api/inspections/:id', (req, res) => {
  let list = getInspections();
  const index = list.findIndex(i => i.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Denetim bulunamadı' });
  }
  list.splice(index, 1);
  saveInspections(list);
  res.json({ success: true, message: 'Denetim silindi' });
});

// 7. ERP Simulation / Integration Hook
// ERP can query order info or fetch complete inspection JSON
app.get('/api/erp/export/:id', (req, res) => {
  const list = getInspections();
  const item = list.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Inspection not found' });

  // Format tailored for ERP API consumption
  const erpPayload = {
    erpSyncDate: new Date().toISOString(),
    reportNo: item.header.reportNo,
    inspectionDate: item.header.inspectionDate,
    customer: item.product.customerName,
    productCode: item.product.productCode,
    quantityInspected: item.product.inspectedPieces,
    sampleQuantity: item.product.samplePieces,
    resultStatus: item.finalResult.status,
    defectsSummary: {
      criticalFound: item.aqlChecklist.generalDefects.critical.found,
      majorFound: item.aqlChecklist.generalDefects.major.found,
      minorFound: item.aqlChecklist.generalDefects.minor.found,
      details: item.aqlChecklist.defectRows.filter(r => (Number(r.critical) || Number(r.major) || Number(r.minor)))
    },
    inspector: item.header.inspectorName,
    qcLeader: item.header.qcLeaderName,
    globalComments: item.finalResult.globalComments
  };

  res.json({ success: true, erpPayload });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`  KMK PACK - KALİTE FİNAL KONTROL SİSTEMİ AKTİF`);
    console.log(`  Port: http://localhost:${PORT}`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
