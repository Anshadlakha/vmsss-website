(function () {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const esc = RC.esc;
  const app = $('#app');
  let S = { me: null, classes: [], settings: {}, teachers: [] };

  async function api(path, opts = {}) {
    const o = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
    if (opts.body !== undefined) { o.headers['content-type'] = 'application/json'; o.body = JSON.stringify(opts.body); }
    const r = await fetch('/api' + path, o);
    let d = {}; try { d = await r.json(); } catch (e) {}
    if (!r.ok) { const e = new Error(d.error || ('Error ' + r.status)); e.status = r.status; throw e; }
    return d;
  }
  const clsOf = name => S.classes.find(c => c.name === name);
  const initials = n => (n || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const avatar = (u, cls = '') => u.photo ? `<img src="${esc(u.photo)}" alt="" class="${cls}">` : `<span class="av">${esc(initials(u.name))}</span>`;
  const statusPill = s => `<span class="st ${s}">${{ draft: 'Draft', submitted: 'Submitted', approved: 'Approved' }[s] || s}</span>`;
  function toast(el, msg, ok) { el.innerHTML = msg ? `<div class="${ok ? 'okmsg' : 'err'}">${esc(msg)}</div>` : ''; }

  function readImage(file, max = 320) {
    return new Promise((res, rej) => {
      if (!file) return res('');
      if (!/^image\//.test(file.type)) return rej(new Error('Please choose an image file'));
      const fr = new FileReader();
      fr.onload = () => {
        const im = new Image();
        im.onload = () => {
          const k = Math.min(1, max / Math.max(im.width, im.height));
          const cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
          const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, cv.width, cv.height);
          res(cv.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85));
        };
        im.onerror = () => rej(new Error('Could not read image'));
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  // ---------------- boot ----------------
  async function boot() {
    try {
      const b = await api('/bootstrap');
      Object.assign(S, b);
      shell();
      S.me.role === 'admin' ? adminHome() : teacherHome();
    } catch (e) {
      if (e.status === 401) {
        try { const st = await api('/setup-status'); st.needsSetup ? setupView() : loginView(); }
        catch (e2) { app.innerHTML = `<div class="login"><div class="box"><div class="err">${esc(e2.message)}</div></div></div>`; }
      } else app.innerHTML = `<div class="login"><div class="box"><div class="err">${esc(e.message)}</div></div></div>`;
    }
  }

  function loginView() {
    let email = '';
    const step1 = () => {
      app.innerHTML = `<div class="login"><form class="box" id="lf" novalidate>
        <img src="/assets/img/logo-vmsss.png" alt=""><h1>School Portal</h1><p class="c">Vivek Model Sr. Sec. School · Teachers &amp; Admin</p>
        <div class="f"><label>Your school email</label><input name="email" type="email" autocomplete="email" value="${esc(email)}" required></div>
        <div id="lm"></div><button class="btn pri" style="width:100%">Send login code</button>
        <p class="c" style="margin:14px 0 0"><a href="#" id="adm">Admin: log in with password</a> · <a href="/">Website</a></p></form></div>`;
      $('#lf').onsubmit = async e => {
        e.preventDefault(); email = e.target.email.value.trim();
        if (!email) return toast($('#lm'), 'Enter your email');
        const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Sending…';
        try { const r = await api('/otp/request', { method: 'POST', body: { email } }); step2(r.dev_code); }
        catch (er) {
          btn.disabled = false; btn.textContent = 'Send login code';
          if (er.message === 'not_registered') $('#lm').innerHTML = `<div class="err"><b>This email is not registered on the portal.</b><br>Please contact the school admin to get access.<br>📞 <a href="tel:+919811197509">+91 98111 97509</a> · ✉️ <a href="mailto:contact@vivekmodelsrsecschool.in">contact@vivekmodelsrsecschool.in</a></div>`;
          else toast($('#lm'), er.message);
        }
      };
      $('#adm').onclick = e => { e.preventDefault(); pwLogin(); };
    };
    const step2 = dev => {
      app.innerHTML = `<div class="login"><form class="box" id="cf" novalidate>
        <img src="/assets/img/logo-vmsss.png" alt=""><h1>Enter your code</h1><p class="c">We sent a 6-digit code to <b>${esc(email)}</b> from no-reply@vivekmodelsrsecschool.in. Check spam too.</p>
        <div class="f"><label>6-digit code</label><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" style="font-size:1.6rem;letter-spacing:.5em;text-align:center" value="${dev || ''}" required></div>
        <div id="lm"></div><button class="btn pri" style="width:100%">Log in</button>
        <p class="c" style="margin:14px 0 0"><a href="#" id="rs">Resend code</a> · <a href="#" id="ch">Use a different email</a></p></form></div>`;
      $('#cf').code.focus();
      $('#cf').onsubmit = async e => {
        e.preventDefault(); const code = e.target.code.value.trim();
        if (!/^\d{6}$/.test(code)) return toast($('#lm'), 'Enter the 6-digit code from your email');
        try { await api('/otp/verify', { method: 'POST', body: { email, code } }); boot(); } catch (er) { toast($('#lm'), er.message); }
      };
      $('#rs').onclick = async e => { e.preventDefault(); try { const r = await api('/otp/request', { method: 'POST', body: { email } }); if (r.dev_code) $('#cf').code.value = r.dev_code; toast($('#lm'), 'A new code has been sent.', true); } catch (er) { toast($('#lm'), er.message); } };
      $('#ch').onclick = e => { e.preventDefault(); step1(); };
    };
    const pwLogin = () => {
      app.innerHTML = `<div class="login"><form class="box" id="pf" novalidate>
        <img src="/assets/img/logo-vmsss.png" alt=""><h1>Admin login</h1><p class="c">Backup login with password (admins only)</p>
        <div class="f"><label>Email</label><input name="email" type="email" autocomplete="username" value="${esc(email)}"></div>
        <div class="f"><label>Password</label><input name="password" type="password" autocomplete="current-password"></div>
        <div id="lm"></div><button class="btn pri" style="width:100%">Log in</button><p class="c" style="margin:14px 0 0"><a href="#" id="bk2">← Log in with email code</a></p></form></div>`;
      $('#pf').onsubmit = async e => {
        e.preventDefault(); const f = e.target;
        try { await api('/login', { method: 'POST', body: { email: f.email.value, password: f.password.value } }); boot(); } catch (er) { toast($('#lm'), er.message); }
      };
      $('#bk2').onclick = e => { e.preventDefault(); step1(); };
    };
    step1();
  }
  function setupView() {
    app.innerHTML = `<div class="login"><form class="box" id="sf" novalidate>
      <img src="/assets/img/logo-vmsss.png" alt=""><h1>Create admin account</h1><p class="c">First-time setup. This can only be done once.</p>
      <div class="f"><label>Your name</label><input name="name" required></div>
      <div class="f"><label>Email (login)</label><input name="email" type="email" required></div>
      <div class="f"><label>Password (min 8 characters)</label><input name="password" type="password" autocomplete="new-password" required></div>
      <div id="sm"></div><button class="btn gold" style="width:100%">Create admin</button></form></div>`;
    $('#sf').onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      try { await api('/setup', { method: 'POST', body: { name: f.name.value, email: f.email.value, password: f.password.value } });
        await api('/login', { method: 'POST', body: { email: f.email.value, password: f.password.value } }); boot(); }
      catch (er) { toast($('#sm'), er.message); }
    };
  }

  function shell() {
    const me = S.me;
    app.innerHTML = `<header class="top"><div class="in">
      <img class="logo" src="/assets/img/logo-vmsss.png" alt=""><div class="brand">Vivek Model Sr. Sec. School<small>${me.role === 'admin' ? 'ADMIN PANEL' : 'TEACHER PANEL'}</small></div>
      <div class="sp"></div><div class="who">${avatar(me)}<span>${esc(me.name)}</span></div>
      <button class="btn ghost sm" id="lo">Log out</button></div></header><main class="wrap" id="main"></main>`;
    $('#lo').onclick = async () => { await api('/logout', { method: 'POST' }).catch(() => {}); location.reload(); };
  }
  const main = () => $('#main');

  // ---------------- teacher ----------------
  async function teacherHome() {
    const me = S.me;
    main().innerHTML = `<div class="prof">
        <div class="prof-ph">${me.photo ? `<img src="${esc(me.photo)}" alt="${esc(me.name)}">` : `<span>${esc(initials(me.name))}</span>`}</div>
        <div class="prof-in">
          <span class="prof-tag">Class Teacher</span>
          <h1>${esc(me.name)}</h1>
          <div class="prof-grid">
            <div><small>Class</small><b>${esc(me.class_name || 'Not assigned')}</b></div>
            <div><small>Section</small><b>${esc(me.section || '–')}</b></div>
            <div><small>Designation</small><b>${esc(me.designation || 'Teacher')}</b></div>
            <div><small>Session</small><b>${esc(S.settings.session || '')}</b></div>
            <div><small>Phone</small><b>${me.phone ? `<a href="tel:${esc(me.phone)}">${esc(me.phone)}</a>` : '–'}</b></div>
            <div><small>Email</small><b>${esc(me.email)}</b></div>
          </div>
          ${me.signature ? `<div class="prof-sig"><img src="${esc(me.signature)}" alt="Signature"><small>Signature</small></div>` : '<div class="prof-sig none"><small>No signature added – ask the admin to upload it.</small></div>'}
        </div></div>
      ${!clsOf(me.class_name) ? '<div class="err">Your class is not set up yet. Please ask the admin to assign your class.</div>' : ''}
      <div class="panel"><div class="row" style="justify-content:space-between;margin-bottom:12px"><h3 style="margin:0">My report cards</h3>
      <div class="row"><input id="tq" class="mk" style="width:200px;text-align:left" placeholder="Search student…"><button class="btn gold" id="newc" ${clsOf(me.class_name) ? '' : 'disabled'}>+ New report card</button></div></div>
      <div class="tw" id="tl"><div class="empty">Loading…</div></div></div>`;
    $('#newc').onclick = () => editor(null);
    const load = async () => {
      const q = $('#tq').value.trim();
      const rows = await api('/cards' + (q ? '?q=' + encodeURIComponent(q) : ''));
      $('#tl').innerHTML = rows.length ? `<table class="lt"><thead><tr><th>Roll</th><th>Student</th><th>Admission No.</th><th>Father</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(r => `<tr>
        <td>${esc(r.roll_no)}</td><td><b>${esc(r.student_name)}</b></td><td>${esc(r.admission_no)}</td><td>${esc(r.father)}</td><td>${statusPill(r.status)}</td>
        <td class="row" style="justify-content:flex-end"><button class="btn sm" data-ed="${r.id}">${r.status === 'approved' ? 'View' : 'Open'}</button></td></tr>`).join('')}</tbody></table>`
        : '<div class="empty">No report cards yet. Click “+ New report card” to add your first student.</div>';
      $$('[data-ed]').forEach(b => b.onclick = () => editor(+b.dataset.ed));
    };
    let tmr; $('#tq').oninput = () => { clearTimeout(tmr); tmr = setTimeout(load, 300); };
    load();
  }
  function passwordForm() {
    $('#pw').onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      try { await api('/me/password', { method: 'POST', body: { current: f.current.value, password: f.password.value } }); f.reset(); toast($('#pwm'), 'Password updated', true); }
      catch (er) { toast($('#pwm'), er.message); }
    };
  }

  // ---------------- report card editor (teacher + admin) ----------------
  async function editor(id, back) {
    const isAdmin = S.me.role === 'admin';
    back = back || (isAdmin ? adminHome : teacherHome);
    let card;
    if (id) card = await api('/cards/' + id);
    else card = { class_name: S.me.class_name, section: S.me.section, session: S.settings.session, data: {}, status: 'draft', teacher_signature: S.me.signature };
    const cls = clsOf(card.class_name) || { name: card.class_name, subjects: Object.keys((card.data && card.data.t1) || {}), co: Object.keys((card.data && card.data.co) || {}) };
    const locked = !isAdmin && card.status === 'approved';
    const d = card.data = card.data || {};
    d.t1 = d.t1 || {}; d.t2 = d.t2 || {}; d.ov = d.ov || {}; d.co = d.co || {};
    const dis = locked ? 'disabled' : '';
    const info = [['student_name', 'Student name *'], ['roll_no', 'Roll number'], ['admission_no', 'Admission number'], ['dob', 'Date of birth', 'date'],
      ['father', 'Father’s name'], ['mother', 'Mother’s name'], ['mobile', 'Mobile number', 'tel'], ['attendance', 'Attendance % (whole session)', 'number']];
    const toInput = v => { // dd-mm-yyyy -> yyyy-mm-dd for date input
      const m = String(v || '').match(/^(\d{2})-(\d{2})-(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : (v || '');
    };
    const termTable = (t, cols, label) => `<div class="panel"><h3>${label}</h3><div class="tw"><table class="mt"><thead><tr><th style="text-align:left;padding-left:8px">Subject</th>
      ${cols.map(([, l, m]) => `<th>${l}<small>out of ${m}</small></th>`).join('')}<th>Total<small>auto · out of 100</small></th><th>Grade<small>auto</small></th></tr></thead><tbody>
      ${cls.subjects.map(s => `<tr><td class="s">${esc(s)}</td>${cols.map(([k, , m]) => `<td><input class="mk" data-t="${t}" data-s="${esc(s)}" data-k="${k}" data-max="${m}" inputmode="decimal" ${dis}></td>`).join('')}
      <td><input class="mk tot" data-t="${t}" data-s="${esc(s)}" data-k="tot" data-max="100" inputmode="decimal" title="Auto-calculated. Type to correct it; clear to go back to auto." ${dis}></td>
      <td><select class="mk gr" data-t="${t}" data-s="${esc(s)}" data-k="gr" ${dis}><option value="">Auto</option>${RC.GRADES.map(g => `<option>${g}</option>`).join('')}</select></td></tr>`).join('')}
      </tbody></table></div><div class="sumbar" id="sum-${t}"></div></div>`;
    main().innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:12px">
      <div><h1 class="pg">${id ? esc(card.student_name) : 'New report card'}</h1><p class="sub" style="margin:0">Class ${esc(card.class_name)}${card.section ? ' – ' + esc(card.section) : ''} · Session ${esc(card.session || S.settings.session)} ${id ? '· ' + statusPill(card.status) : ''}${card.teacher_name ? ' · Teacher: ' + esc(card.teacher_name) : ''}</p></div>
      <button class="btn" id="bk">← Back</button></div>
      ${locked ? '<div class="okmsg">This report card is approved by the admin and can no longer be edited.</div>' : ''}
      <div class="panel"><h3>Student details</h3><div class="grid">${info.map(([k, l, ty]) => `<div class="f"><label>${l}</label><input data-i="${k}" type="${ty || 'text'}" ${ty === 'number' ? 'min="0" max="100" step="0.1"' : ''} value="${esc(ty === 'date' ? toInput(card[k]) : (card[k] || ''))}" ${dis}></div>`).join('')}
      ${isAdmin ? `<div class="f"><label>Section</label><input data-i="section" value="${esc(card.section || '')}"></div>` : ''}</div></div>
      ${termTable('t1', RC.T1, 'Term I – Scholastic')}
      ${termTable('t2', RC.T2, 'Term II – Scholastic')}
      <div class="panel"><h3>Overall (50% Term I + 50% Term II)</h3><div class="tw"><table class="mt" style="min-width:420px"><thead><tr><th style="text-align:left;padding-left:8px">Subject</th><th>Overall<small>auto</small></th><th>Grade<small>auto</small></th></tr></thead><tbody>
      ${cls.subjects.map(s => `<tr><td class="s">${esc(s)}</td><td><input class="mk auto" data-ovs="${esc(s)}" readonly tabindex="-1"></td><td><select class="mk gr" data-t="ov" data-s="${esc(s)}" data-k="gr" ${dis}><option value="">Auto</option>${RC.GRADES.map(g => `<option>${g}</option>`).join('')}</select></td></tr>`).join('')}
      </tbody></table></div>
      <div class="legend"><span><i style="background:#eef3fb;border:1px solid #d5def0"></i>Auto-calculated</span><span><i style="background:#fff6dc;border:1px solid var(--gold)"></i>Corrected by hand</span><span><i style="background:var(--badbg);border:1px solid var(--bad)"></i>More than maximum marks</span><span>Use AB (absent), ML (medical leave) or LA (late admission) if needed.</span></div></div>
      <div class="panel"><h3>Co-scholastic area</h3><div class="tw"><table class="mt" style="min-width:420px"><thead><tr><th style="text-align:left;padding-left:8px">Activity</th><th>Term I</th><th>Term II</th></tr></thead><tbody>
      ${cls.co.map(n => `<tr><td class="s">${esc(n)}</td>${['t1', 't2'].map(t => `<td><select class="mk" data-co="${esc(n)}" data-ct="${t}" ${dis}><option value="">–</option>${RC.CO_GRADES.map(g => `<option>${g}</option>`).join('')}</select></td>`).join('')}</tr>`).join('')}
      </tbody></table></div><div class="legend">A – Outstanding · B – Very Good · C – Good · D – Needs Improvement</div></div>
      <div class="panel"><h3>Result</h3><div class="grid">
        <div class="f"><label>Percentage (auto)</label><input id="rp" class="mk auto" readonly tabindex="-1" style="text-align:left"></div>
        <div class="f"><label>Grade (auto)</label><input id="rg" class="mk auto" readonly tabindex="-1" style="text-align:left"></div>
        <div class="f"><label>Result</label><select id="rr" ${dis}><option value="">Auto</option><option>PASS</option><option>NEEDS IMPROVEMENT</option><option>DETAINED</option></select><div class="hint" id="rrh"></div></div>
        <div class="f"><label>Promoted to class</label><select id="prom" ${dis}><option value="">– Select –</option>${S.classes.map(c => `<option>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="f"><label>School reopens on</label><input value="${esc(S.settings.reopen)}" disabled></div></div>
        <div class="f" style="margin-top:12px"><label>Class teacher’s remark</label><textarea id="rem" rows="4" maxlength="400" placeholder="e.g. A sincere and hardworking student who participates actively in class…" ${dis}>${esc(d.remark || '')}</textarea><div class="hint"><span id="remc">0</span>/400</div></div></div>
      <div id="em"></div>
      <div class="actions">
        ${id && (isAdmin || card.status === 'draft') ? '<button class="btn danger" id="del">Delete</button>' : ''}
        <button class="btn" id="pv">👁 Preview report card</button>
        ${!locked ? '<button class="btn pri" id="sv">Save draft</button>' : ''}
        ${!isAdmin && !locked ? '<button class="btn gold" id="sb">Submit to admin</button>' : ''}
        ${isAdmin && id ? (card.status === 'approved' ? '<button class="btn" id="ro">Unlock for teacher</button>' : '<button class="btn ok" id="ap">✓ Approve</button>') : ''}
        ${isAdmin ? '<button class="btn gold" id="pdf">⬇ Download PDF</button>' : ''}
      </div>`;

    // fill values
    $$('[data-t][data-k]').forEach(el => { const v = ((d[el.dataset.t] || {})[el.dataset.s] || {})[el.dataset.k]; if (v != null) el.value = v; });
    $$('[data-co]').forEach(el => { el.value = ((d.co[el.dataset.co] || {})[el.dataset.ct]) || ''; });
    $('#rr').value = d.result || ''; $('#prom').value = d.promoted || '';
    const remc = () => $('#remc').textContent = $('#rem').value.length; remc(); $('#rem').oninput = remc;

    function collect() {
      const o = {};
      $$('[data-i]').forEach(el => {
        let v = el.value.trim();
        if (el.type === 'date' && v) { const [y, m, dd] = v.split('-'); v = `${dd}-${m}-${y}`; }
        o[el.dataset.i] = v;
      });
      const data = { t1: {}, t2: {}, ov: {}, co: {} };
      $$('[data-t][data-k]').forEach(el => {
        const v = el.value.trim(); if (v === '') return;
        if (el.classList.contains('tot') && el.dataset.ovr !== '1') return;
        (data[el.dataset.t][el.dataset.s] = data[el.dataset.t][el.dataset.s] || {})[el.dataset.k] = /^(ab|ml|la)$/i.test(v) ? v.toUpperCase() : v;
      });
      $$('[data-co]').forEach(el => { if (el.value) (data.co[el.dataset.co] = data.co[el.dataset.co] || {})[el.dataset.ct] = el.value; });
      data.result = $('#rr').value; data.promoted = $('#prom').value; data.remark = $('#rem').value.trim();
      return Object.assign({}, card, o, { data });
    }
    function refresh() {
      const c = collect(), r = RC.calc(c, cls);
      r.rows.forEach(row => {
        ['t1', 't2'].forEach(t => {
          const tot = $(`.tot[data-t="${t}"][data-s="${CSS.escape(row.s)}"]`), calcV = t === 't1' ? row.t1c : row.t2c;
          if (document.activeElement !== tot && tot.dataset.ovr !== '1') tot.value = calcV == null ? '' : RC.fmt(calcV);
          tot.classList.toggle('ovr', tot.dataset.ovr === '1'); tot.classList.toggle('auto', tot.dataset.ovr !== '1');
          const gr = $(`.gr[data-t="${t}"][data-s="${CSS.escape(row.s)}"]`), gc = t === 't1' ? row.g1c : row.g2c;
          gr.options[0].textContent = gc ? 'Auto · ' + gc : 'Auto';
          gr.classList.toggle('ovr', !!gr.value); gr.classList.toggle('auto', !gr.value);
        });
        $(`[data-ovs="${CSS.escape(row.s)}"]`).value = RC.fmt(row.ov);
        const go = $(`.gr[data-t="ov"][data-s="${CSS.escape(row.s)}"]`); go.options[0].textContent = row.goc ? 'Auto · ' + row.goc : 'Auto';
        go.classList.toggle('ovr', !!go.value); go.classList.toggle('auto', !go.value);
      });
      $$('.mk[data-max]').forEach(el => {
        const v = el.value.trim(), n = Number(v);
        el.classList.toggle('bad', v !== '' && !/^(ab|ml|la)$/i.test(v) && (isNaN(n) || n < 0 || n > +el.dataset.max));
      });
      const pct = v => v == null ? '–' : v.toFixed(1) + '%';
      $('#sum-t1').innerHTML = `<div>Term I total<b>${r.t1Any ? RC.fmt(r.t1) + ' / ' + r.max : '–'}</b></div><div>Term I %<b>${pct(r.p1)}</b></div><div>Term I grade<b>${r.g1 || '–'}</b></div>`;
      $('#sum-t2').innerHTML = `<div>Term II total<b>${r.t2Any ? RC.fmt(r.t2) + ' / ' + r.max : '–'}</b></div><div>Term II %<b>${pct(r.p2)}</b></div><div>Term II grade<b>${r.g2 || '–'}</b></div>`;
      $('#rp').value = pct(r.finalP); $('#rg').value = r.finalG || '–';
      $('#rr').options[0].textContent = r.resultCalc ? 'Auto · ' + r.resultCalc : 'Auto';
      $('#rrh').textContent = r.po == null ? 'Final result uses the overall marks once both terms are filled.' : '';
    }
    // totals: mark as override when typed
    $$('.tot').forEach(el => {
      const raw = ((d[el.dataset.t] || {})[el.dataset.s] || {}).tot;
      if (raw != null && raw !== '') el.dataset.ovr = '1';
      el.addEventListener('input', () => { el.dataset.ovr = el.value.trim() === '' ? '' : '1'; refresh(); });
      el.addEventListener('blur', refresh);
    });
    main().addEventListener('input', e => { if (!e.target.classList.contains('tot')) refresh(); });
    main().addEventListener('change', refresh);
    refresh();

    function payload(extra) {
      const c = collect();
      // drop auto totals (only keep hand-corrected ones)
      $$('.tot').forEach(el => { const t = c.data[el.dataset.t][el.dataset.s]; if (t && el.dataset.ovr !== '1') delete t.tot; });
      return Object.assign({ student_name: c.student_name, roll_no: c.roll_no, admission_no: c.admission_no, dob: c.dob, father: c.father, mother: c.mother, mobile: c.mobile, attendance: c.attendance, section: c.section, data: c.data }, extra || {});
    }
    function validate() {
      const c = collect();
      if (!c.student_name) return 'Please enter the student name.';
      if (c.attendance && (isNaN(+c.attendance) || +c.attendance < 0 || +c.attendance > 100)) return 'Attendance must be a percentage between 0 and 100.';
      if ($$('.mk.bad').length) return 'Some marks are more than the maximum (shown in red). Please correct them.';
      return '';
    }
    async function save(extra) {
      const v = validate(); if (v) { toast($('#em'), v); $('#em').scrollIntoView({ block: 'center' }); return null; }
      try {
        if (id) await api('/cards/' + id, { method: 'PUT', body: payload(extra) });
        else { const r = await api('/cards', { method: 'POST', body: payload(extra) }); id = r.id; card.id = id; }
        return true;
      } catch (er) { toast($('#em'), er.message); return null; }
    }
    $('#bk').onclick = () => back();
    if ($('#sv')) $('#sv').onclick = async () => { if (await save()) { toast($('#em'), 'Saved ✓', true); } };
    $('#pv').onclick = () => preview(Object.assign(collect(), { teacher_signature: card.teacher_signature }), cls, async () => {
      if (!isAdmin && !locked) { if (await save({ submit: true })) { closeModal(); alert('Report card submitted to the admin.'); back(); } }
    }, !isAdmin && !locked);
    if ($('#sb')) $('#sb').onclick = () => $('#pv').click();
    if ($('#ap')) $('#ap').onclick = async () => { if (await save()) { await api(`/cards/${id}/approve`, { method: 'POST' }); editor(id, back); } };
    if ($('#ro')) $('#ro').onclick = async () => { await api(`/cards/${id}/reopen`, { method: 'POST' }); editor(id, back); };
    if ($('#pdf')) $('#pdf').onclick = async () => { const ok = card.status === 'approved' || await save(); if (ok) downloadPdf([Object.assign(collect(), { teacher_signature: card.teacher_signature })], cls); };
    if ($('#del')) $('#del').onclick = async () => { if (confirm('Delete this report card permanently?')) { await api('/cards/' + id, { method: 'DELETE' }); back(); } };
  }

  // ---------------- preview / pdf ----------------
  let modalEl = null;
  function closeModal() { if (modalEl) { modalEl.remove(); modalEl = null; document.body.style.overflow = ''; } }
  function modal(html, wide) {
    closeModal();
    modalEl = document.createElement('div'); modalEl.className = 'modal';
    modalEl.innerHTML = `<div class="mbox ${wide ? 'wide' : ''}">${html}</div>`;
    modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModal(); });
    document.body.appendChild(modalEl); document.body.style.overflow = 'hidden';
    return modalEl;
  }
  function preview(card, cls, onSubmit, canSubmit) {
    const m = modal(`<div class="mh"><h2>Report card preview</h2>${canSubmit ? '<button class="btn gold" id="psb">Looks good – Submit</button>' : ''}<button class="btn" id="pcl">Close</button></div>
      <div class="prev-wrap"><div class="prev-scale">${RC.render(card, cls, S.settings)}</div></div>`, true);
    const fit = () => { const w = Math.min(860, m.querySelector('.mbox').clientWidth - 36); const k = Math.min(1, w / 794); const ps = m.querySelector('.prev-scale'); ps.style.transform = `scale(${k})`; ps.parentElement.style.height = (1123 * k) + 'px'; };
    fit(); window.addEventListener('resize', fit, { once: true });
    $('#pcl', m).onclick = closeModal;
    if (canSubmit) $('#psb', m).onclick = onSubmit;
  }
  let libs = null;
  function loadLibs() {
    if (libs) return libs;
    const load = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load the PDF tool. Please refresh and try again.')); document.head.appendChild(s); });
    libs = load('/portal/vendor/html2canvas.min.js').then(() => load('/portal/vendor/jspdf.umd.min.js'));
    return libs;
  }
  async function downloadPdf(cards, clsFor, name) {
    const m = modal(`<div class="mh"><h2>Preparing PDF…</h2></div><p id="pp">Please wait.</p>`);
    try {
      await loadLibs(); await document.fonts.ready;
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px'; document.body.appendChild(host);
      for (let i = 0; i < cards.length; i++) {
        $('#pp', m).textContent = `Creating page ${i + 1} of ${cards.length}…`;
        const c = cards[i]; const cls = typeof clsFor === 'function' ? clsFor(c) : clsFor;
        host.innerHTML = RC.render(c, cls, S.settings);
        await Promise.all($$('img', host).map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
        const canvas = await html2canvas(host.firstElementChild, { scale: 3, backgroundColor: '#ffffff', useCORS: true, logging: false });
        if (i) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      }
      host.remove();
      const fn = name || `Report Card - ${cards[0].student_name || 'student'} - ${cards[0].class_name || ''}.pdf`;
      pdf.save(fn.replace(/[\\/:*?"<>|]+/g, ' '));
      closeModal();
    } catch (e) { $('#pp', m).innerHTML = `<div class="err">${esc(e.message)}</div><button class="btn" onclick="this.closest('.modal').remove();document.body.style.overflow=''">Close</button>`; }
  }

  // ---------------- admin ----------------
  let adminTab = 'cards';
  async function adminHome() {
    S.teachers = await api('/teachers');
    main().innerHTML = `<h1 class="pg">Admin panel</h1><p class="sub">Session ${esc(S.settings.session)} · ${S.teachers.length} teacher(s)</p>
      <div class="tabs">${[['cards', 'Report cards'], ['teachers', 'Teachers'], ['classes', 'Classes & subjects'], ['settings', 'Settings']].map(([k, l]) => `<button class="tab ${adminTab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div id="tabc"></div>`;
    $$('[data-tab]').forEach(b => b.onclick = () => { adminTab = b.dataset.tab; adminHome(); });
    ({ cards: adminCards, teachers: adminTeachers, classes: adminClasses, settings: adminSettings })[adminTab]();
  }

  async function adminCards() {
    $('#tabc').innerHTML = `<div class="panel"><div class="row" style="margin-bottom:12px">
      <select id="fc" class="mk" style="width:auto;min-width:150px"><option value="">All classes</option>${S.classes.map(c => `<option>${esc(c.name)}</option>`).join('')}</select>
      <select id="ft" class="mk" style="width:auto;min-width:160px"><option value="">All teachers</option>${S.teachers.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
      <select id="fs" class="mk" style="width:auto"><option value="">Submitted + approved</option><option value="submitted">Waiting for approval</option><option value="approved">Approved</option><option value="draft">Drafts (not submitted)</option></select>
      <input id="fq" class="mk" style="flex:1;min-width:220px;text-align:left" placeholder="Search by student, mobile, father or mother name…">
      <button class="btn gold" id="bulk" disabled>⬇ Download all shown (PDF)</button></div>
      <div class="tw" id="al"><div class="empty">Loading…</div></div></div>`;
    let rows = [];
    const load = async () => {
      const qs = new URLSearchParams();
      if ($('#fc').value) qs.set('class', $('#fc').value);
      if ($('#ft').value) qs.set('teacher', $('#ft').value);
      if ($('#fs').value) qs.set('status', $('#fs').value);
      if ($('#fq').value.trim()) qs.set('q', $('#fq').value.trim());
      rows = await api('/cards?' + qs);
      $('#bulk').disabled = !rows.length;
      $('#al').innerHTML = rows.length ? `<table class="lt"><thead><tr><th>Class</th><th>Roll</th><th>Student</th><th>Father</th><th>Mother</th><th>Mobile</th><th>Teacher</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(r => `<tr>
        <td>${esc(r.class_name)}${r.section ? ' – ' + esc(r.section) : ''}</td><td>${esc(r.roll_no)}</td><td><b>${esc(r.student_name)}</b><br><small style="color:var(--muted)">${esc(r.admission_no)}</small></td>
        <td>${esc(r.father)}</td><td>${esc(r.mother)}</td><td>${esc(r.mobile)}</td><td>${esc(r.teacher_name || '–')}</td><td>${statusPill(r.status)}</td>
        <td><div class="row" style="justify-content:flex-end;flex-wrap:nowrap"><button class="btn sm" data-ed="${r.id}">Open</button><button class="btn sm gold" data-pdf="${r.id}" title="Download PDF">PDF</button></div></td></tr>`).join('')}</tbody></table>`
        : '<div class="empty">No report cards match these filters.</div>';
      $$('[data-ed]').forEach(b => b.onclick = () => editor(+b.dataset.ed, adminHome));
      $$('[data-pdf]').forEach(b => b.onclick = async () => { const c = await api('/cards/' + b.dataset.pdf); downloadPdf([c], clsOf(c.class_name) || fallbackCls(c)); });
    };
    ['fc', 'ft', 'fs'].forEach(i => $('#' + i).onchange = load);
    let tmr; $('#fq').oninput = () => { clearTimeout(tmr); tmr = setTimeout(load, 300); };
    $('#bulk').onclick = async () => {
      if (rows.length > 60 && !confirm(`Create one PDF with ${rows.length} report cards? This can take a minute.`)) return;
      const full = []; for (const r of rows) full.push(await api('/cards/' + r.id));
      downloadPdf(full, c => clsOf(c.class_name) || fallbackCls(c), `Report Cards - ${$('#fc').value || 'All'}.pdf`);
    };
    load();
  }
  const fallbackCls = c => ({ name: c.class_name, subjects: Object.keys((c.data && c.data.t1) || {}), co: Object.keys((c.data && c.data.co) || {}) });

  function adminTeachers() {
    $('#tabc').innerHTML = `<div class="panel"><div class="row" style="justify-content:space-between;margin-bottom:12px"><h3 style="margin:0">Teachers</h3><button class="btn gold" id="addt">+ Add teacher</button></div>
      <div class="tw">${S.teachers.length ? `<table class="lt"><thead><tr><th>Teacher</th><th>Login email</th><th>Class</th><th>Phone</th><th>Report cards</th><th>Status</th><th></th></tr></thead><tbody>${S.teachers.map(t => `<tr>
      <td><div class="tch">${avatar(t)}<div><b>${esc(t.name)}</b><br><small style="color:var(--muted)">${esc(t.designation || '')}</small></div></div></td>
      <td>${esc(t.email)}</td><td>${esc(t.class_name || '–')}${t.section ? ' – ' + esc(t.section) : ''}</td><td>${esc(t.phone)}</td><td>${t.cards}</td>
      <td>${t.active ? '<span class="st approved">Active</span>' : '<span class="st draft">Disabled</span>'}</td>
      <td><div class="row" style="justify-content:flex-end;flex-wrap:nowrap"><button class="btn sm" data-et="${t.id}">Edit</button><button class="btn sm danger" data-dt="${t.id}">Remove</button></div></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No teachers yet. Click “+ Add teacher”.</div>'}</div></div>`;
    $('#addt').onclick = () => teacherForm(null);
    $$('[data-et]').forEach(b => b.onclick = () => teacherForm(S.teachers.find(t => t.id === +b.dataset.et)));
    $$('[data-dt]').forEach(b => b.onclick = async () => {
      const t = S.teachers.find(x => x.id === +b.dataset.dt);
      if (!confirm(`Remove ${t.name} from the portal? Their report cards will stay saved.`)) return;
      await api('/teachers/' + t.id, { method: 'DELETE' }); adminHome();
    });
  }
  function teacherForm(t) {
    const isNew = !t; t = t || { active: 1 };
    const m = modal(`<div class="mh"><h2>${isNew ? 'Add teacher' : 'Edit teacher'}</h2><button class="btn" id="tcl">Close</button></div>
      <form id="tf" novalidate><div class="grid">
      <div class="f"><label>Full name *</label><input name="name" value="${esc(t.name || '')}"></div>
      <div class="f"><label>Login email *</label><input name="email" type="email" value="${esc(t.email || '')}"><div class="hint">The teacher logs in with a code sent to this email.</div></div>
      <div class="f"><label>Phone</label><input name="phone" type="tel" value="${esc(t.phone || '')}"></div>
      <div class="f"><label>Class *</label><select name="class_name"><option value="">– Select –</option>${S.classes.map(c => `<option ${c.name === t.class_name ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="f"><label>Section</label><input name="section" value="${esc(t.section || '')}" placeholder="A"></div>
      <div class="f"><label>Designation / subject</label><input name="designation" value="${esc(t.designation || '')}" placeholder="Class Teacher · Maths"></div>
      ${!isNew ? `<div class="f"><label>Status</label><select name="active"><option value="1" ${t.active ? 'selected' : ''}>Active</option><option value="0" ${!t.active ? 'selected' : ''}>Disabled (cannot log in)</option></select></div>` : ''}
      </div><div class="grid" style="margin-top:12px">
      <div class="f"><label>Photo</label><div class="imgup"><img id="pimg" src="${esc(t.photo || '/assets/img/favicon-32.png')}" alt=""><input type="file" accept="image/*" id="pfile"></div></div>
      <div class="f"><label>Signature (shown on report card)</label><div class="imgup sig"><img id="simg" src="${esc(t.signature || '')}" alt=""><input type="file" accept="image/*" id="sfile"></div><div class="hint">Sign on white paper, take a photo, crop it.</div></div></div>
      <div id="tm"></div><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn pri">${isNew ? 'Add teacher' : 'Save changes'}</button></div></form>`);
    let photo = t.photo || '', signature = t.signature || '';
    $('#tcl', m).onclick = closeModal;
    $('#pfile', m).onchange = async e => { try { photo = await readImage(e.target.files[0], 320); $('#pimg', m).src = photo; } catch (er) { toast($('#tm', m), er.message); } };
    $('#sfile', m).onchange = async e => { try { signature = await readImage(e.target.files[0], 420); $('#simg', m).src = signature; } catch (er) { toast($('#tm', m), er.message); } };
    $('#tf', m).onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      if (!f.class_name.value) return toast($('#tm', m), 'Please choose the class for this teacher.');
      const body = { name: f.name.value, email: f.email.value, phone: f.phone.value, class_name: f.class_name.value, section: f.section.value, designation: f.designation.value, photo, signature };
      if (!isNew) body.active = f.active.value === '1';
      try { await api(isNew ? '/teachers' : '/teachers/' + t.id, { method: isNew ? 'POST' : 'PUT', body }); closeModal(); adminHome(); }
      catch (er) { toast($('#tm', m), er.message); }
    };
  }

  function adminClasses() {
    const list = JSON.parse(JSON.stringify(S.classes));
    const draw = () => {
      $('#tabc').innerHTML = `<div class="panel"><div class="row" style="justify-content:space-between;margin-bottom:6px"><h3 style="margin:0">Classes &amp; subjects</h3><div class="row"><button class="btn" id="addc">+ Add class</button><button class="btn pri" id="savec">Save all</button></div></div>
        <p class="sub">Each class has its own subjects and co-scholastic activities. Teachers see exactly these on their report card form.</p><div id="cm"></div>
        ${list.map((c, i) => `<div class="clsrow"><div class="row" style="margin-bottom:8px"><div class="f" style="flex:1;min-width:160px"><label>Class name</label><input data-cn="${i}" value="${esc(c.name)}"></div><button class="btn sm danger" data-rc="${i}" style="align-self:end">Remove class</button></div>
        ${['subjects', 'co'].map(k => `<div class="f" style="margin-top:6px"><label>${k === 'subjects' ? 'Subjects' : 'Co-scholastic activities'}</label><div class="chips">${c[k].map((s, j) => `<span class="chip">${esc(s)}<button type="button" data-x="${i}|${k}|${j}" aria-label="Remove">×</button></span>`).join('')}
        <input class="mk" style="width:170px;text-align:left" placeholder="+ add & press Enter" data-add="${i}|${k}"></div></div>`).join('')}</div>`).join('')}</div>`;
      $$('[data-cn]').forEach(el => el.oninput = () => list[+el.dataset.cn].name = el.value);
      $$('[data-rc]').forEach(b => b.onclick = () => { if (confirm('Remove this class?')) { list.splice(+b.dataset.rc, 1); draw(); } });
      $$('[data-x]').forEach(b => b.onclick = () => { const [i, k, j] = b.dataset.x.split('|'); list[+i][k].splice(+j, 1); draw(); });
      $$('[data-add]').forEach(el => el.onkeydown = e => { if (e.key === 'Enter' && el.value.trim()) { e.preventDefault(); const [i, k] = el.dataset.add.split('|'); list[+i][k].push(el.value.trim()); draw(); $(`[data-add="${i}|${k}"]`).focus(); } });
      $('#addc').onclick = () => { list.push({ name: 'New class', subjects: [], co: [...(list[0] ? list[0].co : [])] }); draw(); };
      $('#savec').onclick = async () => {
        try { await api('/classes', { method: 'PUT', body: { classes: list } }); const b = await api('/bootstrap'); S.classes = b.classes; toast($('#cm'), 'Saved ✓', true); }
        catch (er) { toast($('#cm'), er.message); }
      };
    };
    draw();
  }

  function adminSettings() {
    const st = S.settings;
    $('#tabc').innerHTML = `<div class="panel"><h3>Report card settings</h3><form id="sf" class="grid" novalidate>
      <div class="f"><label>Session</label><input name="session" value="${esc(st.session)}"></div>
      <div class="f"><label>School reopens on</label><input name="reopen" value="${esc(st.reopen)}" placeholder="01-04-2027"></div>
      <div class="f"><label>Principal name</label><input name="principal_name" value="${esc(st.principal_name)}"></div>
      <div class="f"><label>Principal signature</label><div class="imgup sig"><img id="psig" src="${esc(st.principal_signature || '')}" alt=""><input type="file" accept="image/*" id="psf"></div></div>
      <div class="f" style="align-self:end"><button class="btn pri">Save settings</button></div></form><div id="stm"></div></div>
      <div class="panel"><h3>Change my password</h3><form id="pw" class="grid" novalidate>
      <div class="f"><label>Current password</label><input name="current" type="password"></div><div class="f"><label>New password (min 8)</label><input name="password" type="password"></div>
      <div class="f" style="align-self:end"><button class="btn pri">Update password</button></div></form><div id="pwm"></div></div>`;
    let sig = st.principal_signature || '';
    $('#psf').onchange = async e => { try { sig = await readImage(e.target.files[0], 420); $('#psig').src = sig; } catch (er) { toast($('#stm'), er.message); } };
    $('#sf').onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      try { await api('/settings', { method: 'PUT', body: { session: f.session.value, reopen: f.reopen.value, principal_name: f.principal_name.value, principal_signature: sig } });
        const b = await api('/bootstrap'); S.settings = b.settings; toast($('#stm'), 'Saved ✓', true); }
      catch (er) { toast($('#stm'), er.message); }
    };
    passwordForm();
  }

  boot();
})();
