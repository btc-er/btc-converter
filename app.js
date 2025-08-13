// --- BTC Converter PWA (with Camera OCR) ---
// - Live BTC price (Coinbase) + Test Mode
// - BTC / sats conversion
// - Dark mode
// - Camera scan w/ Tesseract.js (lazy-loaded)
// - Robust auto-refresh + visibility handling

const API_URL = 'https://api.coinbase.com/v2/exchange-rates?currency=BTC';

const els = {
  // OCR / camera
  scan: document.getElementById('scan'),
  scanModal: document.getElementById('scanModal'),
  scanVideo: document.getElementById('scanVideo'),
  scanClose: document.getElementById('scanClose'),
  scanCapture: document.getElementById('scanCapture'),

  // Core UI
  amount: document.getElementById('amount'),
  fiat: document.getElementById('fiat'),
  btnBtc: document.getElementById('btn-btc'),
  btnSats: document.getElementById('btn-sats'),
  oneBtc: document.getElementById('oneBtc'),
  updated: document.getElementById('updated'),
  autoref: document.getElementById('autoref'),
  dark: document.getElementById('dark'),
  test: document.getElementById('test'),
  refresh: document.getElementById('refresh'),
  fiatOut: document.getElementById('fiatOut'),
  cryptoOut: document.getElementById('cryptoOut'),
  usingRate: document.getElementById('usingRate'),
  err: document.getElementById('err'),
  retry: document.getElementById('retry'),
};

let rates = null;
let unit = 'BTC';
let timer = null;
let testMode = false;

// ---------- Formatting ----------
function fmtFiat(n, code){
  try { return new Intl.NumberFormat(undefined,{style:'currency',currency:code,maximumFractionDigits:2}).format(n); }
  catch { return new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(n) + ' ' + code; }
}
function fmtBTC(n){ return new Intl.NumberFormat(undefined,{minimumFractionDigits:0,maximumFractionDigits:8}).format(n); }
function fmtSats(n){ return new Intl.NumberFormat(undefined,{maximumFractionDigits:0}).format(n); }

// ---------- Rates ----------
async function fetchRates(){
  try{
    els.err.hidden = true;

    if (testMode) {
      const preferred = ["USD","EUR","AED","GBP","JPY","AUD","CAD","CHF","CNY","HKD","INR","BRL","MXN","NZD","SGD","ZAR","SEK","NOK","DKK","PLN","TRY","SAR","TWD","KRW","ILS"];
      const mock = Object.fromEntries(preferred.map(c => [c, c === 'JPY' ? 10200000 : 68000]));
      rates = mock;
      populateFiatsOnce(mock);
      els.updated.textContent = 'Last updated: ' + new Date().toLocaleString() + ' (Test Mode)';
      updateUI();
      return;
    }

    const res = await fetch(API_URL,{cache:'no-store'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const json = await res.json();
    const map = json?.data?.rates || null;
    if(!map) throw new Error('Unexpected API response');

    rates = map;
    populateFiatsOnce(map);
    els.updated.textContent = 'Last updated: ' + new Date().toLocaleString();
    updateUI();
  }catch(e){
    els.err.hidden = false;
    console.error('Fetch rates failed:', e);
  }
}

function populateFiatsOnce(map){
  if(els.fiat.options.length) return;
  const codes = Object.keys(map).filter(k=>/^[A-Z]{3}$/.test(k)).sort();
  const preferred = ['USD','EUR','AED','GBP','JPY','AUD','CAD','CHF','CNY','HKD','INR','BRL','MXN','NZD','SGD','ZAR','SEK','NOK','DKK','PLN','TRY','SAR','TWD','KRW','ILS'];
  const ordered = [...preferred.filter(c=>codes.includes(c)), ...codes.filter(c=>!preferred.includes(c))];

  for(const c of ordered){
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c; els.fiat.appendChild(opt);
  }
  if (!els.fiat.value) els.fiat.value = 'USD';
}

function getPricePerBTC(code){
  if(!rates) return null;
  const raw = rates[code];
  const n = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

function updateUI(){
  const amt = Number(els.amount.value);
  const code = els.fiat.value;
  const price = getPricePerBTC(code);

  els.oneBtc.textContent = price ? fmtFiat(price, code) : '—';
  els.fiatOut.textContent = fmtFiat(isFinite(amt)?amt:0, code);

  if(price && isFinite(amt)){
    const btc = amt / price;
    const sats = btc * 1e8;
    const display = unit === 'BTC' ? `${fmtBTC(btc)} BTC` : `${fmtSats(sats)} sats`;
    els.cryptoOut.textContent = display;
    els.usingRate.textContent = `Using rate: 1 BTC ≈ ${fmtFiat(price, code)} (${fmtFiat(1, code)} ≈ ${fmtBTC(1/price)} BTC)`;
  } else {
    els.cryptoOut.textContent = '—';
    els.usingRate.textContent = '';
  }

  document.body.classList.toggle('dark', els.dark.checked);
  els.btnBtc.classList.toggle('on', unit==='BTC');
  els.btnSats.classList.toggle('on', unit==='sats');
}

// ---------- Auto-refresh management ----------
function setAutoRefresh(on) {
  if (timer) { clearInterval(timer); timer = null; }
  if (on) timer = setInterval(fetchRates, 30000);
}

// Pause refresh + camera if tab is hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    setAutoRefresh(false);
    if (els.scanModal.classList.contains('open')) closeScanner();
  } else {
    if (els.autoref.checked) setAutoRefresh(true);
  }
});

