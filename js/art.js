// ── Tab switching ──
const tabBtns  = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    tabBtns.forEach(b => b.classList.remove('is-active'));
    tabPanels.forEach(p => p.classList.remove('is-active'));
    btn.classList.add('is-active');
    document.getElementById('tab-' + target).classList.add('is-active');
  });
});

// ── 3D model selection ──
const modelData = {
  eagle:   { renders: ['../img/eagle1.png', '../img/eagle.gif',  '../img/eagle.png'],  count: 3 },
  akbk:    { renders: ['../img/akbk.png',  '../img/akbk1.jpg',  '../img/akbk.gif'],   count: 3 },
  jasmine: { renders: ['../img/jasmine.png','../img/jasmine.jpg', ''],                 count: 2 },
  logo:    { renders: ['../img/logo1.png',  '../img/logo.gif',   '../img/1W20CF07_Logo.jpg'], count: 3 },
  dragon:  { renders: ['../img/dragon.JPG', '', ''],                                   count: 1 },
};

const modelBtns   = document.querySelectorAll('.model-btn');
const renderImgs  = [
  document.getElementById('render0'),
  document.getElementById('render1'),
  document.getElementById('render2'),
];
const modelIds = ['eagle','akbk','jasmine','logo','dragon'];

function showModel(name) {
  modelIds.forEach(id => {
    const el = document.getElementById('m-' + id);
    if (el) el.setAttribute('visible', id === name ? 'true' : 'false');
  });

  const data = modelData[name];
  renderImgs.forEach((img, i) => {
    if (i < data.count && data.renders[i]) {
      img.src = data.renders[i];
      img.style.display = 'block';
    } else {
      img.style.display = 'none';
    }
  });
}

modelBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    modelBtns.forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    showModel(btn.dataset.model);
  });
});

// ── Lightbox ──
const lightbox     = document.getElementById('lightbox');
const lightboxImg  = document.getElementById('lightboxImg');
const lightboxClose = document.getElementById('lightboxClose');

function openLightbox(src) {
  lightboxImg.src = src;
  lightbox.classList.add('is-open');
}

document.querySelectorAll('.illust-card img, .model-renders img').forEach(img => {
  img.addEventListener('click', () => openLightbox(img.src));
});

lightboxClose.addEventListener('click', () => lightbox.classList.remove('is-open'));
lightbox.addEventListener('click', e => {
  if (e.target === lightbox) lightbox.classList.remove('is-open');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') lightbox.classList.remove('is-open');
});
