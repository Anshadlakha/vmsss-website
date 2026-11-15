// Report card maths + A4 renderer (shared by teacher and admin panels).
// Every class carries its own "format": terms, mark columns with max marks,
// grading scale, pass mark and co-scholastic grades. The teacher form and the
// printed card are both built from that format.
(function () {
  const DEF_FORMAT = {
    terms: [
      { k: 't1', n: 'Term I', cols: [{ k: 'pa1', l: 'PA-1', m: 5 }, { k: 'pa2', l: 'PA-2', m: 5 }, { k: 'ia', l: 'Int. Assess.', m: 10 }, { k: 'hy', l: 'Half Yearly', m: 80 }] },
      { k: 't2', n: 'Term II', cols: [{ k: 'pa3', l: 'PA-3', m: 5 }, { k: 'pa4', l: 'PA-4', m: 5 }, { k: 'ia', l: 'Int. Assess.', m: 10 }, { k: 'an', l: 'Annual', m: 80 }] },
    ],
    scale: [[91, 'A1'], [81, 'A2'], [71, 'B1'], [61, 'B2'], [51, 'C1'], [41, 'C2'], [33, 'D'], [0, 'E']],
    pass: 33,
    co: [['A', 'Outstanding'], ['B', 'Very Good'], ['C', 'Good'], ['D', 'Needs Improvement']],
  };
  const CODES = ['AB', 'ML', 'LA'];
  const clone = o => JSON.parse(JSON.stringify(o));

  // Always returns a complete, safe format with computed term maximums.
  function formatOf(cls) {
    const f = cls && cls.format && Array.isArray(cls.format.terms) && cls.format.terms.length ? cls.format : DEF_FORMAT;
    const terms = f.terms.map((t, i) => {
      const cols = (t.cols || []).filter(c => c && c.l).map(c => ({ k: String(c.k), l: String(c.l), m: Math.max(0, +c.m || 0) }));
      return { k: String(t.k || 't' + (i + 1)), n: String(t.n || 'Term ' + (i + 1)), cols, max: cols.reduce((a, c) => a + c.m, 0) };
    });
    const scale = (Array.isArray(f.scale) && f.scale.length ? f.scale : DEF_FORMAT.scale)
      .map(([lo, g]) => [+lo || 0, String(g)]).sort((a, b) => b[0] - a[0]);
    if (!scale.length || scale[scale.length - 1][0] > 0) scale.push([0, scale.length ? scale[scale.length - 1][1] : 'E']);
    const co = Array.isArray(f.co) && f.co.length ? f.co.map(([g, m]) => [String(g), String(m || '')]) : DEF_FORMAT.co;
    return { terms, scale, pass: f.pass == null || f.pass === '' ? 33 : +f.pass, co };
  }

  const num = v => {
    if (v === '' || v == null) return null;
    if (CODES.includes(String(v).toUpperCase())) return 0;
    const n = Number(v); return isNaN(n) ? null : n;
  };
  const has = v => v !== '' && v != null;
  const fmt = n => (n == null || isNaN(n)) ? '' : (Math.round(n * 10) / 10).toString();

  function calc(card, cls) {
    const F = formatOf(cls), d = card.data || {};
    const grade = p => (p == null || isNaN(p)) ? '' : (F.scale.find(([lo]) => p >= lo) || F.scale[F.scale.length - 1])[1];
    const subs = cls && cls.subjects ? cls.subjects : Object.keys(d[F.terms[0] && F.terms[0].k] || {});
    const out = { F, grade, rows: [], term: {}, ov: 0 };
    F.terms.forEach(t => { out.term[t.k] = { sum: 0, any: false }; });
    subs.forEach(s => {
      const row = { s, t: {} };
      F.terms.forEach(t => {
        const v = (d[t.k] || {})[s] || {};
        const any = t.cols.some(c => has(v[c.k]));
        const totc = any ? t.cols.reduce((x, c) => x + (num(v[c.k]) || 0), 0) : null;
        const tot = has(v.tot) ? num(v.tot) : totc;
        const pct = tot != null && t.max ? tot / t.max * 100 : null;
        row.t[t.k] = { v, tot, totc, pct, g: has(v.gr) ? v.gr : grade(pct), gc: grade(pct) };
        if (tot != null) { out.term[t.k].sum += tot; out.term[t.k].any = true; }
      });
      const pcts = F.terms.map(t => row.t[t.k].pct);
      row.ov = pcts.length && pcts.every(p => p != null) ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
      row.goc = grade(row.ov);
      row.go = has(((d.ov || {})[s] || {}).gr) ? d.ov[s].gr : row.goc;
      if (row.ov != null) out.ov += row.ov;
      out.rows.push(row);
    });
    F.terms.forEach(t => {
      const T = out.term[t.k]; T.max = subs.length * t.max;
      T.p = T.any && T.max ? T.sum / T.max * 100 : null; T.g = grade(T.p);
    });
    const allOv = out.rows.length && out.rows.every(r => r.ov != null);
    out.po = allOv ? out.ov / out.rows.length : null;
    out.go = grade(out.po);
    let latest = null;
    F.terms.forEach(t => { if (out.term[t.k].p != null) latest = t.k; });
    out.finalP = out.po != null ? out.po : (latest ? out.term[latest].p : null);
    out.finalG = grade(out.finalP);
    const basis = out.po != null ? out.rows.map(r => r.ov) : out.rows.map(r => latest ? r.t[latest].pct : null);
    out.resultCalc = basis.length && basis.every(v => v != null) ? (basis.every(v => v >= F.pass) ? 'PASS' : 'NEEDS IMPROVEMENT') : '';
    out.result = has(d.result) ? d.result : out.resultCalc;
    return out;
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cell = v => has(v) ? esc(v) : '–';

  function scaleText(F) {
    return F.scale.map(([lo, g], i) => {
      const hi = i === 0 ? 100 : F.scale[i - 1][0] - 1;
      return `<div><b>${esc(g)}</b>${lo === 0 ? 'Below ' + (F.scale[i - 1] ? F.scale[i - 1][0] : '') : lo + '–' + hi}</div>`;
    }).join('');
  }

  function render(card, cls, settings) {
    const c = calc(card, cls), F = c.F, d = card.data || {};
    const co = (cls && cls.co) || [];
    const multi = F.terms.length > 1;
    const nCols = F.terms.reduce((a, t) => a + t.cols.length + 2, 0) + (multi ? 2 : 0);
    const small = nCols > 15 ? ' tight' : '';
    const rows = c.rows.map(r => `<tr><td class="l">${esc(r.s)}</td>${F.terms.map(t => {
      const x = r.t[t.k];
      return t.cols.map(col => `<td>${cell(x.v[col.k])}</td>`).join('') + `<td class="b">${fmt(x.tot) || '–'}</td><td class="g">${esc(x.g) || '–'}</td>`;
    }).join('')}${multi ? `<td class="b">${fmt(r.ov) || '–'}</td><td class="g">${esc(r.go) || '–'}</td>` : ''}</tr>`).join('');
    const coMean = Object.fromEntries(F.co);
    const coCell = g => g ? `<b class="cg">${esc(g)}</b><span class="cm">${esc(coMean[g] || '')}</span>` : '–';
    const coRows = co.map(n => { const g = (d.co || {})[n] || {}; return `<tr><td class="l">${esc(n)}</td>${F.terms.map(t => `<td class="co">${coCell(g[t.k])}</td>`).join('')}</tr>`; }).join('');
    const pct = v => v == null ? '–' : v.toFixed(1) + '%';
    const resCls = c.result === 'PASS' ? 'pass' : (c.result ? 'warn' : '');
    const sig = (img, label) => `<div class="sg">${img ? `<img src="${esc(img)}" alt="">` : '<span class="ph"></span>'}<div>${label}</div></div>`;
    const foot1 = F.terms.map(t => `<td colspan="${t.cols.length}"></td><td>${c.term[t.k].any ? fmt(c.term[t.k].sum) : '–'}</td><td>${c.term[t.k].g || '–'}</td>`).join('');
    const foot2 = F.terms.map(t => `<td colspan="${t.cols.length}"></td><td colspan="2">${pct(c.term[t.k].p)}</td>`).join('');
    const maxAll = F.terms.map(t => c.term[t.k].max).join(' / ');
    return `<div class="rc-page"><div class="rc-frame">
<div class="rc-hd"><img src="/assets/img/logo-vmsss.png" alt="" class="rc-logo"><div class="t"><h1>Vivek Model Sr. Sec. School</h1>
<div class="s">Vatika Kunj, Maruti Kunj, Gurugram, Haryana 122102<br><b>Affiliation No. 5035</b><br>+91 98111 97509 · contact@vivekmodelsrsecschool.in · vivekmodelsrsecschool.in</div></div><span class="rc-logo"></span></div>
<div class="rc-ttl">REPORT CARD · <span>SESSION ${esc(card.session || settings.session || '')}</span></div>
<div class="rc-info">
<div><span>Student Name</span><b>${esc(card.student_name)}</b></div><div><span>Father’s Name</span><b>${esc(card.father)}</b></div>
<div><span>Class &amp; Section</span><b>${esc(card.class_name)}${card.section ? ' – ' + esc(card.section) : ''}</b></div><div><span>Mother’s Name</span><b>${esc(card.mother)}</b></div>
<div><span>Admission No.</span><b>${esc(card.admission_no)}</b></div><div><span>Roll No.</span><b>${esc(card.roll_no)}</b></div>
<div><span>Date of Birth</span><b>${esc(card.dob)}</b></div><div><span>Attendance</span><b>${card.attendance ? esc(card.attendance) + '%' : ''}</b></div></div>
<h2>Scholastic Area</h2>
<table class="rc-t${small}"><thead><tr><th rowspan="2" style="width:17%">Subject</th>${F.terms.map(t => `<th colspan="${t.cols.length + 2}">${esc(t.n)}</th>`).join('')}${multi ? '<th colspan="2">Overall</th>' : ''}</tr>
<tr class="sub">${F.terms.map(t => t.cols.map(col => `<th>${esc(col.l)}<small>${col.m}</small></th>`).join('') + `<th>Total<small>${t.max}</small></th><th>Grade</th>`).join('')}${multi ? `<th>Overall<small>%</small></th><th>Grade</th>` : ''}</tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td class="l">Total (${maxAll})</td>${foot1}${multi ? `<td>${c.po != null ? fmt(c.po) + '%' : '–'}</td><td>${c.go || '–'}</td>` : ''}</tr>
<tr><td class="l">Percentage</td>${foot2}${multi ? `<td colspan="2">${pct(c.po)}</td>` : ''}</tr></tfoot></table>
<div class="rc-two"><div><h2>Co-Scholastic Area</h2><table class="rc-t"><thead><tr><th style="width:36%">Activity</th>${F.terms.map(t => `<th>${esc(t.n)}</th>`).join('')}</tr></thead><tbody>${coRows}</tbody></table></div>
<div><h2>Result</h2><div class="rc-res"><div><span>Percentage</span><b>${pct(c.finalP)}</b></div><div><span>Grade</span><b>${c.finalG || '–'}</b></div><div class="${resCls}"><span>Result</span><b>${esc(c.result) || '–'}</b></div></div>
<div class="rc-prom">${d.promoted ? `Promoted to Class <b>${esc(d.promoted)}</b> · ` : ''}School reopens on <b>${esc(settings.reopen || '')}</b></div>
<h2>Class Teacher’s Remark</h2><div class="rc-box">${esc(d.remark || '')}</div></div></div>
<h2>Grading Scale</h2>
<div class="rc-gs">${scaleText(F)}</div>
<div class="rc-cog"><b>Co-scholastic grades:</b> ${F.co.map(([g, m]) => `${esc(g)} – ${esc(m)}`).join(' · ')}</div>
<div class="rc-sig">${sig(card.teacher_signature, 'Class Teacher')}${sig(settings.principal_signature, 'Principal')}${sig('', 'Parent / Guardian')}</div>
<div class="rc-note">ML – Medical Leave · AB – Absent · LA – Late Admission &nbsp;|&nbsp; Exploring education, fostering growth.</div>
</div></div>`;
  }

  window.RC = { DEF_FORMAT, CODES, formatOf, calc, render, fmt, esc, clone };
})();
