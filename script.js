/* Mapbox token */
const mapboxAccessToken = 'pk.eyJ1IjoiYWxlamFuZHJvcXVpbnRvIiwiYSI6ImNseDZxbGFpcjE1ZHMyanNjZWg1eDIzejkifQ.VYiLvOBYgX5WwchhqO0I8w';

/* Cities & data files */
const cityCoordinates = {
  gandia:[38.9673,-0.1819],
  crevillente:[38.2496,-0.8127],
  valencia:[39.4699,-0.3763],
  benidorm:[38.5411,-0.1225],
  elche:[38.2669,-0.6984],
  alcoy:[38.7054,-0.4743],
  coruna:[43.3623,-8.4115],
  antigua:[28.4200,-14.0167],
  grancanaria:[28.1235,-15.4363],
};
const cityDataFiles = {
  gandia:'building-gandia.geojson',
  crevillente:'building-crevillente.geojson',
  valencia:'building-valencia.geojson',
  benidorm:'building-benidorm.geojson',
  elche:'building-elche.geojson',
  alcoy:'building-alcoy.geojson',
  coruna:'building-coruna.geojson',
  antigua:'building-antigua.geojson',
  grancanaria:'building-grancanaria.geojson',
};

/* DOM */
const loadingEl = document.getElementById('loading');
const citySelect = document.getElementById('citySelect');
const yearMinEl = document.getElementById('yearMin');
const yearMaxEl = document.getElementById('yearMax');
const yearBadge = document.getElementById('yearBadge');
const kpiTotal = document.getElementById('kpiTotal');
const kpiAvg = document.getElementById('kpiAvg');
const kpiMedian = document.getElementById('kpiMedian');
const resetBtn = document.getElementById('resetBtn');
const emptyEl = document.getElementById('emptyState');

/* Utils */
function extractYear(beginning){
  const yearMatch = beginning?.match?.(/\b(19|20)\d{2}\b/);
  return yearMatch ? parseInt(yearMatch[0]) : null;
}
function getColor(year){
  if(year >= 2000) return '#A3D69A';
  else if(year >= 1980) return '#A7BC8A';
  else if(year >= 1960) return '#ABA27B';
  else if(year >= 1940) return '#AE876B';
  else return '#B26D5B';
}

/* State */
const params = new URLSearchParams(location.search);
let currentCity = params.get('city') || 'gandia';
let yearMin = 1900, yearMax = 2024;
const cityCache = {};
let fitOnNextRender = true;

/* Map */
const map = L.map('map', { zoomControl: true }).setView(cityCoordinates[currentCity], 14);
L.tileLayer(
  `https://api.mapbox.com/styles/v1/mapbox/dark-v10/tiles/{z}/{x}/{y}?access_token=${mapboxAccessToken}`,
  { maxZoom:19, tileSize:512, zoomOffset:-1, attribution:'© Mapbox' }
).addTo(map);
let buildingLayer;

function featureStyle(feature){
  const y = extractYear(feature.properties.beginning);
  return { color:getColor(y), weight:1, fillOpacity:.45 };
}
function featureHover(e){ e.target.setStyle({ weight:2, fillOpacity:.7 }); e.target.bringToFront(); }
function featureOut(e){ e.target.setStyle({ weight:1, fillOpacity:.45 }); }

/* Era bucketing — clean, limited labels */
function eraKey(y){
  if(y<=1939) return '≤1939';
  if(y>=2020) return '≥2020';
  const decade = Math.floor(y/10)*10; // 1940 -> "40s"
  const short = String(decade).slice(2,4);
  return `${short}s`;
}
const ERA_ORDER = ['≤1939','40s','50s','60s','70s','80s','90s','00s','10s','20s','≥2020'];

function computeEraCounts(features){
  const counts = {};
  let total=0, sum=0;
  const yearFreq = {};

  for(const f of features){
    const y = extractYear(f.properties?.beginning);
    if(y==null || y<yearMin || y>yearMax) continue;
    const key = eraKey(y);
    counts[key] = (counts[key]||0)+1;
    total++; sum += y;
    yearFreq[y] = (yearFreq[y]||0)+1;
  }
  const labels = ERA_ORDER.filter(k => counts[k]); // keep only present eras
  const values = labels.map(k=>counts[k]);
  const avg = total ? Math.round(sum/total) : null;
  const median = total ? weightedMedian(yearFreq) : null;
  return { labels, values, total, avg, median };
}
function weightedMedian(freqMap){
  const entries = Object.entries(freqMap).map(([y,c])=>[+y,+c]).sort((a,b)=>a[0]-b[0]);
  const n = entries.reduce((s, [,c])=>s+c, 0);
  let run=0;
  for(const [y,c] of entries){ run += c; if(run >= n/2) return y; }
  return null;
}

