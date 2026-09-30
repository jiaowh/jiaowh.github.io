/* ---------- the artists ---------- */
/* One list, no divisions — everyone here is admired.
   `why` is what makes each one distinct; `w` are notable works. */
const ARTISTS = [
 {n:'Sōsuke Morimoto', jp:'森本草介', r:'Japan · 1937–2015',
  b:'The Hoki Museum’s centerpiece painter; sepia-toned nudes, portraits, and still air.',
  why:'The zero point of this list. No narrative, no gesture, no shadow strong enough to call drama — a woman, a cloth, and light that has been in the room for hours. Everything else here is measured against this stillness.',
  w:['光の方へ','横になるポーズ']},
 {n:'Nobuyuki Shimamura', jp:'島村信之', r:'Japan · 白日会',
  b:'Serene figure paintings and still lifes in the Hoki Museum collection.',
  why:'Morimoto’s hush pushed further toward porcelain — the paint stops announcing itself and the figure simply is.'},
 {n:'Hiroshi Ikushima', jp:'生島浩', r:'Japan · b. 1956',
  b:'Composed, quietly melancholy portraits of women.',
  why:'The hush with an interior weather system. His women are composed but not at peace — the first crack of Kamoi’s melancholy inside Morimoto’s quiet.'},
 {n:'Kei Mieno', jp:'三重野慶', r:'Japan · b. 1990',
  b:'Hyperreal figures in water and light — his portraits went viral for looking like photographs.',
  why:'The figure seen *through* something, which is the recurring obsession of this whole list. The subject is the film of water and light between you and her, not the skin.',
  w:['信じてる']},
 {n:'Yasutomo Oka', jp:'岡靖知', r:'Japan · b. 1974',
  b:'Softly lit portraits of women, painted with near-photographic calm.',
  why:'Photographic calm that never tips into coldness — the light does all of the emotional work.'},
 {n:'Serge Marshennikov', r:'Russia · b. 1971',
  b:'Delicate paintings of his sleeping muse — the closest Russian kin to Morimoto’s quiet.',
  why:'The Russian answer to Morimoto: a sleeping woman, white linen, and a painter with enough restraint not to show you everything he can do.'},
 {n:'Rei Kamoi', jp:'鴨居玲', r:'Japan · 二紀会 · 1928–1985',
  b:'Dark clowns, drunkards, and merciless self-portraits — anguish painted with tenderness.',
  why:'The opposite pole. Drunks and self-portraits lit like a stage: despair toward life and death, *performed* rather than diagnosed. The theatricality is the point — without it this becomes a pathology report.',
  w:['静止した刻','1982年 私','おっかさん']},
 {n:'Ryōhei Koiso', jp:'小磯良平', r:'Japan · 新制作 · 1903–1988',
  b:'Elegant, silver-grey figure groups; Kobe’s master of the composed portrait.',
  why:'The bridge between the hush and the brush — total compositional control that stays elegant instead of going cold.',
  w:['斉唱','T嬢の像']},
 {n:'Nikolai Fechin', r:'Russia · Taos · 1881–1955',
  b:'Slashing, bravura brushwork; from Kazan to New Mexico, the painter’s painter.',
  why:'The source of the bravura line. A portrait built from slashes that resolve into a face at three paces — every alla prima painter below owes him something.',
  w:['Portrait of Varya Adoratskaya']},
 {n:'Nikolai Blokhin', r:'Russia · b. 1968',
  b:'Bravura portraits in Fechin’s lineage, from the Repin Academy.',
  why:'Fechin’s attack alive in the present tense — and the rare case where you could actually learn the handling from the man doing it.'},
 {n:'Nick Alm', r:'Sweden · b. 1985',
  b:'Alla prima multi-figure compositions with Sorolla-like fluency.',
  why:'Bravura paint that is also *about* something — bar scenes and parties with a faint sourness running underneath the fluency.'},
 {n:'Steven Assael', r:'USA · b. 1957',
  b:'Painterly figures caught in warm, theatrical light.',
  why:'The staging Kamoi uses, without the despair. Figures who look caught rather than posed, lit as if the scene were lit for them.'},
 {n:'Casey Baugh', r:'USA · b. 1984',
  b:'Charcoal and oil figures with cinematic atmosphere.',
  why:'Atmosphere as the actual subject — the figure emerges out of a haze that is itself the painting.'},
 {n:'Richard Schmid', r:'USA · 1934–2021',
  b:'The modern master of alla prima; his book of that name trained a generation.',
  why:'Less about the pictures than about how the marks get made. The one painter here whose value is mostly method.'},
 {n:'Jeremy Lipking', r:'USA · b. 1975',
  b:'Figures in western landscape; the closest thing alive to Sargent’s plein-air ease.',
  why:'Sargent’s outdoor ease carried into the present — the figure dissolved into daylight rather than staged against dark.'},
 {n:'Roberto Ferri', r:'Italy · b. 1978',
  b:'Baroque chiaroscuro bodies — Caravaggio’s heir in the 21st century.',
  why:'Caravaggio’s staging played entirely straight: bodies lit hard against black, emotion pitched to opera. Kamoi’s theatricality in Baroque dress.'},
 {n:'Guillermo Lorca', r:'Chile · b. 1984',
  b:'Lush, enormous canvases where baroque opulence meets dream logic.',
  why:'Staged darkness scaled up until it becomes spectacle — the theatrical impulse taken to its largest possible size.'},
 {n:'Ken Currie', r:'Scotland · b. 1960',
  b:'Dark, theatrical figuration — the grotesque and the human, as Kamoi Rei painted it.',
  why:'Dark figuration that stays theatrical instead of clinical. A figure lit against a void — precisely the line that separates what you kept from what you cut.',
  w:['Three Oncologists']},
 {n:'Daniel Sprick', r:'USA · b. 1953',
  b:'Still lifes and interiors of uncanny stillness and precision.',
  why:'The hush applied to a room instead of a face — the only still life that survives here, because the air in it is doing something.',
  w:['Release Your Plans']},
 {n:'Alyssa Monks', r:'USA · b. 1977',
  b:'Faces and bodies seen through steam, glass, and water.',
  why:'The barrier between viewer and figure made into the entire subject — the Western statement of what 三重野慶 does with water.'},
 {n:'David Jon Kassan', r:'USA · b. 1977',
  b:'Life-size portraits, including his acclaimed Holocaust-survivor series.',
  why:'Attention itself as the effect. The sitter’s presence at life size does what lighting does elsewhere on this list.'},
 {n:'Zoey Frank', r:'USA · b. 1987',
  b:'Figurative composition that bridges classical drawing and modern design.',
  why:'The one painter here actively interrogating the composition rather than inheriting it — classical training pointed at a new problem.'},
 {n:'Rose Frantzen', r:'USA · b. 1965',
  b:'180 portraits of every neighbor in her Iowa hometown.',
  why:'Virtuosity spent on a project rather than on display — alla prima put to a purpose that outlasts the individual picture.',
  w:['Portrait of Maquoketa']},
 {n:'Nelson Shanks', r:'USA · 1937–2015',
  b:'Portraits of presidents and princesses; founded Studio Incamminati in Philadelphia.',
  why:'A lineage more than a signature — colour-driven figure painting and the school he left behind to keep teaching it.'},
 {n:'Burton Silverman', r:'USA · 1928–2024',
  b:'Humane, closely observed portraits across seven decades.',
  why:'Seventy years without a single showy passage. Realism that earns its quiet through observation instead of atmosphere — the exception that proves the rule.'},
];

