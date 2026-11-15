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
  const ckey = x => x.c + '|' + (x.s || '');
  const clabel = x => 'Class ' + x.c + (x.s ? ' – ' + x.s : '');
  function curClass() {
    const list = S.me.classes || [];
    let k = ''; try { k = localStorage.getItem('vm_cls_' + S.me.id) || ''; } catch (e) {}
    return list.find(x => ckey(x) === k) || list[0] || null;
  }
  function setClass(x) { try { localStorage.setItem('vm_cls_' + S.me.id, ckey(x)); } catch (e) {} }
  async function teacherHome() {
    const me = S.me, list = me.classes || [], cur = curClass();
    main().innerHTML = `<div class="prof">
        <div class="prof-ph">${me.photo ? `<img src="${esc(me.photo)}" alt="${esc(me.name)}">` : `<span>${esc(initials(me.name))}</span>`}</div>
        <div class="prof-in">
          <span class="prof-tag">${list.length > 1 ? 'Teacher · ' + list.length + ' classes' : 'Class Teacher'}</span>
          <h1>${esc(me.name)}</h1>
          <div class="prof-grid">
            <div><small>${list.length > 1 ? 'Classes' : 'Class'}</small><b>${list.length ? list.map(x => esc(x.c + (x.s ? ' – ' + x.s : ''))).join(', ') : 'Not assigned'}</b></div>
            <div><small>Designation</small><b>${esc(me.designation || 'Teacher')}</b></div>
            <div><small>Session</small><b>${esc(S.settings.session || '')}</b></div>
            <div><small>Phone</small><b>${me.phone ? `<a href="tel:${esc(me.phone)}">${esc(me.phone)}</a>` : '–'}</b></div>
            <div style="grid-column:span 2"><small>Email</small><b>${esc(me.email)}</b></div>
          </div>
          ${me.signature ? `<div class="prof-sig"><img src="${esc(me.signature)}" alt="Signature"><small>Signature</small></div>` : '<div class="prof-sig none"><small>No signature added – ask the admin to upload it.</small></div>'}
        </div></div>
      ${!list.length ? '<div class="err">No class is assigned to you yet. Please ask the admin to assign your class.</div>' : ''}
      ${list.length > 1 ? `<h3 style="margin:4px 0 8px">Choose the class you want to work on</h3><div class="cpick">${list.map(x => `<button data-k="${esc(ckey(x))}" class="${cur && ckey(cur) === ckey(x) ? 'on' : ''}"><b>${esc(clabel(x))}</b><small>${clsOf(x.c) ? (clsOf(x.c).subjects.length + ' subjects') : 'Format not set up yet'}</small></button>`).join('')}</div>` : ''}
      ${cur && !clsOf(cur.c) ? `<div class="err">The report card format for Class ${esc(cur.c)} is not set up yet. Please ask the admin.</div>` : ''}
      <div class="panel"><div class="row" style="justify-content:space-between;margin-bottom:12px"><h3 style="margin:0">${cur ? esc(clabel(cur)) + ' · report cards' : 'My report cards'}</h3>
      <button class="btn gold" id="newc" ${cur && clsOf(cur.c) ? '' : 'disabled'}>+ New report card</button></div>
      <div class="srch"><input id="tq" class="mk" placeholder="Search by student name, mobile, email, admission no. or roll no.">
      <select id="tst" class="mk" style="width:auto"><option value="">All report cards</option><option value="draft">Drafts</option><option value="submitted">Sent to admin</option><option value="approved">Approved</option></select></div>
      <div class="tw" id="tl"><div class="empty">Loading…</div></div></div>`;
    $$('.cpick button').forEach(b => b.onclick = () => { setClass(list.find(x => ckey(x) === b.dataset.k)); teacherHome(); });
    $('#newc').onclick = () => editor(null);
    const load = async () => {
      if (!cur) { $('#tl').innerHTML = ''; return; }
      const qs = new URLSearchParams({ class: cur.c, section: cur.s || '' });
      if ($('#tq').value.trim()) qs.set('q', $('#tq').value.trim());
      if ($('#tst').value) qs.set('status', $('#tst').value);
      const rows = await api('/cards?' + qs);
      const filtered = $('#tq').value.trim() || $('#tst').value;
      $('#tl').innerHTML = rows.length ? `<table class="lt"><thead><tr><th>Roll</th><th>Student</th><th>Admission No.</th><th>Mobile</th><th>Email</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(r => `<tr>
        <td>${esc(r.roll_no)}</td><td><b>${esc(r.student_name)}</b><br><small style="color:var(--muted)">${esc(r.father ? 'F: ' + r.father : '')}</small></td><td>${esc(r.admission_no)}</td><td>${esc(r.mobile)}</td><td>${esc(r.email)}</td><td>${statusPill(r.status)}</td>
        <td class="row" style="justify-content:flex-end"><button class="btn sm" data-ed="${r.id}">${r.status === 'approved' ? 'View' : 'Open'}</button></td></tr>`).join('')}</tbody></table>`
        : `<div class="empty">${filtered ? 'No report cards match your search.' : 'No report cards yet. Click “+ New report card” to add your first student.'}</div>`;
      $$('[data-ed]').forEach(b => b.onclick = () => editor(+b.dataset.ed));
    };
    let tmr; $('#tq').oninput = () => { clearTimeout(tmr); tmr = setTimeout(load, 300); };
    $('#tst').onchange = load;
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
    else { const cur = curClass() || {}; card = { class_name: cur.c, section: cur.s, session: S.settings.session, data: {}, status: 'draft', teacher_signature: S.me.signature }; }
    const cls = clsOf(card.class_name) || fallbackCls(card);
    const F = RC.formatOf(cls), multi = F.terms.length > 1, GR = F.scale.map(x => x[1]);
    const locked = !isAdmin && card.status === 'approved';
    const d = card.data = card.data || {};
    F.terms.forEach(t => { d[t.k] = d[t.k] || {}; }); d.ov = d.ov || {}; d.co = d.co || {};
    const dis = locked ? 'disabled' : '';
    const info = [['student_name', 'Student name *'], ['roll_no', 'Roll number'], ['admission_no', 'Admission number'], ['dob', 'Date of birth', 'date'],
      ['father', 'Father’s name'], ['mother', 'Mother’s name'], ['mobile', 'Mobile number', 'tel'], ['email', 'Email (parent / student)', 'email'], ['attendance', 'Attendance % (whole session)', 'number']];
    const toInput = v => { // dd-mm-yyyy -> yyyy-mm-dd for date input
      const m = String(v || '').match(/^(\d{2})-(\d{2})-(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : (v || '');
    };
    const grOpts = () => `<option value="">Auto</option>${GR.map(g => `<option>${esc(g)}</option>`).join('')}`;
    const termTable = t => `<div class="panel"><h3>${esc(t.n)} – Scholastic</h3><div class="tw"><table class="mt"><thead><tr><th style="text-align:left;padding-left:8px">Subject</th>
      ${t.cols.map(c => `<th>${esc(c.l)}<small>out of ${c.m}</small></th>`).join('')}<th>Total<small>auto · out of ${t.max}</small></th><th>Grade<small>auto</small></th></tr></thead><tbody>
      ${cls.subjects.map(s => `<tr><td class="s">${esc(s)}</td>${t.cols.map(c => `<td><input class="mk" data-t="${t.k}" data-s="${esc(s)}" data-k="${c.k}" data-max="${c.m}" inputmode="decimal" ${dis}></td>`).join('')}
      <td><input class="mk tot" data-t="${t.k}" data-s="${esc(s)}" data-k="tot" data-max="${t.max}" inputmode="decimal" title="Auto-calculated. Type to correct it; clear to go back to auto." ${dis}></td>
      <td><select class="mk gr" data-t="${t.k}" data-s="${esc(s)}" data-k="gr" ${dis}>${grOpts()}</select></td></tr>`).join('')}
      </tbody></table></div><div class="sumbar" id="sum-${t.k}"></div></div>`;
    main().innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:12px">
      <div><h1 class="pg">${id ? esc(card.student_name) : 'New report card'}</h1><p class="sub" style="margin:0">Class ${esc(card.class_name)}${card.section ? ' – ' + esc(card.section) : ''} · Session ${esc(card.session || S.settings.session)} ${id ? '· ' + statusPill(card.status) : ''}${card.teacher_name ? ' · Teacher: ' + esc(card.teacher_name) : ''}</p></div>
      <button class="btn" id="bk">← Back</button></div>
      ${locked ? '<div class="okmsg">This report card is approved by the admin and can no longer be edited.</div>' : ''}
      <div class="panel"><h3>Student details</h3><div class="grid">${info.map(([k, l, ty]) => `<div class="f"><label>${l}</label><input data-i="${k}" type="${ty || 'text'}" ${ty === 'number' ? 'min="0" max="100" step="0.1"' : ''} value="${esc(ty === 'date' ? toInput(card[k]) : (card[k] || ''))}" ${dis}></div>`).join('')}
      ${isAdmin ? `<div class="f"><label>Section</label><input data-i="section" value="${esc(card.section || '')}"></div>` : ''}</div></div>
      ${F.terms.map(termTable).join('')}
      ${multi ? `<div class="panel"><h3>Overall (average of ${F.terms.map(t => esc(t.n)).join(' + ')})</h3><div class="tw"><table class="mt" style="min-width:420px"><thead><tr><th style="text-align:left;padding-left:8px">Subject</th><th>Overall %<small>auto</small></th><th>Grade<small>auto</small></th></tr></thead><tbody>
      ${cls.subjects.map(s => `<tr><td class="s">${esc(s)}</td><td><input class="mk auto" data-ovs="${esc(s)}" readonly tabindex="-1"></td><td><select class="mk gr" data-t="ov" data-s="${esc(s)}" data-k="gr" ${dis}>${grOpts()}</select></td></tr>`).join('')}
      </tbody></table></div></div>` : ''}
      <div class="panel" style="padding-top:10px"><div class="legend"><span><i style="background:#eef3fb;border:1px solid #d5def0"></i>Auto-calculated</span><span><i style="background:#fff6dc;border:1px solid var(--gold)"></i>Corrected by hand</span><span><i style="background:var(--badbg);border:1px solid var(--bad)"></i>More than maximum marks</span><span>Use AB (absent), ML (medical leave) or LA (late admission) if needed.</span></div></div>
      ${cls.co.length ? `<div class="panel"><h3>Co-scholastic area</h3><div class="tw"><table class="mt" style="min-width:420px"><thead><tr><th style="text-align:left;padding-left:8px">Activity</th>${F.terms.map(t => `<th>${esc(t.n)}</th>`).join('')}</tr></thead><tbody>
      ${cls.co.map(n => `<tr><td class="s">${esc(n)}</td>${F.terms.map(t => `<td><select class="mk" data-co="${esc(n)}" data-ct="${t.k}" ${dis}><option value="">–</option>${F.co.map(([g]) => `<option>${esc(g)}</option>`).join('')}</select></td>`).join('')}</tr>`).join('')}
      </tbody></table></div><div class="legend">${F.co.map(([g, m]) => `${esc(g)} – ${esc(m)}`).join(' · ')}</div></div>` : ''}
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
      const data = { ov: {}, co: {} }; F.terms.forEach(t => { data[t.k] = {}; });
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
        F.terms.forEach(t => {
          const x = row.t[t.k];
          const tot = $(`.tot[data-t="${t.k}"][data-s="${CSS.escape(row.s)}"]`);
          if (document.activeElement !== tot && tot.dataset.ovr !== '1') tot.value = x.totc == null ? '' : RC.fmt(x.totc);
          tot.classList.toggle('ovr', tot.dataset.ovr === '1'); tot.classList.toggle('auto', tot.dataset.ovr !== '1');
          const gr = $(`.gr[data-t="${t.k}"][data-s="${CSS.escape(row.s)}"]`);
          gr.options[0].textContent = x.gc ? 'Auto · ' + x.gc : 'Auto';
          gr.classList.toggle('ovr', !!gr.value); gr.classList.toggle('auto', !gr.value);
        });
        if (multi) {
          $(`[data-ovs="${CSS.escape(row.s)}"]`).value = row.ov == null ? '' : RC.fmt(row.ov) + '%';
          const go = $(`.gr[data-t="ov"][data-s="${CSS.escape(row.s)}"]`); go.options[0].textContent = row.goc ? 'Auto · ' + row.goc : 'Auto';
          go.classList.toggle('ovr', !!go.value); go.classList.toggle('auto', !go.value);
        }
      });
      $$('.mk[data-max]').forEach(el => {
        const v = el.value.trim(), n = Number(v);
        el.classList.toggle('bad', v !== '' && !/^(ab|ml|la)$/i.test(v) && (isNaN(n) || n < 0 || n > +el.dataset.max));
      });
      const pct = v => v == null ? '–' : v.toFixed(1) + '%';
      F.terms.forEach(t => {
        const T = r.term[t.k];
        $('#sum-' + t.k).innerHTML = `<div>${esc(t.n)} total<b>${T.any ? RC.fmt(T.sum) + ' / ' + T.max : '–'}</b></div><div>${esc(t.n)} %<b>${pct(T.p)}</b></div><div>${esc(t.n)} grade<b>${T.g || '–'}</b></div>`;
      });
      $('#rp').value = pct(r.finalP); $('#rg').value = r.finalG || '–';
      $('#rr').options[0].textContent = r.resultCalc ? 'Auto · ' + r.resultCalc : 'Auto';
      $('#rrh').textContent = multi && r.po == null ? 'Final result uses the overall marks once all terms are filled.' : '';
    }
    // totals: mark as override when typed
    $$('.tot').forEach(el => {
      const raw = ((d[el.dataset.t] || {})[el.dataset.s] || {}).tot;
      if (raw != null && raw !== '') el.dataset.ovr = '1';
      el.addEventListener('input', () => { el.dataset.ovr = el.value.trim() === '' ? '' : '1'; refresh(); });
      el.addEventListener('blur', refresh);
    });
    // listeners live on #main, which outlives this form: remove them once the form is gone
    const root = main();
    const onIn = e => { if (!$('#rp')) return off(); if (!e.target.classList.contains('tot')) refresh(); };
    const onCh = () => { if (!$('#rp')) return off(); refresh(); };
    const off = () => { root.removeEventListener('input', onIn); root.removeEventListener('change', onCh); };
    root.addEventListener('input', onIn); root.addEventListener('change', onCh);
    refresh();

    function payload(extra) {
      const c = collect();
      // drop auto totals (only keep hand-corrected ones)
      $$('.tot').forEach(el => { const t = c.data[el.dataset.t][el.dataset.s]; if (t && el.dataset.ovr !== '1') delete t.tot; });
      return Object.assign({ student_name: c.student_name, roll_no: c.roll_no, admission_no: c.admission_no, dob: c.dob, father: c.father, mother: c.mother, mobile: c.mobile, email: c.email, attendance: c.attendance, class_name: card.class_name, section: c.section != null ? c.section : card.section, data: c.data }, extra || {});
    }
    function validate() {
      const c = collect();
      if (!c.student_name) return 'Please enter the student name.';
      if (c.attendance && (isNaN(+c.attendance) || +c.attendance < 0 || +c.attendance > 100)) return 'Attendance must be a percentage between 0 and 100.';
      if (c.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) return 'Please check the email address.';
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
      <div class="tabs">${[['cards', 'Report cards'], ['teachers', 'Teachers'], ['classes', 'Classes & report card format'], ['admins', 'Admins'], ['settings', 'Settings']].map(([k, l]) => `<button class="tab ${adminTab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div><div id="tabc"></div>`;
    $$('[data-tab]').forEach(b => b.onclick = () => { adminTab = b.dataset.tab; adminHome(); });
    ({ cards: adminCards, teachers: adminTeachers, classes: adminClasses, admins: adminAdmins, settings: adminSettings })[adminTab]();
  }

  async function adminCards() {
    $('#tabc').innerHTML = `<div class="panel"><div class="row" style="margin-bottom:12px">
      <select id="fc" class="mk" style="width:auto;min-width:150px"><option value="">All classes</option>${S.classes.map(c => `<option>${esc(c.name)}</option>`).join('')}</select>
      <select id="ft" class="mk" style="width:auto;min-width:160px"><option value="">All teachers</option>${S.teachers.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
      <select id="fs" class="mk" style="width:auto"><option value="">Submitted + approved</option><option value="submitted">Waiting for approval</option><option value="approved">Approved</option><option value="draft">Drafts (not submitted)</option></select>
      <input id="fq" class="mk" style="flex:1;min-width:220px;text-align:left" placeholder="Search by student name, mobile, email, admission no., roll no. or parent name…">
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
  function fallbackCls(c) { const d = c.data || {}; const f = Object.keys(d).find(k => !['ov', 'co', 'result', 'promoted', 'remark'].includes(k)); return { name: c.class_name, subjects: Object.keys((f && d[f]) || {}), co: Object.keys(d.co || {}), format: null }; }

  const tClasses = t => (t.classes || []).map(x => x.c + (x.s ? ' – ' + x.s : '')).join(', ');
  function adminTeachers() {
    $('#tabc').innerHTML = `<div class="panel"><div class="row" style="justify-content:space-between;margin-bottom:12px"><h3 style="margin:0">Teachers</h3><button class="btn gold" id="addt">+ Add teacher</button></div>
      <div class="srch"><input id="tsq" class="mk" placeholder="Search teacher by name, email, phone or class…">
      <select id="tsc" class="mk" style="width:auto"><option value="">All classes</option>${S.classes.map(c => `<option>${esc(c.name)}</option>`).join('')}</select>
      <select id="tss" class="mk" style="width:auto"><option value="">Active + disabled</option><option value="1">Active</option><option value="0">Disabled</option></select></div>
      <div class="tw" id="tlist"></div></div>`;
    const draw = () => {
      const q = $('#tsq').value.trim().toLowerCase(), qd = q.replace(/\D/g, ''), fc = $('#tsc').value, fs = $('#tss').value;
      const rows = S.teachers.filter(t => {
        if (fc && !(t.classes || []).some(x => x.c === fc)) return false;
        if (fs !== '' && String(t.active ? 1 : 0) !== fs) return false;
        if (!q) return true;
        const hay = [t.name, t.email, t.designation, tClasses(t)].join(' ').toLowerCase();
        return hay.includes(q) || (qd.length >= 3 && String(t.phone || '').replace(/\D/g, '').includes(qd));
      });
      $('#tlist').innerHTML = rows.length ? `<table class="lt"><thead><tr><th>Teacher</th><th>Login email</th><th>Classes</th><th>Phone</th><th>Report cards</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(t => `<tr>
      <td><div class="tch">${avatar(t)}<div><b>${esc(t.name)}</b><br><small style="color:var(--muted)">${esc(t.designation || '')}</small></div></div></td>
      <td>${esc(t.email)}</td><td>${esc(tClasses(t) || '–')}</td><td>${esc(t.phone)}</td><td>${t.cards}</td>
      <td>${t.active ? '<span class="st approved">Active</span>' : '<span class="st draft">Disabled</span>'}</td>
      <td><div class="row" style="justify-content:flex-end;flex-wrap:nowrap"><button class="btn sm" data-vt="${t.id}">View</button><button class="btn sm" data-et="${t.id}">Edit</button><button class="btn sm danger" data-dt="${t.id}">Remove</button></div></td></tr>`).join('')}</tbody></table>`
        : `<div class="empty">${S.teachers.length ? 'No teacher matches your search.' : 'No teachers yet. Click “+ Add teacher”.'}</div>`;
      $$('[data-vt]').forEach(b => b.onclick = () => teacherDetails(S.teachers.find(t => t.id === +b.dataset.vt)));
      $$('[data-et]').forEach(b => b.onclick = () => teacherForm(S.teachers.find(t => t.id === +b.dataset.et)));
      $$('[data-dt]').forEach(b => b.onclick = async () => {
        const t = S.teachers.find(x => x.id === +b.dataset.dt);
        if (!confirm(`Remove ${t.name} from the portal? Their report cards will stay saved.`)) return;
        await api('/teachers/' + t.id, { method: 'DELETE' }); adminHome();
      });
    };
    $('#addt').onclick = () => teacherForm(null);
    let tmr; $('#tsq').oninput = () => { clearTimeout(tmr); tmr = setTimeout(draw, 150); };
    $('#tsc').onchange = draw; $('#tss').onchange = draw;
    draw();
  }
  function teacherDetails(t) {
    const when = t.created_at ? new Date(t.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '–';
    const m = modal(`<div class="mh"><h2>${esc(t.name)}</h2><button class="btn" id="dcl">Close</button></div>
      <div class="det">${t.photo ? `<img class="ph" src="${esc(t.photo)}" alt="">` : `<div class="ph av" style="width:140px;height:160px;display:grid;place-items:center;font-size:2.4rem;border-radius:12px;background:var(--cream)">${esc(initials(t.name))}</div>`}
      <dl><dt>Designation</dt><dd>${esc(t.designation || 'Teacher')}</dd>
      <dt>Login email</dt><dd>${esc(t.email)}</dd>
      <dt>Phone</dt><dd>${t.phone ? `<a href="tel:${esc(t.phone)}">${esc(t.phone)}</a>` : '–'}</dd>
      <dt>Classes</dt><dd>${esc(tClasses(t) || 'Not assigned')}</dd>
      <dt>Status</dt><dd>${t.active ? 'Active – can log in' : 'Disabled – cannot log in'}</dd>
      <dt>Registered on</dt><dd>${esc(when)}</dd>
      <dt>Report cards</dt><dd>${t.cards} total · ${t.drafts} draft · ${t.submitted} waiting for approval · ${t.approved} approved</dd>
      <dt>Signature</dt><dd>${t.signature ? `<img src="${esc(t.signature)}" alt="" style="max-height:60px;max-width:220px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:4px">` : 'Not uploaded'}</dd></dl></div>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" id="dcards">See report cards</button><button class="btn pri" id="ded">Edit teacher</button></div>`);
    $('#dcl', m).onclick = closeModal;
    $('#ded', m).onclick = () => teacherForm(t);
    $('#dcards', m).onclick = async () => { closeModal(); adminTab = 'cards'; await adminHome(); $('#ft').value = String(t.id); $('#fs').value = ''; $('#ft').dispatchEvent(new Event('change')); };
  }
  function teacherForm(t) {
    const isNew = !t; t = t || { active: 1, classes: [] };
    let rows = (t.classes && t.classes.length ? t.classes : [{ c: '', s: '' }]).map(x => ({ c: x.c, s: x.s || '' }));
    const m = modal(`<div class="mh"><h2>${isNew ? 'Add teacher' : 'Edit teacher'}</h2><button class="btn" id="tcl">Close</button></div>
      <form id="tf" novalidate><div class="grid">
      <div class="f"><label>Full name *</label><input name="name" value="${esc(t.name || '')}"></div>
      <div class="f"><label>Login email *</label><input name="email" type="email" value="${esc(t.email || '')}"><div class="hint">The teacher logs in with a code sent to this email.</div></div>
      <div class="f"><label>Phone</label><input name="phone" type="tel" value="${esc(t.phone || '')}"></div>
      <div class="f"><label>Designation / subject</label><input name="designation" value="${esc(t.designation || '')}" placeholder="Class Teacher · Maths"></div>
      ${!isNew ? `<div class="f"><label>Status</label><select name="active"><option value="1" ${t.active ? 'selected' : ''}>Active</option><option value="0" ${!t.active ? 'selected' : ''}>Disabled (cannot log in)</option></select></div>` : ''}
      </div>
      <div class="f" style="margin-top:12px"><label>Classes this teacher makes report cards for *</label><div id="crows"></div>
      <button type="button" class="btn sm" id="addcr">+ Add another class</button><div class="hint">A teacher can have more than one class. After logging in, she chooses which class to work on.</div></div>
      <div class="grid" style="margin-top:12px">
      <div class="f"><label>Photo</label><div class="imgup"><img id="pimg" src="${esc(t.photo || '/assets/img/favicon-32.png')}" alt=""><input type="file" accept="image/*" id="pfile"></div></div>
      <div class="f"><label>Signature (shown on report card)</label><div class="imgup sig"><img id="simg" src="${esc(t.signature || '')}" alt=""><input type="file" accept="image/*" id="sfile"></div><div class="hint">Sign on white paper, take a photo, crop it.</div></div></div>
      <div id="tm"></div><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn pri">${isNew ? 'Add teacher' : 'Save changes'}</button></div></form>`);
    const drawRows = () => {
      $('#crows', m).innerHTML = rows.map((r, i) => `<div class="ac-row"><div class="f" style="min-width:170px"><label style="font-size:.75rem">Class</label><select data-rc="${i}"><option value="">– Select –</option>${S.classes.map(c => `<option ${c.name === r.c ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
        <div class="f" style="width:110px"><label style="font-size:.75rem">Section</label><input data-rs="${i}" value="${esc(r.s)}" placeholder="A"></div>
        ${rows.length > 1 ? `<button type="button" class="xbtn" data-rx="${i}" title="Remove this class" style="margin-bottom:8px">×</button>` : ''}</div>`).join('');
      $$('[data-rc]', m).forEach(el => el.onchange = () => rows[+el.dataset.rc].c = el.value);
      $$('[data-rs]', m).forEach(el => el.oninput = () => rows[+el.dataset.rs].s = el.value.trim());
      $$('[data-rx]', m).forEach(el => el.onclick = () => { rows.splice(+el.dataset.rx, 1); drawRows(); });
    };
    drawRows();
    $('#addcr', m).onclick = () => { rows.push({ c: '', s: '' }); drawRows(); };
    let photo = t.photo || '', signature = t.signature || '';
    $('#tcl', m).onclick = closeModal;
    $('#pfile', m).onchange = async e => { try { photo = await readImage(e.target.files[0], 320); $('#pimg', m).src = photo; } catch (er) { toast($('#tm', m), er.message); } };
    $('#sfile', m).onchange = async e => { try { signature = await readImage(e.target.files[0], 420); $('#simg', m).src = signature; } catch (er) { toast($('#tm', m), er.message); } };
    $('#tf', m).onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      const classes = rows.filter(r => r.c);
      if (!classes.length) return toast($('#tm', m), 'Please choose at least one class for this teacher.');
      const body = { name: f.name.value, email: f.email.value, phone: f.phone.value, designation: f.designation.value, classes, photo, signature };
      if (!isNew) body.active = f.active.value === '1';
      try { await api(isNew ? '/teachers' : '/teachers/' + t.id, { method: isNew ? 'POST' : 'PUT', body }); closeModal(); adminHome(); }
      catch (er) { toast($('#tm', m), er.message); }
    };
  }

  // ----- admins -----
  async function adminAdmins() {
    const list = await api('/admins');
    $('#tabc').innerHTML = `<div class="panel"><div class="row" style="justify-content:space-between;margin-bottom:6px"><h3 style="margin:0">Admins</h3><button class="btn gold" id="adda">+ Add admin</button></div>
      <p class="sub">Every admin has full access: report cards, teachers, classes, formats and settings. New admins log in on this page with a code sent to their email.</p>
      <div class="tw"><table class="lt"><thead><tr><th>Admin</th><th>Login email</th><th>Phone</th><th>Status</th><th></th></tr></thead><tbody>${list.map(a => `<tr>
      <td><b>${esc(a.name)}</b>${a.me ? ' <small style="color:var(--muted)">(you)</small>' : ''}<br><small style="color:var(--muted)">${esc(a.designation || '')}</small></td>
      <td>${esc(a.email)}</td><td>${esc(a.phone || '')}</td><td>${a.active ? '<span class="st approved">Active</span>' : '<span class="st draft">Disabled</span>'}</td>
      <td><div class="row" style="justify-content:flex-end;flex-wrap:nowrap">${a.me ? '' : `<button class="btn sm" data-ta="${a.id}">${a.active ? 'Disable' : 'Enable'}</button><button class="btn sm danger" data-da="${a.id}">Remove</button>`}</div></td></tr>`).join('')}</tbody></table></div><div id="am"></div></div>`;
    $('#adda').onclick = () => {
      const m = modal(`<div class="mh"><h2>Add admin</h2><button class="btn" id="acl">Close</button></div><form id="af" novalidate><div class="grid">
        <div class="f"><label>Full name *</label><input name="name"></div>
        <div class="f"><label>Login email *</label><input name="email" type="email"><div class="hint">They log in with a code sent to this email.</div></div>
        <div class="f"><label>Phone</label><input name="phone" type="tel"></div>
        <div class="f"><label>Designation</label><input name="designation" placeholder="Principal / Office Admin"></div>
        <div class="f"><label>Backup password (optional, min 8)</label><input name="password" type="password" autocomplete="new-password"><div class="hint">Only needed if email codes ever stop working.</div></div>
        </div><div id="afm"></div><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn pri">Add admin</button></div></form>`);
      $('#acl', m).onclick = closeModal;
      $('#af', m).onsubmit = async e => {
        e.preventDefault(); const f = e.target;
        try { await api('/admins', { method: 'POST', body: { name: f.name.value, email: f.email.value, phone: f.phone.value, designation: f.designation.value, password: f.password.value } }); closeModal(); adminAdmins(); }
        catch (er) { toast($('#afm', m), er.message); }
      };
    };
    $$('[data-ta]').forEach(b => b.onclick = async () => {
      const a = list.find(x => x.id === +b.dataset.ta);
      try { await api('/admins/' + a.id, { method: 'PUT', body: { name: a.name, phone: a.phone, designation: a.designation, active: !a.active } }); adminAdmins(); } catch (er) { toast($('#am'), er.message); }
    });
    $$('[data-da]').forEach(b => b.onclick = async () => {
      const a = list.find(x => x.id === +b.dataset.da);
      if (!confirm(`Remove ${a.name} as admin?`)) return;
      try { await api('/admins/' + a.id, { method: 'DELETE' }); adminAdmins(); } catch (er) { toast($('#am'), er.message); }
    });
  }

  // ----- classes + report card format -----
  let fmtSel = 0;
  function adminClasses() {
    const list = JSON.parse(JSON.stringify(S.classes));
    list.forEach(c => { if (!c.format) c.format = RC.clone(RC.DEF_FORMAT); });
    const uid = p => p + Math.random().toString(36).slice(2, 7);
    const scaleStr = f => f.scale.map(([lo, g]) => `${lo}=${g}`).join(', ');
    const coStr = f => f.co.map(([g, m]) => `${g}=${m}`).join(', ');
    const draw = () => {
      if (fmtSel >= list.length) fmtSel = Math.max(0, list.length - 1);
      const c = list[fmtSel], f = c && c.format;
      $('#tabc').innerHTML = `<div class="panel"><div class="row" style="justify-content:space-between;margin-bottom:6px"><h3 style="margin:0">Classes &amp; report card format</h3><div class="row"><button class="btn" id="addc">+ Add class</button><button class="btn pri" id="savec">Save all</button></div></div>
        <p class="sub">Each class has its own subjects, exam columns, maximum marks, grading and co-scholastic activities. A teacher sees exactly her class’s format on the report card form.</p>
        <div class="row" style="margin-bottom:12px"><div class="f" style="min-width:220px;margin:0"><label>Choose class to edit</label><select id="csel">${list.map((x, i) => `<option value="${i}" ${i === fmtSel ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div></div>
        <div id="cm"></div>
        ${c ? `<div class="clsrow">
          <div class="row" style="margin-bottom:8px"><div class="f" style="flex:1;min-width:160px"><label>Class name</label><input id="cn" value="${esc(c.name)}"></div>
          <div class="f" style="min-width:200px"><label>Copy format from</label><select id="cpf"><option value="">– another class –</option>${list.map((x, i) => i === fmtSel ? '' : `<option value="${i}">${esc(x.name)}</option>`).join('')}</select></div>
          <button class="btn sm danger" id="rmc" style="align-self:end">Remove class</button></div>
          ${['subjects', 'co'].map(k => `<div class="f" style="margin-top:6px"><label>${k === 'subjects' ? 'Subjects' : 'Co-scholastic activities'}</label><div class="chips">${c[k].map((s, j) => `<span class="chip">${esc(s)}<button type="button" data-x="${k}|${j}" aria-label="Remove">×</button></span>`).join('')}
          <input class="mk" style="width:170px;text-align:left" placeholder="+ add & press Enter" data-add="${k}"></div></div>`).join('')}
          <h3 style="margin:16px 0 6px">Exam terms &amp; mark columns</h3>
          ${f.terms.map((t, ti) => `<div class="fmt-term"><div class="row"><div class="f" style="min-width:180px;margin:0"><label style="font-size:.75rem">Term name</label><input data-tn="${ti}" value="${esc(t.n)}"></div>
            <div style="align-self:end;color:var(--muted);font-size:.85rem">Total: <b>${t.cols.reduce((a, x) => a + (+x.m || 0), 0)}</b> marks</div>
            ${f.terms.length > 1 ? `<button type="button" class="btn sm danger" data-tx="${ti}" style="align-self:end;margin-left:auto">Remove term</button>` : ''}</div>
            <div class="fmt-cols">${t.cols.map((col, ci) => `<div class="fmt-col"><input class="l" data-cl="${ti}|${ci}" value="${esc(col.l)}" placeholder="Column name"><input class="m" data-cm="${ti}|${ci}" value="${col.m}" inputmode="numeric" title="Maximum marks"><button type="button" data-cx="${ti}|${ci}" title="Remove column">×</button></div>`).join('')}
            <button type="button" class="btn sm" data-ca="${ti}">+ Column</button></div></div>`).join('')}
          ${f.terms.length < 4 ? '<button type="button" class="btn sm" id="addterm">+ Add term</button>' : ''}
          <div class="grid" style="margin-top:14px">
            <div class="f" style="grid-column:span 2"><label>Grading scale (minimum % = grade)</label><input id="fscale" value="${esc(scaleStr(f))}"><div class="hint">Example: 91=A1, 81=A2, 71=B1, 61=B2, 51=C1, 41=C2, 33=D, 0=E</div></div>
            <div class="f"><label>Pass mark %</label><input id="fpass" value="${esc(f.pass)}" inputmode="numeric"></div>
            <div class="f" style="grid-column:span 2"><label>Co-scholastic grades (grade = meaning)</label><input id="fco" value="${esc(coStr(f))}"><div class="hint">Example: A=Outstanding, B=Very Good, C=Good, D=Needs Improvement</div></div>
          </div>
          <div class="row" style="margin-top:12px"><button type="button" class="btn" id="fprev">👁 Preview blank report card</button></div>
        </div>` : '<div class="empty">No classes yet.</div>'}</div>`;
      $('#csel').onchange = e => { fmtSel = +e.target.value; draw(); };
      $('#addc').onclick = () => { list.push({ name: 'New class', subjects: [], co: [...(list[0] ? list[0].co : [])], format: RC.clone(list[fmtSel] ? list[fmtSel].format : RC.DEF_FORMAT) }); fmtSel = list.length - 1; draw(); };
      $('#savec').onclick = save;
      if (!c) return;
      $('#cn').oninput = e => c.name = e.target.value;
      $('#cpf').onchange = e => { const src = list[+e.target.value]; if (src && confirm(`Copy the exam terms, columns and grading of ${src.name} to ${c.name}? (Subjects stay the same.)`)) { c.format = RC.clone(src.format); draw(); } };
      $('#rmc').onclick = () => { if (confirm(`Remove class ${c.name}?`)) { list.splice(fmtSel, 1); draw(); } };
      $$('[data-x]').forEach(b => b.onclick = () => { const [k, j] = b.dataset.x.split('|'); c[k].splice(+j, 1); draw(); });
      $$('[data-add]').forEach(el => el.onkeydown = e => { if (e.key === 'Enter' && el.value.trim()) { e.preventDefault(); const k = el.dataset.add; c[k].push(el.value.trim()); draw(); $(`[data-add="${k}"]`).focus(); } });
      $$('[data-tn]').forEach(el => el.oninput = () => f.terms[+el.dataset.tn].n = el.value);
      $$('[data-tx]').forEach(el => el.onclick = () => { if (confirm('Remove this term?')) { f.terms.splice(+el.dataset.tx, 1); draw(); } });
      $$('[data-cl]').forEach(el => el.oninput = () => { const [ti, ci] = el.dataset.cl.split('|'); f.terms[+ti].cols[+ci].l = el.value; });
      $$('[data-cm]').forEach(el => el.onchange = () => { const [ti, ci] = el.dataset.cm.split('|'); f.terms[+ti].cols[+ci].m = Math.max(0, +el.value || 0); draw(); });
      $$('[data-cx]').forEach(el => el.onclick = () => { const [ti, ci] = el.dataset.cx.split('|'); f.terms[+ti].cols.splice(+ci, 1); draw(); });
      $$('[data-ca]').forEach(el => el.onclick = () => { f.terms[+el.dataset.ca].cols.push({ k: uid('c'), l: 'New column', m: 10 }); draw(); });
      if ($('#addterm')) $('#addterm').onclick = () => { f.terms.push({ k: uid('t'), n: 'Term ' + (f.terms.length + 1), cols: [{ k: uid('c'), l: 'Exam', m: 100 }] }); draw(); };
      $('#fscale').onchange = e => {
        const sc = e.target.value.split(',').map(x => x.split('=').map(y => y.trim())).filter(x => x.length === 2 && x[1] && !isNaN(+x[0])).map(([lo, g]) => [+lo, g]);
        if (sc.length) f.scale = sc.sort((a, b) => b[0] - a[0]); draw();
      };
      $('#fpass').onchange = e => { f.pass = Math.max(0, Math.min(100, +e.target.value || 0)); };
      $('#fco').onchange = e => { const co = e.target.value.split(',').map(x => x.split('=').map(y => y.trim())).filter(x => x[0]).map(([g, m]) => [g, m || '']); if (co.length) f.co = co; draw(); };
      $('#fprev').onclick = () => preview({ student_name: 'Sample Student', class_name: c.name, section: 'A', session: S.settings.session, data: {} }, c, null, false);
    };
    async function save() {
      for (const c of list) {
        if (!c.name.trim()) return toast($('#cm'), 'Every class needs a name.');
        const bad = c.format.terms.find(t => !t.cols.length);
        if (bad) return toast($('#cm'), `${c.name}: “${bad.n}” has no mark columns.`);
      }
      try { await api('/classes', { method: 'PUT', body: { classes: list } }); const b = await api('/bootstrap'); S.classes = b.classes; toast($('#cm'), 'Saved ✓', true); }
      catch (er) { toast($('#cm'), er.message); }
    }
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
