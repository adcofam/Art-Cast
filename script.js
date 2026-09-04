// ---------- DOM refs ----------
const artImg      = document.getElementById('art-img');
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

// hardcoded last-resort fallback (public domain, known-good AIC image_id)
const FALLBACK_ART = {
  title: 'The Great Wave off Kanagawa',
  artist: 'Katsushika Hokusai',
  year: 'c. 1830–33',
  image_id: '76a2694a-6ba0-c00b-3a0c-72fefa76f8e5', // AIC record for this print
};

let currentCondition = 'cloudy'; // used by shuffle button

// ---------- weathercode -> bucket ----------
// WMO codes per Open-Meteo docs: 0 clear; 1-3 cloudy; 45/48 fog;
// 51-67 drizzle/rain; 71-75 snow; 77 snow grains; 80-82 rain showers;
// 85-86 snow showers; 95-99 thunderstorm.
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

// ---------- painting lookup ----------
async function loadPainting(condition) {
  const terms = PAINTING_TERMS[condition] || PAINTING_TERMS.cloudy;
  const term = terms[Math.floor(Math.random() * terms.length)];

  try {
    const fields = 'id,title,artist_display,date_display,image_id';
    const url = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(term)}&query[term][is_public_domain]=true&fields=${fields}&limit=40`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Art fetch failed');
    const data = await res.json();

    const candidates = (data.data || []).filter(a => a.image_id);
    if (!candidates.length) throw new Error('No image results');

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    renderArt(pick.image_id, pick.title, pick.artist_display, pick.date_display);
  } catch (err) {
    renderArt(FALLBACK_ART.image_id, FALLBACK_ART.title, FALLBACK_ART.artist, FALLBACK_ART.year);
  }
}

function renderArt(imageId, title, artist, year) {
  const src = `https://www.artic.edu/iiif/2/${imageId}/full/843,/0/default.jpg`;
  artImg.classList.remove('loaded');

  const preload = new Image();
  preload.onload = () => {
    artImg.src = src;
    artImg.classList.add('loaded');
  };
  preload.onerror = () => {
    // image itself failed to load — fall back to hardcoded piece if not already showing it
    if (imageId !== FALLBACK_ART.image_id) {
      renderArt(FALLBACK_ART.image_id, FALLBACK_ART.title, FALLBACK_ART.artist, FALLBACK_ART.year);
    }
  };
  preload.src = src;

  titleEl.textContent = title || 'Untitled';
  artistEl.textContent = (artist || 'Unknown artist').split('\n')[0];
  yearEl.textContent = year ? `(${year})` : '';
}
