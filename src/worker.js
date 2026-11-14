// Vivek Model Sr. Sec. School – website + report card portal
// Static site is served from ./public; this worker handles /api/*.

const SESSION_DAYS = 7;
const DEFAULT_CO = ['Computer', 'General Knowledge', 'Work Education', 'Sports', 'Visual & Performing Art', 'Discipline'];
const DEFAULT_CLASSES = [
  ['Nursery', ['English', 'Hindi', 'Mathematics', 'EVS', 'Drawing']],
  ['LKG', ['English', 'Hindi', 'Mathematics', 'EVS', 'Drawing']],
  ['UKG', ['English', 'Hindi', 'Mathematics', 'EVS', 'Drawing']],
  ...['I', 'II', 'III', 'IV', 'V'].map(c => [c, ['English', 'Hindi', 'Mathematics', 'EVS', 'Computer']]),
  ...['VI', 'VII', 'VIII'].map(c => [c, ['English', 'Hindi', 'Mathematics', 'Science', 'Social Science', 'Sanskrit']]),
  ...['IX', 'X'].map(c => [c, ['English', 'Hindi', 'Mathematics', 'Science', 'Social Science']]),
  ['XI Science', ['English', 'Physics', 'Chemistry', 'Mathematics', 'Biology']],
  ['XI Commerce', ['English', 'Accountancy', 'Business Studies', 'Economics', 'Mathematics']],
  ['XI Humanities', ['English', 'History', 'Political Science', 'Geography', 'Economics']],
  ['XII Science', ['English', 'Physics', 'Chemistry', 'Mathematics', 'Biology']],
  ['XII Commerce', ['English', 'Accountancy', 'Business Studies', 'Economics', 'Mathematics']],
  ['XII Humanities', ['English', 'History', 'Political Science', 'Geography', 'Economics']],
];

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, salt TEXT NOT NULL, phone TEXT DEFAULT '', class_name TEXT DEFAULT '', section TEXT DEFAULT '', designation TEXT DEFAULT '', photo TEXT DEFAULT '', signature TEXT DEFAULT '', active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS classes (name TEXT PRIMARY KEY, subjects TEXT NOT NULL, co TEXT NOT NULL, sort INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS cards (id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id INTEGER, class_name TEXT, section TEXT, student_name TEXT, admission_no TEXT, dob TEXT, father TEXT, mother TEXT, mobile TEXT, roll_no TEXT, attendance TEXT, data TEXT, status TEXT DEFAULT 'draft', session TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS otps (email TEXT PRIMARY KEY, code_hash TEXT, expires INTEGER, attempts INTEGER DEFAULT 0, last_sent INTEGER DEFAULT 0, window_start INTEGER DEFAULT 0, sent_count INTEGER DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_teacher ON cards(teacher_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cards_class ON cards(class_name)`,
];

let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  for (const s of SCHEMA) await db.prepare(s).run();
  const n = await db.prepare('SELECT COUNT(*) AS n FROM classes').first();
  if (!n.n) {
    const st = DEFAULT_CLASSES.map(([c, subs], i) =>
      db.prepare('INSERT INTO classes (name, subjects, co, sort) VALUES (?,?,?,?)').bind(c, JSON.stringify(subs), JSON.stringify(DEFAULT_CO), i));
    await db.batch(st);
  }
  const defaults = { session: '2025–26', reopen: '01-04-2027', principal_name: 'Mrs. Mamta Adlakha', principal_signature: '' };
  for (const [k, v] of Object.entries(defaults))
    await db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?,?)').bind(k, v).run();
  schemaReady = true;
}

// ---------- helpers ----------
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const err = (msg, status = 400) => json({ error: msg }, status);
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const randHex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return b64(bits);
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function getCookie(req, name) {
  const c = req.headers.get('cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}
const cookieFor = (token, maxAge) => `vm_sess=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const isImage = v => !v || (typeof v === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length < 600000);

const PUBLIC_USER = 'id, role, name, email, phone, class_name, section, designation, photo, signature, active';

async function currentUser(req, db) {
  const t = getCookie(req, 'vm_sess');
  if (!t || !/^[a-f0-9]{64}$/.test(t)) return null;
  const row = await db.prepare(`SELECT ${PUBLIC_USER.split(', ').map(c => 'u.' + c).join(', ')}, s.expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`).bind(t).first();
  if (!row || row.expires < Date.now() || !row.active) return null;
  return row;
}

async function readBody(req) {
  if (!(req.headers.get('content-type') || '').includes('application/json')) throw new Error('Expected JSON');
  return await req.json();
}

function cardFields(b) {
  return {
    student_name: clean(b.student_name, 120), admission_no: clean(b.admission_no, 60), dob: clean(b.dob, 20),
    father: clean(b.father, 120), mother: clean(b.mother, 120), mobile: clean(b.mobile, 20), roll_no: clean(b.roll_no, 20),
    attendance: clean(b.attendance, 10), section: clean(b.section, 10),
    data: JSON.stringify(b.data && typeof b.data === 'object' ? b.data : {}).slice(0, 60000),
  };
}


async function sendOtpEmail(env, to, name, code) {
  if (!env.RESEND_API_KEY) throw new Error('email service is not set up yet (RESEND_API_KEY missing)');
  const from = env.MAIL_FROM || 'Vivek Model Sr. Sec. School <no-reply@vivekmodelsrsecschool.in>';
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e3ddcf;border-radius:12px">
    <div style="text-align:center"><img src="https://vivekmodelsrsecschool.in/assets/img/icon-192.png" width="64" height="64" alt="">
    <h2 style="color:#12223f;margin:8px 0 4px">Vivek Model Sr. Sec. School</h2><p style="color:#5b6476;margin:0 0 18px">School Portal login</p></div>
    <p style="color:#1d2433">Hello ${String(name).replace(/[<>&]/g, '')},</p><p style="color:#1d2433">Your login code is:</p>
    <p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#12223f;text-align:center;background:#fbf7ee;border-radius:10px;padding:14px;margin:10px 0">${code}</p>
    <p style="color:#5b6476;font-size:13px">This code expires in 10 minutes. If you did not try to log in, you can ignore this email.</p></div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: `${code} is your Vivek Model School Portal login code`, html, text: `Your Vivek Model School Portal login code is ${code}. It expires in 10 minutes.` }),
  });
  if (!r.ok) throw new Error('email provider error ' + r.status);
}

