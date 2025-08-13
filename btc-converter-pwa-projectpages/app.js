const API_URL = 'https://api.coinbase.com/v2/exchange-rates?currency=BTC';
const els = {
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
  retry: document.getElementById('retry')
};

let rates = null;
let unit = 'BTC';
let timer = null;
let testMode = false;

function fmtFiat(n, code){
  try{
    return new Intl.NumberFormat(undefined,{style:'currency',currency:code,maximumFractionDigits:2}).format(n);
  }catch(e){
    return new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(n) + ' ' + code;
  }
}
function fmtBTC(n){
  return new Intl.NumberFormat(undefined,{minimumFractionDigits:0,maximumFractionDigits:8}).format(n);
}
function fmtSats(n){
  return new Intl.NumberFormat(undefined,{maximumFractionDigits:0}).format(n);
}

async function fetchRates(){
  try{
    els.err.hidden = true;
    if (testMode) {
      const preferred = ["USD","EUR","AED","GBP","JPY","AUD","CAD","CHF","CNY","HKD","INR","BRL","MXN","NZD","SGD","ZAR","SEK","NOK","DKK","PLN","TRY","SAR","TWD","KRW","ILS"];
      const mock = Object.fromEntries(preferred.map(c => [c, c === 'JPY' ? 10200000 : 68000]));
      rates = mock;
      els.updated.textContent = 'Last updated: ' + new Date().toLocaleString() + ' (Test Mode)';
      populateFiatsOnce(mock);
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
  els.fiat.value = 'USD';
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

// Events
els.amount.addEventListener('input', updateUI);
els.fiat.addEventListener('change', updateUI);
els.btnBtc.addEventListener('click', ()=>{ unit='BTC'; updateUI(); });
els.btnSats.addEventListener('click', ()=>{ unit='sats'; updateUI(); });
els.refresh.addEventListener('click', fetchRates);
els.retry.addEventListener('click', fetchRates);
els.dark.addEventListener('change', updateUI);
els.test.addEventListener('change', ()=>{ testMode = els.test.checked; fetchRates(); });

els.autoref.addEventListener('change', ()=>{
  if(els.autoref.checked){
    timer = setInterval(fetchRates, 30000);
  } else if(timer){
    clearInterval(timer); timer = null;
  }
});

fetchRates();
timer = setInterval(fetchRates, 30000);