// ---------- Camera / OCR ----------
let scanStream = null;
let tesseractReady = false;

async function ensureTesseract() {
  if (window.Tesseract) { tesseractReady = true; return; }
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.min.js';
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
  tesseractReady = true;
}

function setBusyScanning(on) {
  els.scanCapture.disabled = on;
  els.scanCapture.textContent = on ? 'Scanning…' : 'Capture';
}

async function openScanner() {
  try {
    els.scanModal.classList.add('open');
    // Start loading OCR in parallel while the permission sheet is up
    ensureTesseract().catch(()=>{});
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    els.scanVideo.srcObject = scanStream;
    await els.scanVideo.play();
  } catch (e) {
    const name = (e && e.name) ? e.name : '';
    if (name === 'NotAllowedError') {
      alert('Camera permission denied. iOS: Settings → Safari → Camera → Allow.');
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      alert('No usable camera found.');
    } else {
      alert('Camera access failed: ' + (e.message || name || e));
    }
    console.error(e);
    closeScanner();
  }
}

function closeScanner() {
  if (scanStream) {
    scanStream.getTracks().forEach(t => t.stop());
    scanStream = null;
  }
  els.scanVideo.pause();
  els.scanVideo.srcObject = null;
  els.scanModal.classList.remove('open');
}

// Grab a frame into a <canvas> (downscale for speed)
function grabFrameCanvas(video) {
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 800 / Math.max(w, h)); // cap longest side ~800px
  canvas.width = Math.max(1, Math.floor(w * scale));
  canvas.height = Math.max(1, Math.floor(h * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// Prefer numbers near currency symbols / with cents; normalize separators
function extractPrice(text) {
  const cleaned = (text || '').replace(/[^\d.,$€£¥₱₩₺₹R\s-]/g, ' ');
  const tokens = cleaned.split(/\s+/).filter(Boolean);

  const candidates = tokens.map((tok, i, arr) => {
    const lastComma = tok.lastIndexOf(',');
    const lastDot = tok.lastIndexOf('.');
    let norm = tok;
    if (lastComma > lastDot) norm = tok.replace(/\./g, '').replace(',', '.'); // 1.234,56 -> 1234.56
    else norm = tok.replace(/,/g, '');                                       // 1,234.56 -> 1234.56

    const n = parseFloat(norm);
    if (!Number.isFinite(n) || n <= 0) return null;

    const neigh = [arr[i-1]||'', arr[i+1]||''].join(' ');
    const symbolNearby = /[$€£¥₱₩₺₹R]/.test(neigh);
    const hasCents = /\d\.\d{2}$/.test(norm);
    const score = (symbolNearby?2:0) + (hasCents?1:0) + Math.min(String(Math.floor(n)).length, 2)*0.1;
    return { n, score };
  }).filter(Boolean);

  if (!candidates.length) return null;
  candidates.sort((a,b)=>b.score-a.score);
  return candidates[0].n;
}

// ---------- Events ----------
els.amount.addEventListener('input', updateUI);
els.fiat.addEventListener('change', updateUI);
els.btnBtc.addEventListener('click', ()=>{ unit='BTC'; updateUI(); });
els.btnSats.addEventListener('click', ()=>{ unit='sats'; updateUI(); });
els.refresh.addEventListener('click', fetchRates);
els.retry.addEventListener('click', fetchRates);
els.dark.addEventListener('change', updateUI);
els.test.addEventListener('change', ()=>{ testMode = els.test.checked; fetchRates(); });

// Open / close scanner
els.scan.addEventListener('click', openScanner);
els.scanClose.addEventListener('click', closeScanner);

// Capture & OCR
els.scanCapture.addEventListener('click', async () => {
  try {
    if (!tesseractReady) { await ensureTesseract(); }
    const canvas = grabFrameCanvas(els.scanVideo);
    setBusyScanning(true);
    const { data } = await Tesseract.recognize(canvas, 'eng', {
      tessedit_char_whitelist: '0123456789.,$€£¥₱₩₺₹R'
    });
    const price = extractPrice(data.text || '');
    if (price) {
      els.amount.value = String(price);
      updateUI();
      closeScanner();
    } else {
      alert('Couldn’t find a price. Try closer, steady, and good lighting.');
    }
  } catch (e) {
    alert('OCR failed: ' + (e.message || e));
    console.error(e);
  } finally {
    setBusyScanning(false);
  }
});

els.autoref.addEventListener('change', ()=> setAutoRefresh(els.autoref.checked));

// ---------- Initial boot ----------
fetchRates();
setAutoRefresh(true);
