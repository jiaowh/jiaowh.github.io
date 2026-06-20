let map;
const KML_SOURCES = [
  'https://docs.google.com/uc?id=19XXprxwvTU18_B44_I0KfX3zWKftX-KN&export=kml',
  'https://docs.google.com/uc?id=1kBTk_exT3PATfjYQApkjroW3emy6e-V5&export=kml',
  'https://docs.google.com/uc?id=1OZaDbX1E-al9ATKb2iHOA1eN7Ta2YscX&export=kml',
  'https://docs.google.com/uc?id=1mRyYrT2ilPULelYfLDgrM90EoiRvcqNp&export=kml',
  'https://docs.google.com/uc?id=1r_nHK6dBNeetG0Jj8ST7JnnwhWl5jWMG&export=kml',
  'https://docs.google.com/uc?id=1y65Vhtd-Zc3Dqt6R6flINGqsuR1Ywr3c&export=kml',
  'https://docs.google.com/uc?id=1KBRAiJRDq4sXQ232hDGUUcnhsUWC3qiO&export=kml',
  'https://docs.google.com/uc?id=1pm0K80R1mr5nXeYPtp_qWXXegkQOXq93&export=kml',
  'https://docs.google.com/uc?id=1woIeOx0CYIIWXy1VjA3NvUV9N_D6EEqT&export=kml',
];

const ROUTES = [
  // index 0 = placeholder so route-btn data-route 1-7 match
  null,
  [ {lat:35.72614,lng:139.69428},{lat:35.99118,lng:139.08787},{lat:36.07974,lng:138.78367},{lat:36.20407,lng:137.94851},{lat:36.56668,lng:137.66526},{lat:36.20407,lng:137.94851},{lat:36.26332,lng:136.89515},{lat:35.97927,lng:136.51807},{lat:35.72614,lng:139.69428} ],
  [ {lat:35.72614,lng:139.69428},{lat:36.66929,lng:138.51878},{lat:37.13096,lng:138.78968},{lat:37.47172,lng:139.5294},{lat:37.48914,lng:139.92427},{lat:35.72614,lng:139.69428} ],
  [ {lat:35.72614,lng:139.69428},{lat:36.62289,lng:138.59686},{lat:36.84956,lng:136.75313},{lat:36.57915,lng:136.64974},{lat:35.14054,lng:136.90954},{lat:35.23857,lng:138.61891},{lat:35.72614,lng:139.69428} ],
  [ {lat:35.72614,lng:139.69428},{lat:34.70263,lng:137.7095},{lat:35.14054,lng:136.90954},{lat:34.66568,lng:135.43227},{lat:34.98709,lng:135.74224},{lat:35.72614,lng:139.69428} ],
  [ {lat:35.72614,lng:139.69428},{lat:35.49992,lng:138.67255},{lat:35.25613,lng:138.55035},{lat:35.16205,lng:138.61956},{lat:35.72614,lng:139.69428} ],
  null,
  null,
];

let activePolyline = null;
let kmlLayers = [];

function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 35.68, lng: 139.77 },
    zoom: 7,
    mapTypeId: 'terrain',
    styles: [
      { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a9a' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#0C0C0E' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2d2d44' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1b2a' }] },
    ],
  });

  KML_SOURCES.forEach(src => {
    const layer = new google.maps.KmlLayer({
      url: src,
      suppressInfoWindows: true,
      preserveViewport: true,
      map,
    });

    layer.addListener('click', evt => {
      const name = evt.featureData.name;
      const desc = evt.featureData.description;
      showPhotos(name, desc);
    });

    kmlLayers.push(layer);
  });

  // Route polyline buttons
  document.querySelectorAll('.route-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.route-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');

      if (activePolyline) { activePolyline.setMap(null); activePolyline = null; }

      const idx = parseInt(btn.dataset.route, 10);
      if (idx === 0 || !ROUTES[idx]) return;

      activePolyline = new google.maps.Polyline({
        path: ROUTES[idx],
        strokeColor: '#F87171',
        strokeOpacity: 0.85,
        strokeWeight: 2.5,
        map,
      });
    });
  });
}

function showPhotos(name, description) {
  const empty   = document.getElementById('photoEmpty');
  const place   = document.getElementById('photoPlace');
  const loading = document.getElementById('photoLoading');
  const grid    = document.getElementById('photoGrid');
  const nameEl  = document.getElementById('placeName');

  empty.style.display   = 'none';
  place.style.display   = 'none';
  loading.style.display = 'flex';
  grid.innerHTML        = '';
  nameEl.textContent    = name;

  const parser  = new DOMParser();
  const doc     = parser.parseFromString(description, 'text/xml');
  const imgEls  = doc.querySelectorAll('img');
  let loaded    = 0;
  const total   = imgEls.length;

  if (total === 0) {
    loading.style.display = 'none';
    place.style.display   = 'block';
    return;
  }

  imgEls.forEach(imgEl => {
    const img = document.createElement('img');
    img.src = imgEl.getAttribute('src');
    img.alt = name;
    img.addEventListener('load',  () => { if (++loaded === total) { loading.style.display = 'none'; place.style.display = 'block'; } });
    img.addEventListener('error', () => { if (++loaded === total) { loading.style.display = 'none'; place.style.display = 'block'; } });
    img.addEventListener('click', () => openLightbox(img.src));
    grid.appendChild(img);
  });
}

// ── Lightbox ──
const lightbox     = document.getElementById('lightbox');
const lightboxImg  = document.getElementById('lightboxImg');
const closeBtn     = document.getElementById('lightboxClose');

function openLightbox(src) {
  lightboxImg.src = src;
  lightbox.classList.add('is-open');
}

closeBtn.addEventListener('click', () => lightbox.classList.remove('is-open'));
lightbox.addEventListener('click', e => { if (e.target === lightbox) lightbox.classList.remove('is-open'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') lightbox.classList.remove('is-open'); });