/* ---------- enrichment: painters found to match the taste profile ---------- */
const ENRICH_ARTISTS = [];

/* ---------- illustrators ---------- */
const ILLUS = [
 {n:'Shiromizakana', jp:'白身魚', r:'Japan', b:'Translucent watercolour light; the 電撃文庫 / ファミ通文庫 covers — 『扉の外』, 『ココロコネクト』. Also draws as 堀口悠紀子.', why:'The Morimoto hush transposed onto anime — light through paper, nothing forced.', w:['ココロコネクト','扉の外']},
 {n:'loundraw', r:'Japan', b:'Weightless pastel scenes; covers for 住野よる novels.', why:'Air and distance rendered as colour; the figure is small and the atmosphere is the picture.', w:['君の膵臓をたべたい (cover)']},
 {n:'Kantoku', jp:'カントク', r:'Japan', b:'Soft, backlit girls in after-school light; doujin circle 5年目の放課後, and 『変態王子と笑わない猫。』.', why:'The backlit-classroom idiom in its purest form — the light source is the subject.'},
 {n:'Kurehito Misaki', jp:'深崎暮人', r:'Japan', b:'Crisp, luminous heroines.', why:'Clean line plus warm rim light — the drawing stays legible under all that glow.', w:['冴えない彼女の育てかた']},
 {n:'DSMile', jp:'DSマイル', r:'Japan', b:'Porcelain skin and warm gradient light.', why:'Gradient as a whole technique; the closest illustrator here to 島村信之’s porcelain surface.'},
 {n:'Mai Yoneyama', jp:'米山舞', r:'Japan', b:'Animator-turned-illustrator; kinetic girls wrapped in streaming light and motion.', why:'The bravura cluster’s energy in illustration form — visible attack, light as movement.', w:['EGO (series)']},
 {n:'Yom', jp:'よむ', r:'Japan', b:'The tights specialist — his stocking illustrations became the anime みるタイツ.', why:'A study of one material and how light passes through it — obsession narrowed to a single problem.', w:['みるタイツ']},
 {n:'nekojira', r:'Japan', b:'Soft, rounded girls with real-world texture; a pixiv / X favourite.', why:'Texture and ambient light rather than rendering polish.'},
 {n:'Kei Mochizuki', jp:'望月けい', r:'Japan', b:'Grunge-cute girls, band tees, and backstage light — a defining look of the streaming-music era.', why:'Staged light in a minor key; the closest illustration gets to theatrical.'},
 {n:'Mika Pikazo', r:'Japan', b:'Explosive color and fashion sense; character designs across games and VTubers.', why:'The colour end of the spectrum — saturation used structurally.'},
 {n:'LAM', r:'Japan', b:'Glossy, neon-lit figures with electric eyes.', why:'Artificial light sources as the whole palette.'},
 {n:'Shigure Ui', jp:'しぐれうい', r:'Japan', b:'Illustrator and character designer who became a self-drawn VTuber phenomenon.', why:'Soft daylight and a light touch on line weight.'},
 {n:'Naoki Saito', jp:'さいとうなおき', r:'Japan', b:'Pokémon TCG illustrator and the scene’s most-watched art teacher on YouTube.', why:'The method channel — like Schmid, valuable for how the marks get made.'},
 {n:'redjuice', r:'Japan', b:'Sleek sci-fi figures; Guilty Crown designs and EGOIST cover art.', why:'Cool light and graphic restraint.'},
 {n:'abec', r:'Japan', b:'Watercolor-clean character art — the face of Sword Art Online’s novels.', why:'Watercolour transparency held over hundreds of covers.'},
];

