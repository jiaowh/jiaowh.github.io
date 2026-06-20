// ── Custom cursor ──
const cursor   = document.getElementById('cursor');
const follower = document.getElementById('follower');
let mx = 0, my = 0, fx = 0, fy = 0;

document.addEventListener('mousemove', e => {
  mx = e.clientX;
  my = e.clientY;
  cursor.style.left = mx + 'px';
  cursor.style.top  = my + 'px';
});

(function tick() {
  fx += (mx - fx) * 0.12;
  fy += (my - fy) * 0.12;
  follower.style.left = fx + 'px';
  follower.style.top  = fy + 'px';
  requestAnimationFrame(tick);
})();

// ── Card 3D tilt + holographic shine ──
document.querySelectorAll('[data-card]').forEach(card => {
  let rect;

  card.addEventListener('mouseenter', () => {
    rect = card.getBoundingClientRect();
    document.body.classList.add('is-hovering');
  });

  card.addEventListener('mousemove', e => {
    if (!rect) rect = card.getBoundingClientRect();

    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width  / 2); // -1 → +1
    const dy = (e.clientY - cy) / (rect.height / 2); // -1 → +1

    // 3D tilt: rotate opposite to cursor direction for parallax depth feel
    card.style.setProperty('--rx', (-dy * 13) + 'deg');
    card.style.setProperty('--ry', ( dx * 10) + 'deg');

    // Holographic position follows cursor
    const hx = ((e.clientX - rect.left) / rect.width  * 100).toFixed(1);
    const hy = ((e.clientY - rect.top)  / rect.height * 100).toFixed(1);
    const ha = (Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1);
    card.style.setProperty('--holo-x', hx + '%');
    card.style.setProperty('--holo-y', hy + '%');
    card.style.setProperty('--holo-a', ha + 'deg');
  });

  card.addEventListener('mouseleave', () => {
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
    document.body.classList.remove('is-hovering');
  });
});
