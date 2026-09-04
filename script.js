// ---------- DOM refs ----------
const artImg      = document.getElementById('art-img');
const artBg        = document.getElementById('art-bg');
const tempEl       = document.getElementById('temp');
const condEl       = document.getElementById('condition');
const placeEl      = document.getElementById('place');
const titleEl      = document.getElementById('art-title');
const artistEl     = document.getElementById('art-artist');
const yearEl       = document.getElementById('art-year');
const statusEl     = document.getElementById('status-msg');
const shuffleBtn   = document.getElementById('shuffle-btn');
const citySearch   = document.getElementById('city-search');
const cityForm     = document.getElementById('city-form');
const cityInput    = document.getElementById('city-input');

// ---------- curated painting search terms per weather bucket ----------
const PAINTING_TERMS = {
  sunny:  ['sunflowers', 'sunny landscape', 'summer field', 'harvest sunlight', 'golden hour'],
  cloudy: ['overcast sky', 'gray landscape', 'misty morning', 'cloudy countryside', 'fog'],
  rainy:  ['rainy street', 'rain landscape', 'umbrella rain', 'wet pavement', 'storm at sea'],
  snowy:  ['winter snow', 'snowy village', 'frozen river', 'snow landscape', 'winter forest'],
  stormy: ['storm at sea', 'shipwreck', 'thunderstorm', 'tempest', 'dark storm clouds'],
};

// used only if BOTH the search call and the image itself fail — pure CSS, can't break
const FALLBACK_GRADIENTS = {
  sunny:  'linear-gradient(160deg, #f6d365, #fda085)',
  cloudy: 'linear-gradient(160deg, #757f9a, #d7dde8)',
  rainy:  'linear-gradient(160deg, #4b6cb7, #182848)',
  snowy:  'linear-gradient(160deg, #e6e9f0, #a5b4c6)',
  stormy: 'linear-gradient(160deg, #2c3e50, #4b6cb7)',
};

const MET_BASE = 'https://collectionapi.metmuseum.org/public/collection/v1';
let currentCondition = 'cloudy'; // drives shuffle + fallback color

// ---------- weathercode -> bucket ----------
function codeToCondition(code) {
  if ([0].includes(code)) return 'sunny';
  if ([1, 2, 3, 45, 48].includes(code)) return 'cloudy';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rainy';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snowy';
  if ([95, 96, 99].includes(code)) return 'stormy';
  return 'cloudy';
}

// ---------- init ----------
init();

function init() {
  shuffleBtn.addEventListener('click', () => loadPainting(currentCondition));
  cityForm.addEventListener('submit', onCitySubmit);

  if (!navigator.geolocation) {
    showCitySearch('Location services unavailable — search a city instead.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => runPipeline(pos.coords.latitude, pos.coords.longitude, ''),
    () => showCitySearch('Location permission denied — search a city instead.'),
    { timeout: 8000 }
  );
}

function showCitySearch(msg) {
  citySearch.classList.remove('hidden');
  cityInput.placeholder = msg;
}

async function onCitySubmit(e) {
  e.preventDefault();
  const name = cityInput.value.trim();
  if (!name) return;
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1`);
    const data = await res.json();
    if (!data.results || !data.results.length) throw new Error('City not found');
    const { latitude, longitude, name: cityName } = data.results[0];
    citySearch.classList.add('hidden');
    runPipeline(latitude, longitude, cityName);
  } catch (err) {
    cityInput.placeholder = 'City not found — try again';
    cityInput.value = '';
  }
}

// ---------- main pipeline: weather -> painting ----------
async function runPipeline(lat, lon, placeName) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&temperature_unit=fahrenheit`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Weather fetch failed');
    const data = await res.json();

    const temp = Math.round(data.current.temperature_2m);
    const condition = codeToCondition(data.current.weathercode);

    currentCondition = condition;
    tempEl.textContent = `${temp}°F`;
    condEl.textContent = condition;
    placeEl.textContent = placeName ? `· ${placeName}` : '';
    shuffleBtn.classList.remove('hidden');

    loadPainting(condition);
  } catch (err) {
    statusEl.textContent = 'Weather data unavailable — showing a placeholder scene.';
    statusEl.classList.remove('hidden');
    tempEl.textContent = '--°';
    condEl.textContent = 'unknown';
    currentCondition = 'cloudy';
    shuffleBtn.classList.remove('hidden');
    loadPainting('cloudy');
  }
}

// ---------- painting lookup: The Met Collection API ----------
async function loadPainting(condition) {
  const terms = PAINTING_TERMS[condition] || PAINTING_TERMS.cloudy;
  const term = terms[Math.floor(Math.random() * terms.length)];

  try {
    const searchUrl = `${MET_BASE}/search?q=${encodeURIComponent(term)}&hasImages=true`;
    const res = await fetch(searchUrl);
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    const data = await res.json();

    const ids = data.objectIDs;
    if (!ids || !ids.length) throw new Error('No results for term: ' + term);

    // hasImages=true can still include a few objects with no primaryImage,
    // so try several random candidates before giving up
    const shuffled = [...ids].sort(() => Math.random() - 0.5).slice(0, 8);
    let found = false;

    for (const id of shuffled) {
      const objRes = await fetch(`${MET_BASE}/objects/${id}`);
      if (!objRes.ok) continue;
      const obj = await objRes.json();
      if (obj.primaryImage) {
        renderArt(obj.primaryImage, obj.title, obj.artistDisplayName, obj.objectDate, condition);
        found = true;
        break;
      }
    }
    if (!found) throw new Error('No candidate had a usable image');
  } catch (err) {
    console.error('loadPainting failed:', err);
    showFallbackGradient(condition);
  }
}

// direct Met image URL -> render, with graceful degrade to a gradient if it 404s
function renderArt(imageUrl, title, artist, year, condition) {
  const preload = new Image();
  preload.onload = () => {
    artImg.src = imageUrl;
    artImg.style.display = 'block';
    artBg.style.background = '#111';
    artImg.classList.add('loaded');
    titleEl.textContent = title || 'Untitled';
    artistEl.textContent = artist || 'Unknown artist';
    yearEl.textContent = year ? `(${year})` : '';
  };
  preload.onerror = () => {
    console.error('Image failed to load:', imageUrl);
    showFallbackGradient(condition);
  };
  preload.src = imageUrl;
}

// pure-CSS fallback, cannot fail
function showFallbackGradient(condition) {
  artImg.classList.remove('loaded');
  artImg.style.display = 'none';
  artBg.style.background = FALLBACK_GRADIENTS[condition] || FALLBACK_GRADIENTS.cloudy;
  titleEl.textContent = 'Artwork unavailable';
  artistEl.textContent = 'Showing a placeholder scene';
  yearEl.textContent = '';
}