// ---------- API ----------
async function api(req, env, url) {
  const db = env.DB;
  if (!db) return err('Database not connected yet. Please bind the D1 database.', 503);
  await ensureSchema(db);
  const p = url.pathname.replace(/^\/api/, '');
  const m = req.method;
  if (m !== 'GET' && m !== 'HEAD') {
    const origin = req.headers.get('origin');
    if (origin && new URL(origin).host !== url.host) return err('Bad origin', 403);
  }

  // setup + auth
  if (p === '/setup-status' && m === 'GET') {
    const a = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").first();
    return json({ needsSetup: !a.n });
  }
  if (p === '/setup' && m === 'POST') {
    const a = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").first();
    if (a.n) return err('Admin already exists', 403);
    const b = await readBody(req);
    const email = clean(b.email, 120).toLowerCase(), name = clean(b.name, 120), pw = String(b.password || '');
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || pw.length < 8) return err('Enter name, valid email and a password of at least 8 characters');
    const salt = randHex(16);
    await db.prepare("INSERT INTO users (role, name, email, pass_hash, salt, designation) VALUES ('admin',?,?,?,?, 'Administrator')").bind(name, email, await hashPassword(pw, salt), salt).run();
    return json({ ok: true });
  }
  if (p === '/login' && m === 'POST') {
    const b = await readBody(req);
    const email = clean(b.email, 120).toLowerCase();
    const u = await db.prepare('SELECT id, role, pass_hash, salt, active FROM users WHERE email = ?').bind(email).first();
    const h = u ? await hashPassword(String(b.password || ''), u.salt) : await hashPassword('x', 'y');
    if (!u || !u.active || !safeEqual(h, u.pass_hash)) return err('Wrong email or password', 401);
    if (u.role !== 'admin') return err('Teachers log in with the email code', 401);
    const token = randHex(32);
    await db.prepare('DELETE FROM sessions WHERE expires < ?').bind(Date.now()).run();
    await db.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?,?,?)').bind(token, u.id, Date.now() + SESSION_DAYS * 864e5).run();
    return json({ ok: true }, 200, { 'set-cookie': cookieFor(token, SESSION_DAYS * 86400) });
  }

  if (p === '/otp/request' && m === 'POST') {
    const b = await readBody(req);
    const email = clean(b.email, 120).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err('Enter a valid email');
    const u = await db.prepare('SELECT id, name, active FROM users WHERE email = ?').bind(email).first();
    const now = Date.now();
    const o = await db.prepare('SELECT * FROM otps WHERE email = ?').bind(email).first();
    if (o && now - o.last_sent < 60000) return err('Please wait a minute before asking for a new code.', 429);
    let win = o ? o.window_start : now, cnt = o ? o.sent_count : 0;
    if (now - win > 3600000) { win = now; cnt = 0; }
    if (cnt >= 5) return err('Too many codes requested. Please try again in an hour.', 429);
    if (!u || !u.active) { // do not reveal whether the email exists
      await db.prepare('INSERT OR REPLACE INTO otps (email, code_hash, expires, attempts, last_sent, window_start, sent_count) VALUES (?,?,?,?,?,?,?)').bind(email, '', 0, 0, now, win, cnt + 1).run();
      return json({ ok: true });
    }
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
    const salt = 'otp:' + email;
    await db.prepare('INSERT OR REPLACE INTO otps (email, code_hash, expires, attempts, last_sent, window_start, sent_count) VALUES (?,?,?,?,?,?,?)').bind(email, await hashPassword(code, salt), now + 600000, 0, now, win, cnt + 1).run();
    if (env.DEV_SHOW_OTP === '1') return json({ ok: true, dev_code: code });
    try { await sendOtpEmail(env, email, u.name, code); }
    catch (e) { return err('Could not send the email: ' + e.message, 502); }
    return json({ ok: true });
  }
  if (p === '/otp/verify' && m === 'POST') {
    const b = await readBody(req);
    const email = clean(b.email, 120).toLowerCase(), code = String(b.code || '').replace(/\D/g, '');
    const o = await db.prepare('SELECT * FROM otps WHERE email = ?').bind(email).first();
    if (!o || !o.code_hash || o.expires < Date.now()) return err('Code expired. Please request a new one.', 401);
    if (o.attempts >= 5) return err('Too many wrong tries. Please request a new code.', 401);
    if (!safeEqual(await hashPassword(code, 'otp:' + email), o.code_hash)) {
      await db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE email = ?').bind(email).run();
      return err('Wrong code. Please check your email and try again.', 401);
    }
    const u = await db.prepare('SELECT id, active FROM users WHERE email = ?').bind(email).first();
    if (!u || !u.active) return err('This account is not active', 401);
    await db.prepare("UPDATE otps SET code_hash = '', expires = 0 WHERE email = ?").bind(email).run();
    const token = randHex(32);
    await db.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?,?,?)').bind(token, u.id, Date.now() + SESSION_DAYS * 864e5).run();
    return json({ ok: true }, 200, { 'set-cookie': cookieFor(token, SESSION_DAYS * 86400) });
  }
  if (p === '/logout' && m === 'POST') {
    const t = getCookie(req, 'vm_sess');
    if (t) await db.prepare('DELETE FROM sessions WHERE token = ?').bind(t).run();
    return json({ ok: true }, 200, { 'set-cookie': cookieFor('x', 0) });
  }

  const me = await currentUser(req, db);
  if (!me) return err('Please log in', 401);
  const isAdmin = me.role === 'admin';

  if (p === '/bootstrap' && m === 'GET') {
    const classes = (await db.prepare('SELECT name, subjects, co FROM classes ORDER BY sort, name').all()).results
      .map(c => ({ name: c.name, subjects: JSON.parse(c.subjects), co: JSON.parse(c.co) }));
    const settings = Object.fromEntries((await db.prepare('SELECT key, value FROM settings').all()).results.map(r => [r.key, r.value]));
    const { expires, ...user } = me;
    return json({ me: user, classes, settings });
  }
  if (p === '/me/password' && m === 'POST') {
    const b = await readBody(req);
    const u = await db.prepare('SELECT pass_hash, salt FROM users WHERE id = ?').bind(me.id).first();
    if (!safeEqual(await hashPassword(String(b.current || ''), u.salt), u.pass_hash)) return err('Current password is wrong');
    if (String(b.password || '').length < 8) return err('New password must be at least 8 characters');
    const salt = randHex(16);
    await db.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').bind(await hashPassword(b.password, salt), salt, me.id).run();
    return json({ ok: true });
  }

  // ----- teachers (admin) -----
  if (p === '/teachers' && m === 'GET') {
    if (!isAdmin) return err('Admins only', 403);
    const r = await db.prepare(`SELECT ${PUBLIC_USER}, (SELECT COUNT(*) FROM cards c WHERE c.teacher_id = users.id) AS cards FROM users WHERE role='teacher' ORDER BY name`).all();
    return json(r.results);
  }
  if (p === '/teachers' && m === 'POST') {
    if (!isAdmin) return err('Admins only', 403);
    const b = await readBody(req);
    const email = clean(b.email, 120).toLowerCase(), name = clean(b.name, 120), pw = String(b.password || '');
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err('Enter teacher name and a valid login email');
    if (!isImage(b.photo) || !isImage(b.signature)) return err('Photo/signature must be an image under 400 KB');
    const ex = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (ex) return err('This email is already used');
    const salt = randHex(16);
    await db.prepare("INSERT INTO users (role, name, email, pass_hash, salt, phone, class_name, section, designation, photo, signature) VALUES ('teacher',?,?,?,?,?,?,?,?,?,?)")
      .bind(name, email, await hashPassword(pw || randHex(24), salt), salt, clean(b.phone, 20), clean(b.class_name, 40), clean(b.section, 10), clean(b.designation, 80), b.photo || '', b.signature || '').run();
    return json({ ok: true });
  }
  let mt = p.match(/^\/teachers\/(\d+)$/);
  if (mt) {
    if (!isAdmin) return err('Admins only', 403);
    const id = +mt[1];
    if (m === 'PUT') {
      const b = await readBody(req);
      if (!isImage(b.photo) || !isImage(b.signature)) return err('Photo/signature must be an image under 400 KB');
      const email = clean(b.email, 120).toLowerCase();
      const ex = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').bind(email, id).first();
      if (ex) return err('This email is already used');
      await db.prepare("UPDATE users SET name=?, email=?, phone=?, class_name=?, section=?, designation=?, photo=?, signature=?, active=? WHERE id=? AND role='teacher'")
        .bind(clean(b.name, 120), email, clean(b.phone, 20), clean(b.class_name, 40), clean(b.section, 10), clean(b.designation, 80), b.photo || '', b.signature || '', b.active === false ? 0 : 1, id).run();
      if (b.logout_all) await db.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();
      if (false) {
        const salt = randHex(16);
        await db.prepare('UPDATE users SET pass_hash=?, salt=? WHERE id=?').bind(await hashPassword(b.password, salt), salt, id).run();
        await db.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();
      }
      return json({ ok: true });
    }
    if (m === 'DELETE') {
      await db.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();
      await db.prepare("DELETE FROM users WHERE id=? AND role='teacher'").bind(id).run();
      return json({ ok: true });
    }
  }

  // ----- classes & settings (admin) -----
  if (p === '/classes' && m === 'PUT') {
    if (!isAdmin) return err('Admins only', 403);
    const b = await readBody(req);
    if (!Array.isArray(b.classes) || !b.classes.length) return err('No classes');
    const st = [db.prepare('DELETE FROM classes')];
    b.classes.slice(0, 60).forEach((c, i) => {
      const subs = (c.subjects || []).map(s => clean(s, 40)).filter(Boolean).slice(0, 15);
      const co = (c.co || []).map(s => clean(s, 40)).filter(Boolean).slice(0, 12);
      if (clean(c.name, 40)) st.push(db.prepare('INSERT OR REPLACE INTO classes (name, subjects, co, sort) VALUES (?,?,?,?)').bind(clean(c.name, 40), JSON.stringify(subs), JSON.stringify(co), i));
    });
    await db.batch(st);
    return json({ ok: true });
  }
  if (p === '/settings' && m === 'PUT') {
    if (!isAdmin) return err('Admins only', 403);
    const b = await readBody(req);
    if (!isImage(b.principal_signature)) return err('Signature must be an image under 400 KB');
    for (const k of ['session', 'reopen', 'principal_name', 'principal_signature'])
      if (k in b) await db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').bind(k, k === 'principal_signature' ? (b[k] || '') : clean(b[k], 80)).run();
    return json({ ok: true });
  }

  // ----- report cards -----
  if (p === '/cards' && m === 'GET') {
    const q = url.searchParams, where = [], args = [];
    if (!isAdmin) { where.push('c.teacher_id = ?'); args.push(me.id); }
    else {
      if (q.get('class')) { where.push('c.class_name = ?'); args.push(q.get('class')); }
      if (q.get('teacher')) { where.push('c.teacher_id = ?'); args.push(+q.get('teacher')); }
      if (q.get('status')) { where.push('c.status = ?'); args.push(q.get('status')); }
      else where.push("c.status != 'draft'");
    }
    const s = clean(q.get('q'), 80);
    if (s) { where.push('(c.student_name LIKE ? OR c.mobile LIKE ? OR c.father LIKE ? OR c.mother LIKE ? OR c.admission_no LIKE ?)'); for (let i = 0; i < 5; i++) args.push('%' + s + '%'); }
    const sql = `SELECT c.id, c.class_name, c.section, c.student_name, c.admission_no, c.father, c.mother, c.mobile, c.roll_no, c.status, c.updated_at, u.name AS teacher_name
      FROM cards c LEFT JOIN users u ON u.id = c.teacher_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.class_name, CAST(c.roll_no AS INTEGER), c.student_name LIMIT 1000`;
    return json((await db.prepare(sql).bind(...args).all()).results);
  }
  if (p === '/cards' && m === 'POST') {
    const b = await readBody(req);
    const f = cardFields(b);
    if (!f.student_name) return err('Student name is required');
    const cls = isAdmin ? clean(b.class_name, 40) : me.class_name;
    const sec = isAdmin ? f.section : me.section;
    const teacher = isAdmin ? (+b.teacher_id || null) : me.id;
    if (!cls) return err('No class assigned. Ask the admin to set your class.');
    const set = await db.prepare("SELECT value FROM settings WHERE key='session'").first();
    const r = await db.prepare('INSERT INTO cards (teacher_id, class_name, section, student_name, admission_no, dob, father, mother, mobile, roll_no, attendance, data, status, session) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(teacher, cls, sec, f.student_name, f.admission_no, f.dob, f.father, f.mother, f.mobile, f.roll_no, f.attendance, f.data, b.submit ? 'submitted' : 'draft', set?.value || '').run();
    return json({ ok: true, id: r.meta.last_row_id });
  }
  mt = p.match(/^\/cards\/(\d+)(\/(submit|approve|reopen))?$/);
  if (mt) {
    const id = +mt[1], action = mt[3];
    const card = await db.prepare('SELECT c.*, u.name AS teacher_name, u.signature AS teacher_signature FROM cards c LEFT JOIN users u ON u.id = c.teacher_id WHERE c.id = ?').bind(id).first();
    if (!card) return err('Report card not found', 404);
    if (!isAdmin && card.teacher_id !== me.id) return err('Not your report card', 403);
    if (m === 'GET' && !action) return json({ ...card, data: JSON.parse(card.data || '{}') });
    if (m === 'PUT' && !action) {
      if (!isAdmin && card.status === 'approved') return err('This report card is approved. Ask the admin to edit it.', 403);
      const b = await readBody(req);
      const f = cardFields(b);
      if (!f.student_name) return err('Student name is required');
      let status = card.status;
      if (!isAdmin && b.submit) status = 'submitted';
      await db.prepare("UPDATE cards SET student_name=?, admission_no=?, dob=?, father=?, mother=?, mobile=?, roll_no=?, attendance=?, data=?, section=?, status=?, updated_at=datetime('now') WHERE id=?")
        .bind(f.student_name, f.admission_no, f.dob, f.father, f.mother, f.mobile, f.roll_no, f.attendance, f.data, isAdmin ? (f.section || card.section) : card.section, status, id).run();
      return json({ ok: true });
    }
    if (m === 'POST' && action === 'submit') {
      if (card.status === 'approved') return err('Already approved');
      await db.prepare("UPDATE cards SET status='submitted', updated_at=datetime('now') WHERE id=?").bind(id).run();
      return json({ ok: true });
    }
    if (m === 'POST' && (action === 'approve' || action === 'reopen')) {
      if (!isAdmin) return err('Admins only', 403);
      await db.prepare("UPDATE cards SET status=?, updated_at=datetime('now') WHERE id=?").bind(action === 'approve' ? 'approved' : 'draft', id).run();
      return json({ ok: true });
    }
    if (m === 'DELETE' && !action) {
      if (!isAdmin && card.status !== 'draft') return err('Only drafts can be deleted by teachers', 403);
      await db.prepare('DELETE FROM cards WHERE id=?').bind(id).run();
      return json({ ok: true });
    }
  }
  return err('Not found', 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(req, env, url); }
      catch (e) { return err(e.message === 'Expected JSON' ? e.message : 'Server error: ' + e.message, 500); }
    }
    if (url.pathname === '/admin' || url.pathname === '/teacher') return Response.redirect(url.origin + '/portal/', 302);
    return env.ASSETS.fetch(req);
  },
};