/* ---------- enrichment: illustrators found to match the taste profile ---------- */
const ENRICH_ILLUS = [];

/* ---------- where to study ---------- */
const STUDY = [];

/* ---------- verified work images, keyed by artist name ---------- */
const WORKS = {};

/* ============================== rendering ============================== */
const hiddenDir = new Set(loadLS('salon:hiddenDir', []));

/* Names that no longer exist in the data (baked-in removals) are dropped from
   the hidden set, so the Restore button never counts ghosts. */
(function pruneHidden(){
  const live = new Set();
  const walk = a => a.forEach(x => x.artists ? x.artists.forEach(y=>live.add(y.n)) : live.add(x.n));
  walk(ARTISTS); walk(ENRICH_ARTISTS); walk(ILLUS); walk(ENRICH_ILLUS); walk(STUDY);
  let changed = false;
  [...hiddenDir].forEach(n => { if(!live.has(n)){ hiddenDir.delete(n); changed = true; } });
  if (changed) saveLS('salon:hiddenDir', [...hiddenDir]);
})();

const imgSearch = q => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`;

function workStrip(a, suffix, hideEmpty){
  const ws = WORKS[a.n] || [];
  const searchAll = imgSearch((a.jp || a.n) + ' ' + suffix);
  if (!ws.length){
    // no verified images — fall back to the titled-work links we do have
    if (a.w && a.w.length){
      return `<div class="wks"><span>e.g.</span>${a.w.map(t =>
        `<a target="_blank" rel="noopener" href="${imgSearch((a.jp||a.n)+' '+t)}">「${esc(t)}」</a>`).join('')}</div>`;
    }
    if (hideEmpty) return '';
    return `<div class="wkEmpty">No images loaded — <a class="srcLink" target="_blank" rel="noopener" href="${searchAll}">search works ↗</a></div>`;
  }
  return `<div class="wkStrip">${ws.map((w,i) => `
    <a class="wkCard" href="${esc(w.src || w.img)}" target="_blank" rel="noopener"
       data-img="${esc(w.img)}" data-t="${esc(w.t||'')}" data-y="${esc(w.y||'')}"
       data-src="${esc(w.src||'')}" data-n="${esc(a.n)}">
      <img class="ph" loading="lazy" src="${esc(w.img)}" alt="${esc(w.t||a.n)}">
      <span class="cap"><b>${esc(w.t || '—')}</b>${w.ten ? `<i>${esc(w.ten)}</i>` : ''}${w.y ? `<i>${esc(w.y)}</i>` : ''}</span>
    </a>`).join('')}
    <a class="wkMore" href="${searchAll}" target="_blank" rel="noopener">more<br>works ↗</a>
  </div>`;
}

/* rows — used by both the flat lists and the grouped study tab */
function dirRows(artists, suffix, hideEmpty){
  return artists.map(a => `
    <div class="dirRow">
      <div style="flex:1; min-width:0">
        <span class="nm">${esc(a.n)}</span>${a.jp ? `<span class="jp">${esc(a.jp)}</span>` : ''}<span class="rg">${esc(a.r)}</span>${a.isNew ? `<span class="newTag">new</span>` : ''}
        <p>${esc(a.b)}</p>
        ${a.why ? `<p class="why">${esc(a.why)}</p>` : ''}
        ${a.noWorks ? '' : workStrip(a, suffix, hideEmpty)}
      </div>
      <div class="dirActs">
        ${a.site ? `<a class="srcLink" target="_blank" rel="noopener" href="${esc(a.site)}">${esc(a.siteLabel || 'school')} ↗</a>` : ''}
        <a class="srcLink" target="_blank" rel="noopener" href="${imgSearch((a.jp || a.n) + ' ' + suffix)}">see works ↗</a>
        <button class="dirDel" data-n="${esc(a.n)}" title="Remove from directory">×</button>
      </div>
    </div>`).join('');
}

function restoreBtn(){
  return hiddenDir.size
    ? `<button class="dirRestoreBtn">Restore ${hiddenDir.size} removed entr${hiddenDir.size>1?'ies':'y'}</button>` : '';
}

/* flat list, no group headings */
function renderFlat(data, suffix){
  const artists = data.filter(a => !hiddenDir.has(a.n));
  if (!artists.length) return '';
  return `<div class="dirGroup">${dirRows(artists, suffix)}</div>`;
}

/* grouped list, for the study tab */
function renderGrouped(data, suffix){
  return data.map(g => {
    const artists = g.artists.filter(a => !hiddenDir.has(a.n));
    if (!artists.length) return '';
    return `<div class="dirGroup"><h3>${esc(g.group)}</h3>${dirRows(artists, g.sq || suffix, true)}</div>`;
  }).join('');
}

function section(title, blurb){
  return `<div class="secHead"><h2>${esc(title)}</h2>${blurb ? `<p>${esc(blurb)}</p>` : ''}</div>`;
}

function renderContemp(){
  $('#contList').innerHTML =
    renderFlat(ARTISTS, 'painting') +
    (ENRICH_ARTISTS.length
      ? section('More painters in this vein',
          'Found by reading the list above for what it has in common — the sealed quiet at one end, the staged darkness at the other, and the figure seen through water, steam or glass running between them.')
        + renderFlat(ENRICH_ARTISTS, 'painting')
      : '') +
    restoreBtn();
}
function renderIllu(){
  $('#illuList').innerHTML =
    renderFlat(ILLUS, 'イラスト') +
    (ENRICH_ILLUS.length
      ? section('More illustrators in this vein',
          'The same taste applied to illustration: translucent light, backlit gradients, a single figure in a quiet moment.')
        + renderFlat(ENRICH_ILLUS, 'イラスト')
      : '') +
    restoreBtn();
}
function renderStudy(){
  $('#studyList').innerHTML = renderGrouped(STUDY, 'painting') + restoreBtn();
}
function renderAll(){ renderContemp(); renderIllu(); renderStudy(); }

/* ---------- interactions ---------- */
function dirClick(e){
  const card = e.target.closest('.wkCard');
  if (card && e.target.classList.contains('ph')){
    e.preventDefault();
    openLightbox(card.dataset);
    return;
  }
  const del = e.target.closest('.dirDel');
  if (del){
    hiddenDir.add(del.dataset.n);
    saveLS('salon:hiddenDir', [...hiddenDir]);
    renderAll();
    toast('Removed — the Restore button at the bottom brings them back');
    return;
  }
  if (e.target.closest('.dirRestoreBtn')){
    hiddenDir.clear();
    saveLS('salon:hiddenDir', []);
    renderAll();
    toast('All removed entries restored');
  }
}
$('#contList').addEventListener('click', dirClick);
$('#illuList').addEventListener('click', dirClick);
$('#studyList').addEventListener('click', dirClick);

/* hide thumbnails whose host stopped serving them, rather than showing a broken box */
document.addEventListener('error', e => {
  if (e.target.classList && e.target.classList.contains('ph')){
    const card = e.target.closest('.wkCard');
    if (card) card.remove();
  }
}, true);

function openLightbox(d){
  $('#lbImg').src = d.img;
  $('#lbCap').innerHTML = `${esc(d.t || '')}${d.y ? ' · ' + esc(d.y) : ''}
    <span style="color:#7d6b47"> — ${esc(d.n)}</span>
    ${d.src ? `<a href="${esc(d.src)}" target="_blank" rel="noopener">source ↗</a>` : ''}`;
  $('#lb').classList.add('show');
}
function closeLightbox(){ $('#lb').classList.remove('show'); $('#lbImg').src = ''; }
$('#lbClose').addEventListener('click', closeLightbox);
$('#lb').addEventListener('click', e => { if (e.target.id === 'lb') closeLightbox(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

