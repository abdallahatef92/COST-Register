// =====================================================================================  New version: the user updates by hand (installed app / web address only)
// The app opens the version it has (the service worker keeps it). It looks at version.json on the web address;
// a different version shows a notice in the top bar: What's new · Update · Later. Nothing changes until Update.
// The downloaded .html (file://) never looks – it stays the version it is.
const APP_VER = '__VER__'.replace(/^v/, '');
const APP_CACHE = 'cost-register-app';
const upEl = (id) => document.getElementById(id),
  upEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]),
  upSay = (m) => (typeof window.toast === 'function' ? window.toast(m) : null);
async function appCheck() {
  if (location.protocol.indexOf('http') !== 0 || !window.caches) return;
  let v;
  try {
    v = await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json();
  } catch (e) {
    return; // offline: nothing to show
  }
  if (!v || !v.v || v.v === APP_VER) return;
  const notes = [];
  for (const r of v.notes || []) {
    if (r.v === APP_VER) break; // only what is newer than this version
    notes.push(r);
  }
  appNotice(v.v, notes);
}
function appNotice(nv, notes) {
  const top = upEl('bUndo');
  if (!top || document.querySelector('.upn')) return;
  const mk = () => {
    const n = document.createElement('div');
    n.className = 'upn';
    n.innerHTML = `<span class="dot"></span>v${upEsc(nv)} available <a data-upn="new">What's new</a><button class="u" data-upn="go">Update</button><button class="lt" data-upn="later">Later</button>`;
    return n;
  };
  top.parentNode.insertBefore(mk(), top); // the top bar of the register
  const fx = mk();
  fx.classList.add('fx'); // the same notice on the start page (CSS hides it once the register is open)
  document.body.appendChild(fx);
  const w = document.createElement('div');
  w.id = 'upw';
  w.className = 'upw';
  w.hidden = true;
  w.innerHTML = `<div class="h"><h3>What's new in v${upEsc(nv)}</h3><div class="s">You are on v${upEsc(APP_VER)} · your data file is not touched – only the Tool changes</div></div>
    ${
      notes.length
        ? notes
            .map(
              (r) =>
                (notes.length > 1 ? `<div class="vv">v${upEsc(r.v)}</div>` : '') +
                `<ul>${(r.n || []).map((x) => `<li>${upEsc(x)}</li>`).join('')}</ul>`
            )
            .join('')
        : '<ul><li>Small fixes</li></ul>'
    }
    <div class="f"><span class="n">Update reloads the Tool (a few seconds).<br>Later: stay on v${upEsc(APP_VER)} – asked again next time.</span><button data-upn="later">Later</button><button class="p" data-upn="go">Update to v${upEsc(nv)}</button></div>`;
  document.body.appendChild(w);
}
async function appUpdate() {
  upSay('Updating the Tool…');
  try {
    const c = await caches.open(APP_CACHE);
    await c.add(new Request('./', { cache: 'reload' })); // the new page replaces the kept one
    await c.add(new Request('manifest.webmanifest', { cache: 'reload' })).catch(() => {});
  } catch (e) {
    upSay('Could not update – try again when online');
    return;
  }
  location.reload();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-upn]');
  if (!b) return;
  const k = b.dataset.upn,
    w = upEl('upw');
  if (k === 'new') w.hidden = !w.hidden;
  else if (k === 'go') appUpdate();
  else if (k === 'later') {
    document.querySelectorAll('.upn').forEach((x) => x.remove());
    w.remove();
  }
});
setTimeout(appCheck, 1500);
