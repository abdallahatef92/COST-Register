// =====================================================================================  Changes: the log of every change (newest first), kept with the codes
function renderLog() {
  const q = (ST.logQ || '').toLowerCase(),
    rows = ST.log
      .slice()
      .reverse()
      .filter((x) => !q || x.label.toLowerCase().includes(q)),
    day = (iso) => iso.slice(0, 10),
    tm = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  let last = '';
  $('log').innerHTML =
    `<div class="panel"><h2>Changes<span class="note">every change you made in this register, newest first – kept with Save codes and in the Excel export</span></h2>
    <div style="display:flex;gap:8px;margin-bottom:8px"><input id="logQ" type="search" placeholder="Search changes…" value="${esc(ST.logQ || '')}" style="width:300px;padding:5px 10px;border:1px solid var(--line);border-radius:6px"><span class="help" style="align-self:center">${rows.length} of ${ST.log.length}</span></div>
    <table class="s fxt" data-fx="log"><tr><th style="text-align:left;width:120px">Date</th><th style="text-align:left;width:70px">Time</th><th style="text-align:left">Change</th><th style="width:90px">Cells</th><th style="width:110px">Cut date</th></tr>
    ${
      rows
        .slice(0, 1500)
        .map((x) => {
          const d = day(x.at),
            h = d !== last ? d : '';
          last = d;
          return `<tr><td style="text-align:left;font-weight:600">${h}</td><td style="text-align:left">${tm(x.at)}</td><td style="text-align:left" dir="auto">${esc(x.label)}</td><td>${x.n}</td><td>${esc(x.cut || '')}</td></tr>`;
        })
        .join('') || '<tr><td colspan="5" class="help" style="text-align:left">No changes yet.</td></tr>'
    }</table></div>`;
  fxScan($('log'));
  const i = $('logQ');
  i.oninput = () => {
    ST.logQ = i.value;
    const p = i.selectionStart;
    renderLog();
    const n = $('logQ');
    n.focus();
    n.setSelectionRange(p, p);
  };
}
