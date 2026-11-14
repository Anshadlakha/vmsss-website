// Report card maths + A4 renderer (shared by teacher and admin panels)
(function () {
  const T1 = [['pa1', 'PA-1', 5], ['pa2', 'PA-2', 5], ['ia', 'Int. Assess.', 10], ['hy', 'Half Yearly', 80]];
  const T2 = [['pa3', 'PA-3', 5], ['pa4', 'PA-4', 5], ['ia', 'Int. Assess.', 10], ['an', 'Annual', 80]];
  const GRADES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D', 'E'];
  const SCALE = [[91, 'A1'], [81, 'A2'], [71, 'B1'], [61, 'B2'], [51, 'C1'], [41, 'C2'], [33, 'D'], [0, 'E']];
  const CO_GRADES = ['A', 'B', 'C', 'D'];
  const CODES = ['AB', 'ML', 'LA'];

  const grade = p => (p == null || isNaN(p)) ? '' : SCALE.find(([lo]) => p >= lo)[1];
  const num = v => {
    if (v === '' || v == null) return null;
    if (CODES.includes(String(v).toUpperCase())) return 0;
    const n = Number(v); return isNaN(n) ? null : n;
  };
  const has = v => v !== '' && v != null;
  const fmt = n => (n == null || isNaN(n)) ? '' : (Math.round(n * 10) / 10).toString();

  function calc(card, cls) {
    const d = card.data || {};
    const subs = cls ? cls.subjects : Object.keys(d.t1 || {});
    const out = { rows: [], t1: 0, t2: 0, ov: 0, t1Any: false, t2Any: false };
    subs.forEach(s => {
      const a = (d.t1 || {})[s] || {}, b = (d.t2 || {})[s] || {};
      const aAny = T1.some(([k]) => has(a[k])), bAny = T2.some(([k]) => has(b[k]));
      const t1c = aAny ? T1.reduce((x, [k]) => x + (num(a[k]) || 0), 0) : null;
      const t2c = bAny ? T2.reduce((x, [k]) => x + (num(b[k]) || 0), 0) : null;
      const t1 = has(a.tot) ? num(a.tot) : t1c, t2 = has(b.tot) ? num(b.tot) : t2c;
      const ovc = (t1 != null && t2 != null) ? (t1 + t2) / 2 : null;
      const ovv = ovc;
      const row = {
        s, a, b, t1, t2, t1c, t2c, ov: ovv,
        g1: has(a.gr) ? a.gr : grade(t1), g1c: grade(t1),
        g2: has(b.gr) ? b.gr : grade(t2), g2c: grade(t2),
        go: has(((d.ov || {})[s] || {}).gr) ? d.ov[s].gr : grade(ovv), goc: grade(ovv),
      };
      if (t1 != null) { out.t1 += t1; out.t1Any = true; }
      if (t2 != null) { out.t2 += t2; out.t2Any = true; }
      if (ovv != null) out.ov += ovv;
      out.rows.push(row);
    });
    const max = subs.length * 100;
    out.max = max;
    out.p1 = out.t1Any && max ? out.t1 / max * 100 : null;
    out.p2 = out.t2Any && max ? out.t2 / max * 100 : null;
    const allOv = out.rows.length && out.rows.every(r => r.ov != null);
    out.po = allOv ? out.ov / max * 100 : null;
    out.g1 = grade(out.p1); out.g2 = grade(out.p2); out.go = grade(out.po);
    // final percentage = overall if both terms entered, otherwise latest term
    out.finalP = out.po != null ? out.po : (out.p2 != null ? out.p2 : out.p1);
    out.finalG = grade(out.finalP);
    const basis = out.po != null ? out.rows.map(r => r.ov) : out.rows.map(r => r.t2 != null ? r.t2 : r.t1);
    out.resultCalc = basis.length && basis.every(v => v != null) ? (basis.every(v => v >= 33) ? 'PASS' : 'NEEDS IMPROVEMENT') : '';
    out.result = has(d.result) ? d.result : out.resultCalc;
    return out;
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cell = v => has(v) ? esc(String(v).toUpperCase() === v ? v : v) : '–';

  function render(card, cls, settings) {
    const c = calc(card, cls), d = card.data || {};
    const co = (cls && cls.co) || [];
    const rows = c.rows.map(r => `<tr><td class="l">${esc(r.s)}</td>${T1.map(([k]) => `<td>${cell(r.a[k])}</td>`).join('')}<td class="b">${fmt(r.t1) || '–'}</td><td class="g">${esc(r.g1) || '–'}</td>${T2.map(([k]) => `<td>${cell(r.b[k])}</td>`).join('')}<td class="b">${fmt(r.t2) || '–'}</td><td class="g">${esc(r.g2) || '–'}</td><td class="b">${fmt(r.ov) || '–'}</td><td class="g">${esc(r.go) || '–'}</td></tr>`).join('');
    const CO_MEAN = { A: 'Outstanding', B: 'Very Good', C: 'Good', D: 'Needs Improvement' };
    const coCell = g => g ? `<b class="cg">${esc(g)}</b><span class="cm">${CO_MEAN[g] || ''}</span>` : '–';
    const coRows = co.map(n => { const g = (d.co || {})[n] || {}; return `<tr><td class="l">${esc(n)}</td><td class="co">${coCell(g.t1)}</td><td class="co">${coCell(g.t2)}</td></tr>`; }).join('');
    const pct = v => v == null ? '–' : v.toFixed(1) + '%';
    const resCls = c.result === 'PASS' ? 'pass' : (c.result ? 'warn' : '');
    const sig = (img, label) => `<div class="sg">${img ? `<img src="${esc(img)}" alt="">` : '<span class="ph"></span>'}<div>${label}</div></div>`;
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
<table class="rc-t"><thead><tr><th rowspan="2" style="width:17%">Subject</th><th colspan="6">Term I</th><th colspan="6">Term II</th><th colspan="2">Overall</th></tr>
<tr class="sub">${T1.map(([, l, m]) => `<th>${l}<small>${m}</small></th>`).join('')}<th>Total<small>100</small></th><th>Grade</th>${T2.map(([, l, m]) => `<th>${l}<small>${m}</small></th>`).join('')}<th>Total<small>100</small></th><th>Grade</th><th>T1 + T2<small>50% each</small></th><th>Grade</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td class="l">Total (${c.max})</td><td colspan="4"></td><td>${c.t1Any ? fmt(c.t1) : '–'}</td><td>${c.g1 || '–'}</td><td colspan="4"></td><td>${c.t2Any ? fmt(c.t2) : '–'}</td><td>${c.g2 || '–'}</td><td>${c.po != null ? fmt(c.ov) : '–'}</td><td>${c.go || '–'}</td></tr>
<tr><td class="l">Percentage</td><td colspan="4"></td><td colspan="2">${pct(c.p1)}</td><td colspan="4"></td><td colspan="2">${pct(c.p2)}</td><td colspan="2">${pct(c.po)}</td></tr></tfoot></table>
<div class="rc-two"><div><h2>Co-Scholastic Area</h2><table class="rc-t"><thead><tr><th style="width:36%">Activity</th><th style="width:32%">Term I</th><th style="width:32%">Term II</th></tr></thead><tbody>${coRows}</tbody></table></div>
<div><h2>Result</h2><div class="rc-res"><div><span>Percentage</span><b>${pct(c.finalP)}</b></div><div><span>Grade</span><b>${c.finalG || '–'}</b></div><div class="${resCls}"><span>Result</span><b>${esc(c.result) || '–'}</b></div></div>
<div class="rc-prom">${d.promoted ? `Promoted to Class <b>${esc(d.promoted)}</b> · ` : ''}School reopens on <b>${esc(settings.reopen || '')}</b></div>
<h2>Class Teacher’s Remark</h2><div class="rc-box">${esc(d.remark || '')}</div></div></div>
<h2>Grading Scale</h2>
<div class="rc-gs">${SCALE.map(([lo, g], i) => `<div><b>${g}</b>${i === 0 ? '91–100' : i === 7 ? 'Below 33' : lo + '–' + (SCALE[i - 1][0] - 1)}</div>`).join('')}</div>
<div class="rc-cog"><b>Co-scholastic grades:</b> A – Outstanding · B – Very Good · C – Good · D – Needs Improvement</div>
<div class="rc-sig">${sig(card.teacher_signature, 'Class Teacher')}${sig(settings.principal_signature, 'Principal')}${sig('', 'Parent / Guardian')}</div>
<div class="rc-note">ML – Medical Leave · AB – Absent · LA – Late Admission &nbsp;|&nbsp; Exploring education, fostering growth.</div>
</div></div>`;
  }

  window.RC = { T1, T2, GRADES, CO_GRADES, CODES, grade, calc, render, fmt, esc };
})();
