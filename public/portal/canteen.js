// School canteen panel (main admin only). All money in INR.
// Product types:
//   piece – bought and sold per piece (Lays, samosa, Frooti bottle)
//   glass – bought per bottle, sold per glass (1 bottle = N glasses)
//   plate – bought per piece, sold per plate (1 plate = N pieces, e.g. momos)
// Stock is tracked in a base unit: glasses for 'glass', pieces otherwise.
(function () {
  let H, root, D, sub = 'today', day = '', period = 30, planDays = 5, rp = { k: 'month', from: '', to: '' };
  const rs = n => { const v = Math.round((+n || 0) * 100) / 100; return (v < 0 ? '−₹' : '₹') + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }); };
  const nf = (n, d = 1) => (Math.round((+n || 0) * 10 ** d) / 10 ** d).toLocaleString('en-IN');
  const iso = dt => { const z = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
  const today = () => iso(new Date());
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
  const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);
  const nice = s => new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const E = s => H.esc(s);
  const N = p => +p.per_bottle || 1;
  // units
  const sellU = (p, n = 2) => p.unit === 'glass' ? (n === 1 ? 'glass' : 'glasses') : p.unit === 'plate' ? (n === 1 ? 'plate' : 'plates') : (n === 1 ? 'pc' : 'pcs');
  const stockU = (p, n = 2) => p.unit === 'glass' ? (n === 1 ? 'bottle' : 'bottles') : (n === 1 ? 'pc' : 'pcs');
  const costPer = p => p.unit === 'glass' ? 'bottle' : 'pc';
  const pricePer = p => p.unit === 'glass' ? 'glass' : p.unit === 'plate' ? `plate of ${N(p)}` : 'pc';
  const unitCostAt = (p, cost) => p.unit === 'glass' ? cost / N(p) : p.unit === 'plate' ? cost * N(p) : cost;  // cost of one sell unit
  const inBase = (p, q) => p.unit === 'glass' ? q * N(p) : q;      // stock entry -> base
  const soldBase = (p, q) => p.unit === 'plate' ? q * N(p) : q;    // sale entry -> base
  const baseToSell = (p, b) => p.unit === 'plate' ? b / N(p) : b;
  const leftText = p => {
    const L = Math.round(p.left * 100) / 100;
    if (p.unit === 'glass') {
      if (L <= 0) return '<span class="bad">0 glasses</span>';
      const b = Math.floor(L / N(p)), g = Math.round(L - b * N(p));
      return `${nf(L, 0)} glasses <small class="muted">(${b ? `${b} bottle${b === 1 ? '' : 's'}${g ? ' + ' + g + ' gl' : ''}` : 'part bottle'})</small>`;
    }
    if (L <= 0) return '<span class="bad">0 pcs</span>';
    if (p.unit === 'plate') return `${nf(L, 0)} pcs <small class="muted">(${nf(Math.floor(L / N(p)), 0)} plates)</small>`;
    return `${nf(L, 0)} pcs`;
  };
  const moveCost = m => { const p = D.byId[m.product_id]; return m.qty * unitCostAt(p, m.cost); };

  async function load() {
    D = await H.api('/canteen/state');
    const tot = Object.fromEntries(D.totals.map(t => [t.product_id, t]));
    D.byId = {};
    D.products.forEach(p => {
      const t = tot[p.id] || {};
      p.left = inBase(p, +t.qin || 0) - soldBase(p, +t.qsold || 0) + (+t.qadj || 0);
      p.ucost = unitCostAt(p, p.cost); p.uprofit = p.price - p.ucost;
      D.byId[p.id] = p;
    });
    bills();
    analyse();
  }

  // one bill per day with sales: expected vs UPI + cash + credit
  function bills() {
    const B = {};
    const get = d => B[d] || (B[d] = { day: d, sale: 0, cost: 0, upi: 0, cash: 0, credit: 0, pays: [] });
    D.moves.filter(m => m.kind === 'sold').forEach(m => { const b = get(m.day); b.sale += m.qty * m.price; b.cost += moveCost(m); });
    D.payments.forEach(x => { const b = get(x.bill_day); b[x.kind] += x.amount; b.pays.push(x); });
    Object.values(B).forEach(b => {
      b.got = b.upi + b.cash + b.credit; b.bal = Math.round((b.sale - b.got) * 100) / 100;
      b.status = b.sale <= 0 && b.got <= 0 ? 'none' : b.bal <= 0.009 ? (b.bal < -0.009 ? 'extra' : 'clear') : (b.got > 0 ? 'short' : 'pending');
    });
    D.bills = B;
    D.billList = Object.values(B).sort((a, b) => b.day.localeCompare(a.day));
    D.credits = D.payments.filter(x => x.kind === 'credit');
  }
  const statusChip = b => ({ clear: '<span class="st approved">All clear</span>', extra: `<span class="st approved">Extra ${rs(-b.bal)}</span>`, short: `<span class="st submitted">Short ${rs(b.bal)}</span>`, pending: `<span class="st draft">Pending ${rs(b.bal)}</span>`, none: '–' })[b.status];

  function analyse() {
    const from = addDays(today(), -(period - 1));
    D.openDays = new Set(D.moves.filter(m => m.kind === 'sold' && m.day >= from).map(m => m.day)).size;
    D.products.forEach(p => {
      const mv = D.moves.filter(m => m.product_id === p.id);
      const sold = mv.filter(m => m.kind === 'sold' && m.day >= from);
      p.pQty = sold.reduce((a, m) => a + m.qty, 0);
      p.pRev = sold.reduce((a, m) => a + m.qty * m.price, 0);
      p.pProfit = sold.reduce((a, m) => a + m.qty * m.price - moveCost(m), 0);
      p.avg = D.openDays ? p.pQty / D.openDays : 0;                 // sell units per canteen day
      p.lastsDays = p.avg > 0 ? baseToSell(p, p.left) / p.avg : null;
      const q = [], done = [];
      mv.forEach(m => {
        if (m.kind === 'in') q.push({ day: m.day, left: inBase(p, m.qty) });
        else if (m.kind === 'sold' || (m.kind === 'adjust' && m.qty < 0)) {
          let need = m.kind === 'sold' ? soldBase(p, m.qty) : -m.qty;
          while (need > 0.0001 && q.length) {
            const b = q[0], take = Math.min(b.left, need); b.left -= take; need -= take;
            if (b.left <= 0.0001) { done.push({ days: dayDiff(b.day, m.day) + 1 }); q.shift(); }
          }
        } else if (m.kind === 'adjust' && m.qty > 0) { if (q.length) q[q.length - 1].left += m.qty; else q.push({ day: m.day, left: m.qty }); }
      });
      p.sellOut = done.length ? done.slice(-3).reduce((a, b) => a + b.days, 0) / Math.min(3, done.length) : null;
      p.selling = q.length > 0;
      p.lastSale = mv.filter(m => m.kind === 'sold').map(m => m.day).pop() || null;
    });
  }

  function render(container, helpers) { H = helpers; root = container; day = day || today(); refresh(); }
  async function refresh(keepScroll) {
    const y = window.scrollY;
    if (!keepScroll) root.innerHTML = '<div class="panel"><div class="empty">Loading canteen…</div></div>';
    try { await load(); } catch (e) { root.innerHTML = `<div class="err">${E(e.message)}</div>`; return; }
    draw(); if (keepScroll) window.scrollTo(0, y);
  }
  const dueBills = (before) => D.billList.filter(b => b.bal > 0.009 && (!before || b.day < before));
  function draw() {
    const due = dueBills().reduce((a, b) => a + b.bal, 0);
    root.innerHTML = `<div class="cn-sub">${[['today', 'Daily sales & bill'], ['stock', 'Add stock'], ['bills', 'Bills & dues' + (due > 0 ? ` <b class="cn-badge">${rs(due)}</b>` : '')], ['reports', 'Reports'], ['insights', 'Insights & restock'], ['products', 'Products']]
      .map(([k, l]) => `<button class="${sub === k ? 'on' : ''}" data-cs="${k}">${l}</button>`).join('')}</div><div id="cnb"></div>`;
    H.$$('[data-cs]', root).forEach(b => b.onclick = () => { sub = b.dataset.cs; draw(); });
    ({ today: vToday, stock: vStock, bills: vBills, reports: vReports, insights: vInsights, products: vProducts })[sub]();
  }
  const box = () => H.$('#cnb', root);
  const act = () => D.products.filter(p => p.active);
  const noProducts = () => `<div class="empty">No products yet. Open <b>Products</b> and add your first item (for example Blue Lays ₹8 → ₹10, or Momos ₹2.5 per piece → ₹30 per plate of 5).</div>`;
  const openDay = d => { day = d; sub = 'today'; draw(); window.scrollTo(0, 0); };

  // ---------------- daily sales & bill ----------------
  function vToday() {
    const ps = act(), dm = D.moves.filter(m => m.day === day && m.kind === 'sold');
    const bill = D.bills[day] || { sale: 0, cost: 0, upi: 0, cash: 0, credit: 0, got: 0, bal: 0, pays: [], status: 'none' };
    const bought = D.moves.filter(m => m.day === day && m.kind === 'in').reduce((a, m) => a + m.qty * m.cost, 0);
    const older = dueBills(day);
    const credOpen = D.credits.filter(c => !c.paid_day);
    box().innerHTML = `${older.length ? `<div class="cn-alert"><b>⚠ Pending from earlier bills:</b> ${older.map(b => `<a href="#" data-od="${b.day}">${rs(b.bal)} from ${nice(b.day)}</a>`).join(' · ')}</div>` : ''}
      <div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">${day === today() ? 'Today' : nice(day)}</h3>
      <div class="f" style="margin:0"><input type="date" id="cday" value="${day}" max="${today()}"></div></div>
      <div class="cn-kpis"><div><small>Sales</small><b>${rs(bill.sale)}</b></div><div><small>Cost of items sold</small><b>${rs(bill.cost)}</b></div>
      <div><small>Profit (earning)</small><b class="ok">${rs(bill.sale - bill.cost)}</b></div><div><small>Stock bought this day</small><b>${rs(bought)}</b></div></div></div>
      <div class="panel"><h3>Enter what was sold</h3><p class="sub">Type pieces, glasses or plates sold. Entries add to anything already saved for this day.</p>
      ${ps.length ? `<div class="tw"><table class="lt cn-t"><thead><tr><th>Product</th><th>In stock</th><th>Price</th><th>Sold</th><th>Amount</th><th>Cost</th><th>Profit</th></tr></thead><tbody>
      ${ps.map(p => `<tr><td><b>${E(p.name)}</b>${p.category ? `<br><small class="muted">${E(p.category)}</small>` : ''}</td><td>${leftText(p)}</td><td>${rs(p.price)} / ${pricePer(p)}</td>
        <td><input class="mk cn-in" data-sold="${p.id}" inputmode="numeric" placeholder="0"> <small class="muted">${sellU(p)}</small></td><td data-amt="${p.id}">–</td><td data-cst="${p.id}">–</td><td data-pft="${p.id}">–</td></tr>`).join('')}
      </tbody></table></div><div class="cn-total" id="ctot"></div><div id="cm"></div><div class="row" style="justify-content:flex-end"><button class="btn gold" id="csave">Save sales</button></div>` : noProducts()}</div>
      ${dm.length ? `<div class="panel"><h3>Sold on ${nice(day)}</h3><div class="tw"><table class="lt"><thead><tr><th>Product</th><th>Sold</th><th>Amount</th><th>Cost</th><th>Profit</th><th></th></tr></thead><tbody>
      ${dm.map(m => { const p = D.byId[m.product_id], c = moveCost(m); return `<tr><td><b>${E(p.name)}</b></td><td>${nf(m.qty, 2)} ${sellU(p, m.qty)}${p.unit === 'plate' ? ` <small class="muted">(${nf(m.qty * N(p), 0)} pcs)</small>` : ''}</td><td>${rs(m.qty * m.price)}</td><td>${rs(c)}</td><td class="ok">${rs(m.qty * m.price - c)}</td><td><button class="btn sm danger" data-del="${m.id}">Delete</button></td></tr>`; }).join('')}
      <tr class="cn-sum"><td><b>Total</b></td><td></td><td><b>${rs(bill.sale)}</b></td><td><b>${rs(bill.cost)}</b></td><td class="ok"><b>${rs(bill.sale - bill.cost)}</b></td><td></td></tr></tbody></table></div></div>` : ''}
      <div class="panel cn-bill"><div class="row" style="justify-content:space-between"><h3 style="margin:0">🧾 Bill for ${nice(day)}</h3>${statusChip(bill)}</div>
      <div class="cn-kpis"><div><small>Staff should give</small><b>${rs(bill.sale)}</b></div><div><small>UPI</small><b>${rs(bill.upi)}</b></div><div><small>Cash</small><b>${rs(bill.cash)}</b></div><div><small>On credit</small><b>${rs(bill.credit)}</b></div>
      <div><small>${bill.bal >= 0 ? 'Still to get' : 'Extra received'}</small><b class="${bill.bal > 0.009 ? 'warn' : 'ok'}">${rs(Math.abs(bill.bal))}</b></div></div>
      ${bill.pays.length ? `<div class="tw" style="margin-top:10px"><table class="lt"><thead><tr><th>Received</th><th>Amount</th><th>Details</th><th></th></tr></thead><tbody>
      ${bill.pays.map(x => `<tr><td><b>${x.kind === 'upi' ? 'UPI' : x.kind === 'cash' ? 'Cash' : 'Credit – ' + E(x.person)}</b>${x.kind !== 'credit' && x.paid_day && x.paid_day !== x.bill_day ? `<br><small class="muted">paid on ${nice(x.paid_day)}</small>` : ''}</td><td>${rs(x.amount)}</td>
        <td>${x.kind === 'credit' ? (x.paid_day ? `<span class="st approved">Paid back ${nice(x.paid_day)}</span>` : '<span class="st submitted">Not paid back yet</span>') : ''}${x.note ? ` <small class="muted">${E(x.note)}</small>` : ''}</td><td><button class="btn sm danger" data-pdel="${x.id}">Delete</button></td></tr>`).join('')}</tbody></table></div>` : ''}
      ${bill.sale > 0 && bill.bal > 0.009 ? `<h3 style="margin:16px 0 6px">${bill.got > 0 ? 'Add the pending payment' : 'Enter money received'}</h3>
      <div class="grid"><div class="f"><label>UPI (₹)</label><input id="pupi" inputmode="decimal" placeholder="0"></div><div class="f"><label>Cash (₹)</label><input id="pcash" inputmode="decimal" placeholder="0"></div>
      <div class="f"><label>Received on</label><input type="date" id="pday" value="${today()}" max="${today()}"></div><div class="f"><label>Note (optional)</label><input id="pnote" placeholder="e.g. rest tomorrow"></div></div>
      <div class="f" style="margin-top:8px"><label>Taken on credit (person and amount)</label><div id="crows"></div><button type="button" class="btn sm" id="cradd">+ Add person</button></div>
      <div class="cn-total" id="ptot"></div><div id="pm"></div><div class="row" style="justify-content:flex-end"><button class="btn ok" id="psave">Save payment</button></div>` : bill.sale > 0 ? '<div class="okmsg" style="margin-top:12px">✓ This bill is all clear.</div>' : '<div class="empty">Enter the day’s sales first; the bill appears here.</div>'}</div>
      ${credOpen.length ? `<div class="panel"><h3>👤 Credit to collect from people</h3><p class="sub">Total ${rs(credOpen.reduce((a, c) => a + c.amount, 0))}. Mark paid in <a href="#" id="gob">Bills &amp; dues</a>.</p></div>` : ''}`;
    H.$('#cday', root).onchange = e => { day = e.target.value || today(); vToday(); };
    H.$$('[data-od]', root).forEach(a => a.onclick = e => { e.preventDefault(); openDay(a.dataset.od); });
    if (H.$('#gob', root)) H.$('#gob', root).onclick = e => { e.preventDefault(); sub = 'bills'; draw(); };
    const upd = () => {
      let ta = 0, tc = 0;
      H.$$('[data-sold]', root).forEach(el => {
        const p = D.byId[+el.dataset.sold], q = +el.value || 0, a = q * p.price, c = q * p.ucost; ta += a; tc += c;
        H.$(`[data-amt="${p.id}"]`, root).textContent = q ? rs(a) : '–'; H.$(`[data-cst="${p.id}"]`, root).textContent = q ? rs(c) : '–'; H.$(`[data-pft="${p.id}"]`, root).textContent = q ? rs(a - c) : '–';
        el.classList.toggle('bad', soldBase(p, q) > p.left + 0.001 || q < 0);
      });
      const t = H.$('#ctot', root); if (t) t.innerHTML = ta ? `Adding: sales <b>${rs(ta)}</b> · cost <b>${rs(tc)}</b> · profit <b class="ok">${rs(ta - tc)}</b>` : '';
    };
    H.$$('[data-sold]', root).forEach(el => el.oninput = upd);
    if (H.$('#csave', root)) H.$('#csave', root).onclick = async () => {
      const entries = H.$$('[data-sold]', root).filter(el => +el.value > 0).map(el => ({ product_id: +el.dataset.sold, kind: 'sold', qty: +el.value, day }));
      const over = entries.find(e => soldBase(D.byId[e.product_id], e.qty) > D.byId[e.product_id].left + 0.001);
      if (over && !confirm(`${D.byId[over.product_id].name}: sold is more than the stock left. Save anyway?`)) return;
      try { await H.api('/canteen/moves', { method: 'POST', body: { entries } }); await refresh(true); } catch (e) { H.toast(H.$('#cm', root), e.message); }
    };
    H.$$('[data-del]', root).forEach(b => b.onclick = async () => { if (confirm('Delete this sale entry?')) { await H.api('/canteen/moves/' + b.dataset.del, { method: 'DELETE' }); refresh(true); } });
    H.$$('[data-pdel]', root).forEach(b => b.onclick = async () => { if (confirm('Delete this payment entry?')) { await H.api('/canteen/payments/' + b.dataset.pdel, { method: 'DELETE' }); refresh(true); } });
    if (!H.$('#psave', root)) return;
    const cr = [];
    const drawCr = () => {
      H.$('#crows', root).innerHTML = cr.map((c, i) => `<div class="ac-row"><div class="f" style="flex:1;min-width:150px"><input data-cn="${i}" value="${E(c.person)}" placeholder="Person’s name"></div><div class="f" style="width:120px"><input data-ca="${i}" value="${c.amount}" inputmode="decimal" placeholder="₹"></div><button type="button" class="xbtn" data-cx="${i}" style="margin-bottom:8px">×</button></div>`).join('');
      H.$$('[data-cn]', root).forEach(el => el.oninput = () => { cr[+el.dataset.cn].person = el.value; });
      H.$$('[data-ca]', root).forEach(el => el.oninput = () => { cr[+el.dataset.ca].amount = el.value; ptot(); });
      H.$$('[data-cx]', root).forEach(el => el.onclick = () => { cr.splice(+el.dataset.cx, 1); drawCr(); ptot(); });
    };
    const ptot = () => {
      const add = (+H.$('#pupi', root).value || 0) + (+H.$('#pcash', root).value || 0) + cr.reduce((a, c) => a + (+c.amount || 0), 0);
      const left = Math.round((bill.bal - add) * 100) / 100;
      H.$('#ptot', root).innerHTML = add ? (left > 0.009 ? `After this: <b class="bad">${rs(left)} still pending</b> – it will be reminded on the next bills` : left < -0.009 ? `After this: <b class="ok">${rs(-left)} extra</b>` : '<b class="ok">✓ All clear</b>') : `To get: <b>${rs(bill.bal)}</b>`;
    };
    H.$('#cradd', root).onclick = () => { cr.push({ person: '', amount: '' }); drawCr(); };
    H.$('#pupi', root).oninput = ptot; H.$('#pcash', root).oninput = ptot; ptot();
    H.$('#psave', root).onclick = async () => {
      try {
        await H.api('/canteen/payments', { method: 'POST', body: { bill_day: day, upi: H.$('#pupi', root).value, cash: H.$('#pcash', root).value, credits: cr, note: H.$('#pnote', root).value, day: H.$('#pday', root).value } });
        await refresh(true);
      } catch (e) { H.toast(H.$('#pm', root), e.message); }
    };
  }

  // ---------------- add stock ----------------
  function vStock() {
    const ps = act();
    const hist = D.moves.filter(m => m.kind === 'in').slice(-40).reverse();
    box().innerHTML = `<div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Stock given to canteen staff</h3>
      <div class="f" style="margin:0"><input type="date" id="sday" value="${today()}" max="${today()}"></div></div>
      <p class="sub">Count packets and pieces in pieces (momos too), and per-glass drinks in bottles. Change the prices here if this stock came at a new price.</p>
      ${ps.length ? `<div class="tw"><table class="lt cn-t"><thead><tr><th>Product</th><th>In stock now</th><th>Giving</th><th>Your cost</th><th>Selling price</th><th>Profit</th></tr></thead><tbody>
      ${ps.map(p => `<tr><td><b>${E(p.name)}</b>${p.unit === 'glass' ? `<br><small class="muted">1 bottle = ${N(p)} glasses</small>` : p.unit === 'plate' ? `<br><small class="muted">1 plate = ${N(p)} pcs</small>` : ''}</td><td>${leftText(p)}</td>
        <td><input class="mk cn-in" data-q="${p.id}" inputmode="numeric" placeholder="0"> <small class="muted">${stockU(p)}</small></td>
        <td>₹<input class="mk cn-in" data-c="${p.id}" value="${p.cost}" inputmode="decimal"> <small class="muted">/${costPer(p)}</small></td>
        <td>₹<input class="mk cn-in" data-p="${p.id}" value="${p.price}" inputmode="decimal"> <small class="muted">/${pricePer(p)}</small></td>
        <td data-pf="${p.id}"></td></tr>`).join('')}</tbody></table></div><div class="cn-total" id="stot"></div><div id="sm"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn gold" id="ssave">Save stock</button></div>` : noProducts()}</div>
      ${hist.length ? `<div class="panel"><h3>Recent stock entries</h3><div class="tw"><table class="lt"><thead><tr><th>Product</th><th>Date</th><th>Quantity</th><th>Cost</th><th>Total cost</th><th></th></tr></thead><tbody>
      ${hist.map(m => { const p = D.byId[m.product_id]; return `<tr><td><b>${E(p.name)}</b></td><td>${nice(m.day)}</td><td>${nf(m.qty, 2)} ${stockU(p, m.qty)}</td><td>${rs(m.cost)} / ${costPer(p)}</td><td>${rs(m.qty * m.cost)}</td><td><button class="btn sm danger" data-sdel="${m.id}">Delete</button></td></tr>`; }).join('')}</tbody></table></div></div>` : ''}`;
    const upd = () => {
      let tc = 0, tv = 0;
      act().forEach(p => {
        const q = +H.$(`[data-q="${p.id}"]`, root).value || 0, c = +H.$(`[data-c="${p.id}"]`, root).value || 0, pr = +H.$(`[data-p="${p.id}"]`, root).value || 0;
        const up = pr - unitCostAt(p, c), sellUnits = baseToSell(p, inBase(p, q));
        H.$(`[data-pf="${p.id}"]`, root).innerHTML = `${rs(up)} / ${pricePer(p)}${q ? `<br><small class="muted">${rs(sellUnits * up)} on this stock</small>` : ''}`;
        tc += q * c; tv += sellUnits * pr;
      });
      H.$('#stot', root).innerHTML = tc ? `Stock cost: <b>${rs(tc)}</b> · Sells for: <b>${rs(tv)}</b> · Profit when sold: <b class="ok">${rs(tv - tc)}</b>` : '';
    };
    if (ps.length) { H.$$('[data-q],[data-c],[data-p]', root).forEach(el => el.oninput = upd); upd(); }
    if (H.$('#ssave', root)) H.$('#ssave', root).onclick = async () => {
      const d = H.$('#sday', root).value || today();
      const entries = act().filter(p => +H.$(`[data-q="${p.id}"]`, root).value > 0).map(p => ({ product_id: p.id, kind: 'in', qty: +H.$(`[data-q="${p.id}"]`, root).value, cost: H.$(`[data-c="${p.id}"]`, root).value, price: H.$(`[data-p="${p.id}"]`, root).value, day: d }));
      try { await H.api('/canteen/moves', { method: 'POST', body: { entries } }); await refresh(true); } catch (e) { H.toast(H.$('#sm', root), e.message); }
    };
    H.$$('[data-sdel]', root).forEach(b => b.onclick = async () => { if (confirm('Delete this stock entry?')) { await H.api('/canteen/moves/' + b.dataset.sdel, { method: 'DELETE' }); refresh(true); } });
  }

  // ---------------- bills & dues ----------------
  function vBills() {
    const due = dueBills(), dueAmt = due.reduce((a, b) => a + b.bal, 0);
    const open = D.credits.filter(c => !c.paid_day), paid = D.credits.filter(c => c.paid_day).slice(-30).reverse();
    const byPerson = {}; open.forEach(c => { byPerson[c.person] = (byPerson[c.person] || 0) + c.amount; });
    box().innerHTML = `<div class="panel"><h3>Money still to get</h3><div class="cn-kpis"><div><small>Pending from staff (bills)</small><b class="${dueAmt > 0 ? 'warn' : 'ok'}">${rs(dueAmt)}</b></div><div><small>Credit to collect from people</small><b class="${open.length ? 'warn' : 'ok'}">${rs(open.reduce((a, c) => a + c.amount, 0))}</b></div><div><small>Bills not clear</small><b>${due.length}</b></div></div></div>
      <div class="panel"><h3>👤 Credit (taken by a person)</h3>${open.length ? `<p class="sub">${Object.entries(byPerson).map(([n, a]) => `<b>${E(n)}</b>: ${rs(a)}`).join(' · ')}</p><div class="tw"><table class="lt"><thead><tr><th>Person</th><th>Amount</th><th>From bill</th><th></th></tr></thead><tbody>
      ${open.map(c => `<tr><td><b>${E(c.person)}</b></td><td>${rs(c.amount)}</td><td><a href="#" data-od="${c.bill_day}">${nice(c.bill_day)}</a></td><td><div class="row" style="justify-content:flex-end;flex-wrap:nowrap"><button class="btn sm" data-cp="${c.id}|upi">Paid by UPI</button><button class="btn sm" data-cp="${c.id}|cash">Paid in cash</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="okmsg">No one owes the canteen money.</div>'}
      ${paid.length ? `<details style="margin-top:10px"><summary>Paid back (${paid.length})</summary><div class="tw"><table class="lt"><thead><tr><th>Person</th><th>Amount</th><th>From bill</th><th>Paid</th><th></th></tr></thead><tbody>${paid.map(c => `<tr><td>${E(c.person)}</td><td>${rs(c.amount)}</td><td>${nice(c.bill_day)}</td><td>${nice(c.paid_day)} · ${c.paid_mode === 'upi' ? 'UPI' : 'Cash'}</td><td><button class="btn sm" data-cu="${c.id}">Undo</button></td></tr>`).join('')}</tbody></table></div></details>` : ''}</div>
      <div class="panel"><h3>🧾 All bills</h3>${D.billList.length ? `<div class="tw"><table class="lt"><thead><tr><th>Date</th><th>Should give</th><th>UPI</th><th>Cash</th><th>Credit</th><th>Cost</th><th>Profit</th><th>Status</th><th></th></tr></thead><tbody>
      ${D.billList.map(b => `<tr><td><b>${nice(b.day)}</b></td><td>${rs(b.sale)}</td><td>${rs(b.upi)}</td><td>${rs(b.cash)}</td><td>${rs(b.credit)}</td><td>${rs(b.cost)}</td><td class="ok">${rs(b.sale - b.cost)}</td><td>${statusChip(b)}</td><td><button class="btn sm" data-od="${b.day}">Open</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No bills yet.</div>'}</div>`;
    H.$$('[data-od]', root).forEach(a => a.onclick = e => { e.preventDefault(); openDay(a.dataset.od); });
    H.$$('[data-cp]', root).forEach(b => b.onclick = async () => { const [id, mode] = b.dataset.cp.split('|'); await H.api(`/canteen/payments/${id}/paid`, { method: 'POST', body: { mode, day: today() } }); refresh(true); });
    H.$$('[data-cu]', root).forEach(b => b.onclick = async () => { await H.api(`/canteen/payments/${b.dataset.cu}/paid`, { method: 'DELETE' }); refresh(true); });
  }

  // ---------------- reports ----------------
  function range() {
    const t = today(), d = new Date(t + 'T00:00:00');
    const mStart = iso(new Date(d.getFullYear(), d.getMonth(), 1));
    const R = {
      today: [t, t], yesterday: [addDays(t, -1), addDays(t, -1)], week: [addDays(t, -((d.getDay() + 6) % 7)), t], month: [mStart, t],
      lastmonth: [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))], year: [iso(new Date(d.getFullYear(), 0, 1)), t],
      custom: [rp.from || mStart, rp.to || t],
    };
    return R[rp.k];
  }
  function vReports() {
    const [from, to] = range();
    const sold = D.moves.filter(m => m.kind === 'sold' && m.day >= from && m.day <= to);
    const bought = D.moves.filter(m => m.kind === 'in' && m.day >= from && m.day <= to).reduce((a, m) => a + m.qty * m.cost, 0);
    const sale = sold.reduce((a, m) => a + m.qty * m.price, 0), cost = sold.reduce((a, m) => a + moveCost(m), 0);
    const bl = D.billList.filter(b => b.day >= from && b.day <= to);
    const upi = bl.reduce((a, b) => a + b.upi, 0), cash = bl.reduce((a, b) => a + b.cash, 0), credit = bl.reduce((a, b) => a + b.credit, 0), pend = bl.reduce((a, b) => a + Math.max(0, b.bal), 0);
    const prows = act().concat(D.products.filter(p => !p.active)).map(p => {
      const s = sold.filter(m => m.product_id === p.id); const q = s.reduce((a, m) => a + m.qty, 0), a = s.reduce((x, m) => x + m.qty * m.price, 0), c = s.reduce((x, m) => x + moveCost(m), 0);
      return { p, q, a, c, pr: a - c };
    }).filter(r => r.q > 0).sort((x, y) => y.pr - x.pr);
    box().innerHTML = `<div class="panel"><h3>Report</h3><div class="cn-sub" style="margin:8px 0">${[['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['lastmonth', 'Last month'], ['year', 'This year'], ['custom', 'Custom']].map(([k, l]) => `<button class="${rp.k === k ? 'on' : ''}" data-rk="${k}">${l}</button>`).join('')}</div>
      ${rp.k === 'custom' ? `<div class="row"><div class="f"><label>From</label><input type="date" id="rf" value="${from}" max="${today()}"></div><div class="f"><label>To</label><input type="date" id="rt" value="${to}" max="${today()}"></div></div>` : ''}
      <p class="sub" style="margin-top:6px">${nice(from)}${from !== to ? ' – ' + nice(to) : ''} · ${bl.filter(b => b.sale > 0).length} canteen day(s)</p>
      <div class="cn-kpis"><div><small>Sales</small><b>${rs(sale)}</b></div><div><small>Cost of items sold</small><b>${rs(cost)}</b></div><div><small>Profit (earning)</small><b class="ok">${rs(sale - cost)}</b></div><div><small>Profit margin</small><b>${sale ? nf((sale - cost) / sale * 100) : 0}%</b></div>
      <div><small>Received by UPI</small><b>${rs(upi)}</b></div><div><small>Received in cash</small><b>${rs(cash)}</b></div><div><small>Given on credit</small><b>${rs(credit)}</b></div><div><small>Still pending (these bills)</small><b class="${pend > 0 ? 'warn' : 'ok'}">${rs(pend)}</b></div><div><small>Stock bought</small><b>${rs(bought)}</b></div></div>
      <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn sm" id="rcsv">⬇ Download (Excel / CSV)</button></div></div>
      <div class="panel"><h3>By product</h3>${prows.length ? `<div class="tw"><table class="lt"><thead><tr><th>Product</th><th>Sold</th><th>Sales</th><th>Cost</th><th>Profit</th><th>Profit / unit</th></tr></thead><tbody>
      ${prows.map(r => `<tr><td><b>${E(r.p.name)}</b></td><td>${nf(r.q, 2)} ${sellU(r.p, r.q)}</td><td>${rs(r.a)}</td><td>${rs(r.c)}</td><td class="ok">${rs(r.pr)}</td><td>${rs(r.pr / r.q)} / ${sellU(r.p, 1)}</td></tr>`).join('')}
      <tr class="cn-sum"><td><b>Total</b></td><td></td><td><b>${rs(sale)}</b></td><td><b>${rs(cost)}</b></td><td class="ok"><b>${rs(sale - cost)}</b></td><td></td></tr></tbody></table></div>` : '<div class="empty">No sales in this period.</div>'}</div>
      <div class="panel"><h3>By day</h3>${bl.length ? `<div class="tw"><table class="lt"><thead><tr><th>Date</th><th>Sales</th><th>Cost</th><th>Profit</th><th>UPI</th><th>Cash</th><th>Credit</th><th>Status</th></tr></thead><tbody>
      ${bl.map(b => `<tr><td><a href="#" data-od="${b.day}"><b>${nice(b.day)}</b></a></td><td>${rs(b.sale)}</td><td>${rs(b.cost)}</td><td class="ok">${rs(b.sale - b.cost)}</td><td>${rs(b.upi)}</td><td>${rs(b.cash)}</td><td>${rs(b.credit)}</td><td>${statusChip(b)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No bills in this period.</div>'}</div>`;
    H.$$('[data-rk]', root).forEach(b => b.onclick = () => { rp.k = b.dataset.rk; if (rp.k === 'custom' && !rp.from) { rp.from = from; rp.to = to; } vReports(); });
    if (H.$('#rf', root)) { H.$('#rf', root).onchange = e => { rp.from = e.target.value; vReports(); }; H.$('#rt', root).onchange = e => { rp.to = e.target.value; vReports(); }; }
    H.$$('[data-od]', root).forEach(a => a.onclick = e => { e.preventDefault(); openDay(a.dataset.od); });
    H.$('#rcsv', root).onclick = () => {
      const q = v => `"${String(v).replace(/"/g, '""')}"`, r2 = v => (Math.round(v * 100) / 100).toFixed(2);
      const lines = [[`Canteen report ${from} to ${to} (INR)`], [], ['Sales', r2(sale)], ['Cost of items sold', r2(cost)], ['Profit', r2(sale - cost)], ['UPI', r2(upi)], ['Cash', r2(cash)], ['Credit', r2(credit)], ['Pending', r2(pend)], ['Stock bought', r2(bought)], [],
        ['Product', 'Sold', 'Unit', 'Sales', 'Cost', 'Profit'], ...prows.map(r => [r.p.name, r.q, sellU(r.p, r.q), r2(r.a), r2(r.c), r2(r.pr)]), [],
        ['Date', 'Sales', 'Cost', 'Profit', 'UPI', 'Cash', 'Credit', 'Balance'], ...bl.map(b => [b.day, r2(b.sale), r2(b.cost), r2(b.sale - b.cost), r2(b.upi), r2(b.cash), r2(b.credit), r2(b.bal)])];
      const blob = new Blob(['﻿' + lines.map(l => l.map(q).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `canteen-${from}-to-${to}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
  }

  // ---------------- insights & restock ----------------
  function vInsights() {
    const ps = act();
    if (!ps.length) { box().innerHTML = `<div class="panel">${noProducts()}</div>`; return; }
    const rev = ps.reduce((a, p) => a + p.pRev, 0), prof = ps.reduce((a, p) => a + p.pProfit, 0);
    const sold = ps.filter(p => p.pQty > 0);
    const byRev = [...sold].sort((a, b) => b.pRev - a.pRev), byProfit = [...sold].sort((a, b) => b.pProfit - a.pProfit);
    const maxRev = byRev.length ? byRev[0].pRev : 1;
    const slow = ps.filter(p => p.left > 0 && (p.pQty === 0 || (p.lastsDays != null && p.lastsDays > 20))).sort((a, b) => (b.lastsDays ?? 1e9) - (a.lastsDays ?? 1e9));
    const plan = ps.map(p => {
      const needSell = p.avg * planDays, needBase = p.unit === 'plate' ? needSell * N(p) : needSell, addBase = Math.max(0, needBase - p.left);
      const addUnits = p.unit === 'glass' ? Math.ceil(addBase / N(p)) : Math.ceil(addBase);
      return { p, needSell, addUnits, cost: addUnits * p.cost };
    }).filter(x => x.p.avg > 0).sort((a, b) => b.p.avg - a.p.avg);
    const planCost = plan.reduce((a, x) => a + x.cost, 0);
    const speed = p => p.sellOut != null ? `${nf(p.sellOut, 0)} day${Math.round(p.sellOut) === 1 ? '' : 's'}` : (p.selling && p.avg ? 'Selling…' : '–');
    const needTxt = x => x.p.unit === 'glass' ? `${nf(x.needSell, 0)} gl (≈${nf(x.needSell / N(x.p))} btl)` : x.p.unit === 'plate' ? `${nf(x.needSell, 0)} plates (${nf(x.needSell * N(x.p), 0)} pcs)` : `${nf(x.needSell, 0)} pcs`;
    box().innerHTML = `<div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">How the canteen is doing</h3>
      <div class="f" style="margin:0"><select id="cper">${[7, 15, 30, 60, 90].map(d => `<option value="${d}" ${d === period ? 'selected' : ''}>Last ${d} days</option>`).join('')}</select></div></div>
      <div class="cn-kpis"><div><small>Sales</small><b>${rs(rev)}</b></div><div><small>Profit</small><b class="ok">${rs(prof)}</b></div><div><small>Canteen days</small><b>${D.openDays}</b></div><div><small>Average profit / day</small><b>${rs(D.openDays ? prof / D.openDays : 0)}</b></div></div></div>
      <div class="panel"><h3>❤️ What students love most</h3>${byRev.length ? `<div class="cn-bars">${byRev.slice(0, 10).map((p, i) => `<div class="cn-bar"><span class="n">${i + 1}. ${E(p.name)}</span><span class="b"><i style="width:${Math.max(4, p.pRev / maxRev * 100)}%"></i></span><span class="v">${nf(p.pQty, 0)} ${sellU(p, p.pQty)} · ${rs(p.pRev)}</span></div>`).join('')}</div>` : '<div class="empty">No sales in this period yet.</div>'}
      ${byProfit.length ? `<p class="sub" style="margin-top:12px">Most profit: ${byProfit.slice(0, 3).map(p => `<b>${E(p.name)}</b> (${rs(p.pProfit)})`).join(', ')}</p>` : ''}</div>
      <div class="panel"><h3>📦 Restock planner</h3><div class="row"><span>I want stock for</span><input id="pdays" class="mk" style="width:70px" inputmode="numeric" value="${planDays}"><span>canteen days</span></div>
      <p class="sub">Based on the average daily sale in the selected period. Glass drinks are shown in bottles, momos and pieces in pieces.</p>
      ${plan.length ? `<div class="tw"><table class="lt"><thead><tr><th>Product</th><th>Sells per day</th><th>Need for ${planDays} days</th><th>In stock</th><th>Add now</th><th>Cost</th></tr></thead><tbody>
      ${plan.map(x => `<tr><td><b>${E(x.p.name)}</b></td><td>${nf(x.p.avg)} ${sellU(x.p)}</td><td>${needTxt(x)}</td><td>${leftText(x.p)}</td>
        <td>${x.addUnits ? `<b>${x.addUnits} ${stockU(x.p, x.addUnits)}</b>` : '<span class="st approved">Enough</span>'}</td><td>${x.addUnits ? rs(x.cost) : '–'}</td></tr>`).join('')}
      </tbody></table></div><div class="cn-total">Total to buy: <b>${rs(planCost)}</b></div>` : '<div class="empty">Enter a few days of sales first, then the planner can suggest quantities.</div>'}</div>
      <div class="panel"><h3>⏱ Selling speed</h3><p class="sub">“Batch sells out in” = average days a stock you gave took to finish (last 3 batches).</p><div class="tw"><table class="lt"><thead><tr><th>Product</th><th>Sells per day</th><th>In stock</th><th>Stock lasts</th><th>Batch sells out in</th><th>Last sold</th></tr></thead><tbody>
      ${[...ps].sort((a, b) => b.avg - a.avg).map(p => `<tr><td><b>${E(p.name)}</b></td><td>${p.avg ? nf(p.avg) + ' ' + sellU(p) : '–'}</td><td>${leftText(p)}</td>
        <td>${p.lastsDays != null ? `<span class="${p.lastsDays < 2 ? 'bad' : ''}">${nf(p.lastsDays)} days</span>` : (p.left > 0 ? 'No sales yet' : '<span class="bad">Out of stock</span>')}</td><td>${speed(p)}</td><td>${p.lastSale ? nice(p.lastSale) : '–'}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="panel"><h3>🐢 Slow / not selling – don’t restock</h3>${slow.length ? `<div class="tw"><table class="lt"><thead><tr><th>Product</th><th>Sold in period</th><th>In stock</th><th>Advice</th></tr></thead><tbody>
      ${slow.map(p => `<tr><td><b>${E(p.name)}</b></td><td>${nf(p.pQty, 0)} ${sellU(p, p.pQty)}</td><td>${leftText(p)}</td><td>${p.pQty === 0 ? '<span class="bad">Not selling – stop buying, clear stock</span>' : `Enough for ${nf(p.lastsDays, 0)} days – don’t restock yet`}</td></tr>`).join('')}</tbody></table></div>` : '<div class="okmsg">Everything in stock is selling well.</div>'}
      ${ps.filter(p => p.left <= 0 && p.avg > 0).length ? `<p class="sub" style="margin-top:10px"><b>Out of stock but selling:</b> ${ps.filter(p => p.left <= 0 && p.avg > 0).map(p => E(p.name)).join(', ')}</p>` : ''}</div>`;
    H.$('#cper', root).onchange = e => { period = +e.target.value; analyse(); vInsights(); };
    H.$('#pdays', root).onchange = e => { planDays = Math.max(1, Math.min(60, Math.round(+e.target.value || 5))); vInsights(); };
  }

  // ---------------- products ----------------
  function vProducts() {
    box().innerHTML = `<div class="panel"><div class="row" style="justify-content:space-between;margin-bottom:10px"><h3 style="margin:0">Products</h3><button class="btn gold" id="padd">+ Add product</button></div>
      ${D.products.length ? `<div class="tw"><table class="lt"><thead><tr><th>Product</th><th>Type</th><th>Your cost</th><th>Selling price</th><th>Profit</th><th>In stock</th><th></th></tr></thead><tbody>
      ${D.products.map(p => `<tr style="${p.active ? '' : 'opacity:.55'}"><td><b>${E(p.name)}</b>${p.category ? `<br><small class="muted">${E(p.category)}</small>` : ''}${p.active ? '' : ' <small>(hidden)</small>'}</td>
        <td>${p.unit === 'glass' ? `Per glass<br><small class="muted">1 bottle = ${N(p)} glasses</small>` : p.unit === 'plate' ? `Per plate<br><small class="muted">1 plate = ${N(p)} pcs</small>` : 'Per piece'}</td>
        <td>${rs(p.cost)} / ${costPer(p)}${p.unit !== 'piece' ? `<br><small class="muted">${rs(p.ucost)} / ${sellU(p, 1)}</small>` : ''}</td>
        <td>${rs(p.price)} / ${pricePer(p)}</td><td class="${p.uprofit < 0 ? 'bad' : 'ok'}">${rs(p.uprofit)} / ${sellU(p, 1)}${p.unit === 'glass' ? `<br><small class="muted">${rs(p.uprofit * N(p))} / bottle</small>` : ''}</td>
        <td>${leftText(p)}</td><td><button class="btn sm" data-pe="${p.id}">Edit</button></td></tr>`).join('')}</tbody></table></div>` : noProducts()}</div>`;
    H.$('#padd', root).onclick = () => form(null);
    H.$$('[data-pe]', root).forEach(b => b.onclick = () => form(D.byId[+b.dataset.pe]));
  }
  function form(p) {
    const isNew = !p; p = p || { unit: 'piece', active: 1, cost: '', price: '', per_bottle: '' };
    const m = H.modal(`<div class="mh"><h2>${isNew ? 'Add product' : 'Edit ' + E(p.name)}</h2><button class="btn" id="fcl">Close</button></div>
      <div class="grid"><div class="f"><label>Product name *</label><input id="fn" value="${E(p.name || '')}" placeholder="Blue Lays / Momos / Samosa"></div>
      <div class="f"><label>Category</label><input id="fc" value="${E(p.category || '')}" placeholder="Chips / Drinks / Snacks"></div>
      <div class="f"><label>How is it sold?</label><select id="fu">
        <option value="piece" ${p.unit === 'piece' ? 'selected' : ''}>Per piece (packet, bottle, samosa)</option>
        <option value="plate" ${p.unit === 'plate' ? 'selected' : ''}>Per plate (bought per piece, e.g. momos)</option>
        <option value="glass" ${p.unit === 'glass' ? 'selected' : ''}>Per glass (from a big bottle)</option></select></div>
      <div class="f" id="fpbw"><label id="fpbl">How many</label><input id="fpb" inputmode="numeric" value="${p.per_bottle || ''}" placeholder="5"></div>
      <div class="f"><label id="fcl2">Your cost price (₹)</label><input id="fco" inputmode="decimal" value="${p.cost}"></div>
      <div class="f"><label id="fpl">Selling price (₹)</label><input id="fpr" inputmode="decimal" value="${p.price}"></div>
      ${!isNew ? `<div class="f"><label>Show in lists?</label><select id="fa"><option value="1" ${p.active ? 'selected' : ''}>Yes</option><option value="0" ${!p.active ? 'selected' : ''}>No – hide (stopped selling)</option></select></div>` : ''}</div>
      <div class="cn-total" id="fcalc"></div>
      ${!isNew ? `<div class="f" style="margin-top:10px"><label>Stock correction (damaged, expired, counting error)</label><div class="row"><input id="fadj" class="mk" style="width:110px" inputmode="numeric" placeholder="-2"><span class="muted" id="fadju"></span><button class="btn sm" id="fadjb">Apply</button></div><div class="hint">Use minus for less stock (e.g. -2), plus for more.</div></div>` : ''}
      <div id="fm"></div><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn pri" id="fsv">${isNew ? 'Add product' : 'Save'}</button></div>`);
    const calc = () => {
      const u = H.$('#fu', m).value, n = +H.$('#fpb', m).value || 0, c = +H.$('#fco', m).value || 0, pr = +H.$('#fpr', m).value || 0;
      H.$('#fpbw', m).style.display = u === 'piece' ? 'none' : '';
      H.$('#fpbl', m).textContent = u === 'glass' ? 'Glasses in one bottle *' : 'Pieces in one plate *';
      H.$('#fcl2', m).textContent = u === 'glass' ? 'Your cost per bottle (₹)' : 'Your cost per piece (₹)';
      H.$('#fpl', m).textContent = u === 'glass' ? 'Selling price per glass (₹)' : u === 'plate' ? 'Selling price per plate (₹)' : 'Selling price per piece (₹)';
      if (H.$('#fadju', m)) H.$('#fadju', m).textContent = u === 'glass' ? 'glasses' : 'pcs';
      const uc = u === 'glass' ? (n ? c / n : 0) : u === 'plate' ? c * n : c, up = pr - uc;
      H.$('#fcalc', m).innerHTML = !(c || pr) ? '' : u === 'glass' ? `Cost per glass <b>${rs(uc)}</b> · Profit per glass <b class="${up < 0 ? 'bad' : 'ok'}">${rs(up)}</b> · Profit per bottle <b>${rs(up * n)}</b>`
        : u === 'plate' ? `Cost per plate <b>${rs(uc)}</b> (${n} × ${rs(c)}) · Profit per plate <b class="${up < 0 ? 'bad' : 'ok'}">${rs(up)}</b>${uc ? ` (${nf(up / uc * 100, 0)}% on cost)` : ''}`
        : `Profit per piece <b class="${up < 0 ? 'bad' : 'ok'}">${rs(up)}</b>${c ? ` (${nf(up / c * 100, 0)}% on cost)` : ''}`;
    };
    H.$$('#fpb,#fco,#fpr', m).forEach(el => el.oninput = calc); H.$('#fu', m).onchange = calc; calc();
    H.$('#fcl', m).onclick = H.closeModal;
    H.$('#fsv', m).onclick = async () => {
      const body = { name: H.$('#fn', m).value, category: H.$('#fc', m).value, unit: H.$('#fu', m).value, per_bottle: H.$('#fpb', m).value, cost: H.$('#fco', m).value, price: H.$('#fpr', m).value };
      if (!isNew) body.active = H.$('#fa', m).value === '1';
      try { await H.api(isNew ? '/canteen/products' : '/canteen/products/' + p.id, { method: isNew ? 'POST' : 'PUT', body }); H.closeModal(); refresh(true); }
      catch (e) { H.toast(H.$('#fm', m), e.message); }
    };
    if (!isNew) H.$('#fadjb', m).onclick = async () => {
      const q = +H.$('#fadj', m).value; if (!q) return;
      try { await H.api('/canteen/moves', { method: 'POST', body: { entries: [{ product_id: p.id, kind: 'adjust', qty: q, day: today(), note: 'Stock correction' }] } }); H.closeModal(); refresh(true); }
      catch (e) { H.toast(H.$('#fm', m), e.message); }
    };
  }

  window.Canteen = { render };
})();