/* Chart (vertical, smooth, not crowded) */
const ctx = document.getElementById('buildingsChart').getContext('2d');
function makeGradient(ctx){
  const g = ctx.createLinearGradient(0,0,0,240);
  g.addColorStop(0,'rgba(255,255,255,0.90)');
  g.addColorStop(1,'rgba(255,255,255,0.55)');
  return g;
}
const chart = new Chart(ctx, {
  type:'bar',
  data:{ labels:[], datasets:[{ data:[], backgroundColor: makeGradient(ctx), borderWidth:0, borderRadius:10, barThickness:20, maxBarThickness:28 }]},
  options:{
    animation:{ duration:600, easing:'easeOutQuart' },
    plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:(c)=>` ${c.formattedValue} buildings` }}},
    scales:{
      x:{ grid:{ color:'rgba(255,255,255,.04)' }, ticks:{ color:'#e8edf2', font:{ family:'Inter', weight:'700' }}},
      y:{ beginAtZero:true, grid:{ display:false }, ticks:{ color:'#e8edf2', font:{ family:'Inter', weight:'700' }}, title:{ display:true, text:'Count', color:'#e8edf2' } }
    }
  }
});

/* Data load/render */
async function loadCityData(city){
  if(cityCache[city]) return cityCache[city];
  loading(true);
  try{
    const res = await fetch(cityDataFiles[city]);
    const gj = await res.json();
    cityCache[city] = gj;
    return gj;
  } finally { loading(false); }
}
function loading(v){ loadingEl?.classList.toggle('hidden', !v); }

function renderLayer(geojson){
  if(buildingLayer) map.removeLayer(buildingLayer);
  const filtered = {
    type:'FeatureCollection',
    features: geojson.features.filter(f=>{
      const y = extractYear(f.properties?.beginning);
      return y!==null && y>=yearMin && y<=yearMax;
    })
  };
  buildingLayer = L.geoJSON(filtered, {
    style: featureStyle,
    onEachFeature: (feature, layer)=>{
      const y = extractYear(feature.properties.beginning);
      layer.bindPopup(`<b>Year</b>: ${y ?? 'Unknown'}`);
      layer.on({ mouseover:featureHover, mouseout:featureOut });
    }
  }).addTo(map);

  if(fitOnNextRender && filtered.features.length){
    try { map.fitBounds(buildingLayer.getBounds(), { padding:[20,20] }); } catch(e){}
    fitOnNextRender = false; // don’t jump on every filter
  }
  emptyEl?.classList.toggle('hidden', filtered.features.length>0);
  return filtered.features;
}

function updateKpis({ total, avg, median }){
  kpiTotal.textContent = total ? total.toLocaleString() : '0';
  kpiAvg.textContent = avg ?? '—';
  kpiMedian.textContent = median ?? '—';
}
function updateYearBadge(){ yearBadge.textContent = `${yearMin} – ${yearMax}`; }
function paintRange(){
  const min = +yearMinEl.min, max = +yearMinEl.max;
  const p1 = ((yearMin - min)/(max-min))*100;
  const p2 = ((yearMax - min)/(max-min))*100;
  const track = `linear-gradient(90deg,
    rgba(255,255,255,0.08) 0%,
    rgba(255,255,255,0.08) ${p1}%,
    rgba(163,214,154,0.45) ${p1}%,
    rgba(163,214,154,0.45) ${p2}%,
    rgba(255,255,255,0.08) ${p2}%,
    rgba(255,255,255,0.08) 100%)`;
  yearMinEl.style.background = track;
  yearMaxEl.style.background = track;
}

let buildingData;
let debounceTimer;
function triggerUpdate(){ clearTimeout(debounceTimer); debounceTimer = setTimeout(updateAll, 110); }

async function updateAll(){
  const gj = buildingData || await loadCityData(currentCity);
  buildingData = gj;
  const filteredFeatures = renderLayer(gj);
  const { labels, values, total, avg, median } = computeEraCounts(filteredFeatures);
  chart.data.labels = labels;
  chart.data.datasets[0].data = values;
  chart.update();
  updateKpis({ total, avg, median });
}

/* City select */
function populateCitySelect(){
  if(!citySelect) return;
  citySelect.innerHTML = '';
  for(const key of Object.keys(cityCoordinates)){
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = key === 'coruna' ? 'A Coruña'
      : key === 'grancanaria' ? 'Las Palmas de Gran Canaria'
      : key.charAt(0).toUpperCase()+key.slice(1);
    if(key===currentCity) opt.selected = true;
    citySelect.appendChild(opt);
  }
}
citySelect?.addEventListener('change', async () => {
  currentCity = citySelect.value;
  fitOnNextRender = true;
  map.setView(cityCoordinates[currentCity], 14);
  buildingData = await loadCityData(currentCity);
  triggerUpdate();
  const u = new URL(location.href);
  u.searchParams.set('city', currentCity);
  history.replaceState(null,'',u.toString());
});

/* Year range */
yearMinEl?.addEventListener('input', ()=>{
  const v = +yearMinEl.value;
  yearMin = Math.min(v, yearMax);
  updateYearBadge(); paintRange(); triggerUpdate();
});
yearMaxEl?.addEventListener('input', ()=>{
  const v = +yearMaxEl.value;
  yearMax = Math.max(v, yearMin);
  updateYearBadge(); paintRange(); triggerUpdate();
});

/* Reset */
resetBtn?.addEventListener('click', ()=>{
  yearMin = 1900; yearMax = 2024;
  yearMinEl.value = 1900; yearMaxEl.value = 2024;
  updateYearBadge(); paintRange(); triggerUpdate();
});

/* Init */
(async function init(){
  populateCitySelect();
  map.setView(cityCoordinates[currentCity], 14);
  updateYearBadge(); paintRange();
  await updateAll();
})();
