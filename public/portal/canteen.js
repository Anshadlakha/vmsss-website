// School canteen panel (main admin only).
// Piece products: stock and sales counted in pieces. Glass products: stock in bottles, sales in glasses.
(function () {
  let H, root, D, sub = 'today', day = '', period = 30, planDays = 5;
  const rs = n => '₹' + (Math.round((+n || 0) * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const nf = (n, d = 1) => (Math.round((+n || 0) * 10 ** d) / 10 ** d).toLocaleString('en-IN');
  const iso = dt => { const z = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
  const today = () => iso(new Date());
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
  const dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 864e5);
  const nice = s => new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const isG = p => p.unit === 'glass';
  const uName = (p, n) => isG(p) ? (n === 1 ? 'glass' : 'glasses') : (n === 1 ? 'pc' : 'pcs');
  const unitCost = p => isG(p) ? (p.per_bottle ? p.cost / p.per_bottle : 0) : p.cost;
  const leftText = p => {
    if (!isG(p)) return `${nf(p.left, 0)} pcs`;
    if (!p.per_bottle) return `${nf(p.left, 0)} glasses`;
    const b = Math.floor(p.left / p.per_bottle), g = Math.round(p.left - b * p.per_bottle);
    if (p.left <= 0) return '0 glasses';
    return `${nf(p.left, 0)} glasses <small class="muted">(${b ? `${b} bottle${b === 1 ? '' : 's'}${g ? ' + ' + g + ' gl' : ''}` : 'part bottle'})</small>`;
  };

  async function load() {
    D = await H.api('/canteen/state');
    const tot = Object.fromEntries(D.totals.map(t => [t.product_id, t]));
    D.byId = {};
    D.products.forEach(p => {
      const t = tot[p.id] || {}; p.qin = +t.qin || 0; p.qsold = +t.qsold || 0; p.qadj = +t.qadj || 0;
      p.left = (isG(p) ? p.qin * p.per_bottle : p.qin) - p.qsold + p.qadj;
      p.ucost = unitCost(p); p.uprofit = p.price - p.ucost;
      D.byId[p.id] = p;
    });
    analyse();
  }

  // sales speed, sell-out days per stock batch, best/slow sellers
  function analyse() {
    const from = addDays(today(), -(period - 1));
    const openDays = new Set(D.moves.filter(m => m.kind === 'sold' && m.day >= from).map(m => m.day));
    D.openDays = openDays.size;
    D.products.forEach(p => {
      const mv = D.moves.filter(m => m.product_id === p.id);
      const sold = mv.filter(m => m.kind === 'sold' && m.day >= from);
      p.pQty = sold.reduce((a, m) => a + m.qty, 0);
      p.pRev = sold.reduce((a, m) => a + m.qty * m.price, 0);
      p.pProfit = sold.reduce((a, m) => a + m.qty * (m.price - (isG(p) ? (p.per_bottle ? m.cost / p.per_bottle : 0) : m.cost)), 0);
      p.avg = D.openDays ? p.pQty / D.openDays : 0;
      p.lastsDays = p.avg > 0 ? p.left / p.avg : null;
      // FIFO through stock batches to see how many days each batch took to sell out
      const q = [], done = [];
      mv.forEach(m => {
        if (m.kind === 'in') q.push({ day: m.day, left: isG(p) ? m.qty * p.per_bottle : m.qty, size: m.qty });
        else if (m.kind === 'sold' || (m.kind === 'adjust' && m.qty < 0)) {
          let need = Math.abs(m.qty);
          while (need > 0 && q.length) {
            const b = q[0], take = Math.min(b.left, need); b.left -= take; need -= take;
            if (b.left <= 0.0001) { done.push({ from: b.day, to: m.day, days: dayDiff(b.day, m.day) + 1, size: b.size }); q.shift(); }
          }
        } else if (m.kind === 'adjust' && m.qty > 0) { if (q.length) q[q.length - 1].left += m.qty; else q.push({ day: m.day, left: m.qty, size: 0 }); }
      });
      p.batches = done; p.openBatch = q[0] || null;
      p.sellOut = done.length ? done.slice(-3).reduce((a, b) => a + b.days, 0) / Math.min(3, done.length) : null;
      p.lastSale = mv.filter(m => m.kind === 'sold').map(m => m.day).pop() || null;
    });
  }

  function render(container, helpers) { H = helpers; root = container; day = day || today(); refresh(); }
  async function refresh() {
    root.innerHTML = '<div class="panel"><div class="empty">Loading canteen…</div></div>';
    try { await load(); } catch (e) { root.innerHTML = `<div class="err">${H.esc(e.message)}</div>`; return; }
    draw();
  }
  function draw() {
    const pend = D.pending.reduce((a, m) => a + m.qty * m.price, 0);
    root.innerHTML = `<div class="cn-sub">${[['today', 'Daily sales'], ['stock', 'Add stock'], ['money', 'Money from staff' + (pend > 0 ? ` <b class="cn-badge">${rs(pend)}</b>` : '')], ['insights', 'Insights & restock'], ['products', 'Products']]
      .map(([k, l]) => `<button class="${sub === k ? 'on' : ''}" data-cs="${k}">${l}</button>`).join('')}</div><div id="cnb"></div>`;
    H.$$('[data-cs]', root).forEach(b => b.onclick = () => { sub = b.dataset.cs; draw(); });
    ({ today: vToday, stock: vStock, money: vMoney, insights: vInsights, products: vProducts })[sub]();
  }
  const box = () => H.$('#cnb', root);
  const act = () => D.products.filter(p => p.active);
  const noProducts = () => `<div class="empty">No products yet. Open <b>Products</b> and add your first item (for example Blue Lays, ₹10).</div>`;

  // ---------------- daily sales ----------------
  function vToday() {
    const ps = act(), dm = D.moves.filter(m => m.day === day && m.kind === 'sold');
    const rev = dm.reduce((a, m) => a + m.qty * m.price, 0);
    const prof = dm.reduce((a, m) => { const p = D.byId[m.product_id]; return a + m.qty * (m.price - (isG(p) ? m.cost / p.per_bottle : m.cost)); }, 0);
    const dueDay = dm.filter(m => !m.received).reduce((a, m) => a + m.qty * m.price, 0);
    const pend = D.pending.reduce((a, m) => a + m.qty * m.price, 0);
    box().innerHTML = `<div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Sales on ${nice(day)}</h3>
      <div class="f" style="margin:0"><input type="date" id="cday" value="${day}" max="${today()}"></div></div>
      <div class="cn-kpis"><div><small>Sold (this day)</small><b>${rs(rev)}</b></div><div><small>Your profit (this day)</small><b class="ok">${rs(prof)}</b></div>
      <div><small>Staff should give (this day)</small><b>${rs(dueDay)}</b></div><div><small>Total pending from staff</small><b class="${pend > 0 ? 'warn' : ''}">${rs(pend)}</b></div></div></div>
      <div class="panel"><h3>Enter what was sold</h3><p class="sub">Type the number of pieces (or glasses) the staff sold. The amount and stock left update by themselves.</p>
      ${ps.length ? `<div class="tw"><table class="lt cn-t"><thead><tr><th>Product</th><th>In stock</th><th>Selling price</th><th>Sold</th><th>Amount</th></tr></thead><tbody>
      ${ps.map(p => `<tr><td><b>${H.esc(p.name)}</b>${p.category ? `<br><small class="muted">${H.esc(p.category)}</small>` : ''}</td><td>${leftText(p)}</td><td>${rs(p.price)} / ${isG(p) ? 'glass' : 'pc'}</td>
        <td><input class="mk cn-in" data-sold="${p.id}" inputmode="numeric" placeholder="0"> <small class="muted">${isG(p) ? 'glasses' : 'pcs'}</small></td><td data-amt="${p.id}">–</td></tr>`).join('')}
      </tbody></table></div><div class="cn-total" id="ctot"></div><div id="cm"></div><div class="row" style="justify-content:flex-end"><button class="btn gold" id="csave">Save sales for ${nice(day)}</button></div>` : noProducts()}</div>
      ${dm.length ? `<div class="panel"><h3>Already saved for ${nice(day)}</h3><div class="tw"><table class="lt"><thead><tr><th>Product</th><th>Sold</th><th>Amount</th><th>Profit</th><th>Payment</th><th></th></tr></thead><tbody>
      ${dm.map(m => { const p = D.byId[m.product_id]; return `<tr><td><b>${H.esc(p.name)}</b></td><td>${nf(m.qty, 2)} ${uName(p, m.qty)}</td><td>${rs(m.qty * m.price)}</td><td>${rs(m.qty * (m.price - (isG(p) ? m.cost / p.per_bottle : m.cost)))}</td>
        <td>${m.received ? '<span class="st approved">Received</span>' : '<span class="st submitted">Pending</span>'}</td><td>${m.received ? '' : `<button class="btn sm danger" data-del="${m.id}">Delete</button>`}</td></tr>`; }).join('')}</tbody></table></div></div>` : ''}`;
    H.$('#cday', root).onchange = e => { day = e.target.value || today(); vToday(); };
    const upd = () => {
      let tq = 0, ta = 0, tp = 0;
      H.$$('[data-sold]', root).forEach(el => {
        const p = D.byId[+el.dataset.sold], q = +el.value || 0; tq += q; ta += q * p.price; tp += q * p.uprofit;
        H.$(`[data-amt="${p.id}"]`, root).textContent = q ? rs(q * p.price) : '–';
        el.classList.toggle('bad', q > p.left + 0.001 || q < 0);
      });
      const t = H.$('#ctot', root); if (t) t.innerHTML = tq ? `Total: <b>${rs(ta)}</b> · Profit <b>${rs(tp)}</b>` : '';
    };
    H.$$('[data-sold]', root).forEach(el => el.oninput = upd);
    if (H.$('#csave', root)) H.$('#csave', root).onclick = async () => {
      const entries = H.$$('[data-sold]', root).filter(el => +el.value > 0).map(el => ({ product_id: +el.dataset.sold, kind: 'sold', qty: +el.value, day }));
      const over = entries.find(e => e.qty > D.byId[e.product_id].left + 0.001);
      if (over && !confirm(`${D.byId[over.product_id].name}: sold is more than the stock left. Save anyway?`)) return;
      try { await H.api('/canteen/moves', { method: 'POST', body: { entries } }); await refresh(); } catch (e) { H.toast(H.$('#cm', root), e.message); }
    };
    H.$$('[data-del]', root).forEach(b => b.onclick = async () => { if (confirm('Delete this sale entry?')) { await H.api('/canteen/moves/' + b.dataset.del, { method: 'DELETE' }); refresh(); } });
  }

  // ---------------- add stock ----------------
  function vStock() {
    const ps = act(), sday = H.$('#sday', root) ? H.$('#sday', root).value : today();
    const hist = D.moves.filter(m => m.kind === 'in').slice(-40).reverse();
    box().innerHTML = `<div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Stock given to canteen staff</h3>
      <div class="f" style="margin:0"><input type="date" id="sday" value="${sday}" max="${today()}"></div></div>
      <p class="sub">Enter how many you are giving. Packets/bottles are counted in pieces; per-glass drinks are counted in bottles. Change the prices if this stock came at a new price.</p>
      ${ps.length ? `<div class="tw"><table class="lt cn-t"><thead><tr><th>Product</th><th>In stock now</th><th>Giving</th><th>Your cost</th><th>Selling price</th><th>Profit</th></tr></thead><tbody>
      ${ps.map(p => `<tr><td><b>${H.esc(p.name)}</b>${isG(p) ? `<br><small class="muted">1 bottle = ${p.per_bottle} glasses</small>` : ''}</td><td>${leftText(p)}</td>
        <td><input class="mk cn-in" data-q="${p.id}" inputmode="numeric" placeholder="0"> <small class="muted">${isG(p) ? 'bottles' : 'pcs'}</small></td>
        <td>₹<input class="mk cn-in" data-c="${p.id}" value="${p.cost}" inputmode="decimal"> <small class="muted">/${isG(p) ? 'bottle' : 'pc'}</small></td>
        <td>₹<input class="mk cn-in" data-p="${p.id}" value="${p.price}" inputmode="decimal"> <small class="muted">/${isG(p) ? 'glass' : 'pc'}</small></td>
        <td data-pf="${p.id}"></td></tr>`).join('')}</tbody></table></div><div class="cn-total" id="stot"></div><div id="sm"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn gold" id="ssave">Save stock</button></div>` : noProducts()}</div>
      ${hist.length ? `<div class="panel"><h3>Recent stock entries</h3><div class="tw"><table class="lt"><thead><tr><th>Product</th><th>Date</th><th>Quantity</th><th>Cost</th><th>Total cost</th><th></th></tr></thead><tbody>
      ${hist.map(m => { const p = D.byId[m.product_id]; return `<tr><td><b>${H.esc(p.name)}</b></td><td>${nice(m.day)}</td><td>${nf(m.qty, 2)} ${isG(p) ? 'bottle(s)' : 'pcs'}</td><td>${rs(m.cost)}</td><td>${rs(m.qty * m.cost)}</td><td><button class="btn sm danger" data-sdel="${m.id}">Delete</button></td></tr>`; }).join('')}</tbody></table></div></div>` : ''}`;
    const upd = () => {
      let tc = 0, tv = 0;
      act().forEach(p => {
        const q = +H.$(`[data-q="${p.id}"]`, root).value || 0, c = +H.$(`[data-c="${p.id}"]`, root).value || 0, pr = +H.$(`[data-p="${p.id}"]`, root).value || 0;
        const uc = isG(p) ? c / p.per_bottle : c, up = pr - uc, units = isG(p) ? q * p.per_bottle : q;
        H.$(`[data-pf="${p.id}"]`, root).innerHTML = `${rs(up)} / ${isG(p) ? 'glass' : 'pc'}${q ? `<br><small class="muted">${rs(units * up)} on this stock</small>` : ''}`;
        tc += q * c; tv += units * pr;
      });
      H.$('#stot', root).innerHTML = tc ? `Stock cost: <b>${rs(tc)}</b> · Sells for: <b>${rs(tv)}</b> · Profit when sold: <b class="ok">${rs(tv - tc)}</b>` : '';
    };
    if (ps.length) { H.$$('[data-q],[data-c],[data-p]', root).forEach(el => el.oninput = upd); upd(); }
    H.$('#sday', root).onchange = () => {};
    if (H.$('#ssave', root)) H.$('#ssave', root).onclick = async () => {
      const d = H.$('#sday', root).value || today();
      const entries = act().filter(p => +H.$(`[data-q="${p.id}"]`, root).value > 0).map(p => ({ product_id: p.id, kind: 'in', qty: +H.$(`[data-q="${p.id}"]`, root).value, cost: H.$(`[data-c="${p.id}"]`, root).value, price: H.$(`[data-p="${p.id}"]`, root).value, day: d }));
      try { await H.api('/canteen/moves', { method: 'POST', body: { entries } }); await refresh(); } catch (e) { H.toast(H.$('#sm', root), e.message); }
    };
    H.$$('[data-sdel]', root).forEach(b => b.onclick = async () => { if (confirm('Delete this stock entry?')) { await H.api('/canteen/moves/' + b.dataset.sdel, { method: 'DELETE' }); refresh(); } });
  }

  // ---------------- money from staff ----------------
  function vMoney() {
    const byDay = {};
    D.pending.forEach(m => { byDay[m.day] = (byDay[m.day] || 0) + m.qty * m.price; });
    const days = Object.keys(byDay).sort(), total = days.reduce((a, d) => a + byDay[d], 0);
    box().innerHTML = `<div class="panel"><h3>Pending from canteen staff</h3>
      ${days.length ? `<div class="cn-kpis"><div><small>Total staff should give you</small><b class="warn">${rs(total)}</b></div><div><small>Days pending</small><b>${days.length}</b></div></div>
      <div class="tw"><table class="lt"><thead><tr><th>Date</th><th>Amount</th><th></th></tr></thead><tbody>${days.map(d => `<tr><td><b>${nice(d)}</b></td><td>${rs(byDay[d])}</td><td><button class="btn sm ok" data-rcv="${d}">Received up to here</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="okmsg">All clear – nothing pending from the staff.</div>'}<div id="mm"></div></div>
      ${D.collections.length ? `<div class="panel"><h3>Payments received</h3><div class="tw"><table class="lt"><thead><tr><th>Up to</th><th>Should give</th><th>Received</th><th>Difference</th><th>Note</th><th></th></tr></thead><tbody>
      ${D.collections.map(c => { const diff = c.amount - c.expected; return `<tr><td><b>${nice(c.day)}</b></td><td>${rs(c.expected)}</td><td>${rs(c.amount)}</td><td class="${diff < 0 ? 'bad' : diff > 0 ? 'ok' : ''}">${diff === 0 ? 'Exact' : (diff < 0 ? 'Short ' : 'Extra ') + rs(Math.abs(diff))}</td><td>${H.esc(c.note || '')}</td><td><button class="btn sm" data-undo="${c.id}">Undo</button></td></tr>`; }).join('')}</tbody></table></div></div>` : ''}`;
    H.$$('[data-rcv]', root).forEach(b => b.onclick = () => {
      const d = b.dataset.rcv, due = days.filter(x => x <= d).reduce((a, x) => a + byDay[x], 0);
      const m = H.modal(`<div class="mh"><h2>Money received</h2><button class="btn" id="rcl">Close</button></div>
        <p>Sales up to <b>${nice(d)}</b>. Staff should give <b>${rs(due)}</b>.</p>
        <div class="grid"><div class="f"><label>Amount received (₹)</label><input id="ramt" inputmode="decimal" value="${Math.round(due * 100) / 100}"></div>
        <div class="f"><label>Note (optional)</label><input id="rnote" placeholder="e.g. ₹20 short, will give tomorrow"></div></div>
        <div id="rm"></div><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn ok" id="rok">✓ Mark as received</button></div>`);
      H.$('#rcl', m).onclick = H.closeModal;
      H.$('#rok', m).onclick = async () => {
        try { await H.api('/canteen/receive', { method: 'POST', body: { upto: d, amount: H.$('#ramt', m).value, note: H.$('#rnote', m).value } }); H.closeModal(); refresh(); }
        catch (e) { H.toast(H.$('#rm', m), e.message); }
      };
    });
    H.$$('[data-undo]', root).forEach(b => b.onclick = async () => { if (confirm('Undo this payment? Those sales will show as pending again.')) { await H.api('/canteen/collections/' + b.dataset.undo, { method: 'DELETE' }); refresh(); } });
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
      const need = p.avg * planDays, add = Math.max(0, need - p.left);
      const addUnits = isG(p) ? Math.ceil(add / p.per_bottle) : Math.ceil(add);
      return { p, need, addUnits, cost: addUnits * p.cost };
    }).filter(x => x.p.avg > 0).sort((a, b) => b.p.avg - a.p.avg);
    const planCost = plan.reduce((a, x) => a + x.cost, 0);
    const speed = p => p.sellOut != null ? `${nf(p.sellOut, 0)} day${Math.round(p.sellOut) === 1 ? '' : 's'}` : (p.openBatch && p.avg ? 'Selling…' : '–');
    box().innerHTML = `<div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">How the canteen is doing</h3>
      <div class="f" style="margin:0"><select id="cper">${[7, 15, 30, 60, 90].map(d => `<option value="${d}" ${d === period ? 'selected' : ''}>Last ${d} days</option>`).join('')}</select></div></div>
      <div class="cn-kpis"><div><small>Total sales</small><b>${rs(rev)}</b></div><div><small>Your profit</small><b class="ok">${rs(prof)}</b></div><div><small>Canteen days with sales</small><b>${D.openDays}</b></div><div><small>Average profit / day</small><b>${rs(D.openDays ? prof / D.openDays : 0)}</b></div></div></div>
      <div class="panel"><h3>❤️ What students love most</h3>${byRev.length ? `<div class="cn-bars">${byRev.slice(0, 10).map((p, i) => `<div class="cn-bar"><span class="n">${i + 1}. ${H.esc(p.name)}</span><span class="b"><i style="width:${Math.max(4, p.pRev / maxRev * 100)}%"></i></span><span class="v">${nf(p.pQty, 0)} ${uName(p, p.pQty)} · ${rs(p.pRev)}</span></div>`).join('')}</div>` : '<div class="empty">No sales in this period yet.</div>'}
      ${byProfit.length ? `<p class="sub" style="margin-top:12px">Most profit: ${byProfit.slice(0, 3).map(p => `<b>${H.esc(p.name)}</b> (${rs(p.pProfit)})`).join(', ')}</p>` : ''}</div>
      <div class="panel"><h3>📦 Restock planner</h3><div class="row"><span>I want stock for</span><input id="pdays" class="mk" style="width:70px" inputmode="numeric" value="${planDays}"><span>canteen days</span></div>
      <p class="sub">Based on the average daily sale in the selected period. Per-glass drinks are shown in bottles.</p>
      ${plan.length ? `<div class="tw"><table class="lt"><thead><tr><th>Product</th><th>Sells per day</th><th>Need for ${planDays} days</th><th>In stock</th><th>Add now</th><th>Cost</th></tr></thead><tbody>
      ${plan.map(x => `<tr><td><b>${H.esc(x.p.name)}</b></td><td>${nf(x.p.avg)} ${isG(x.p) ? 'gl' : 'pcs'}</td><td>${nf(x.need, 0)} ${isG(x.p) ? `gl (≈${nf(x.need / x.p.per_bottle)} btl)` : 'pcs'}</td><td>${leftText(x.p)}</td>
        <td>${x.addUnits ? `<b>${x.addUnits} ${isG(x.p) ? 'bottle' + (x.addUnits === 1 ? '' : 's') : 'pcs'}</b>` : '<span class="st approved">Enough</span>'}</td><td>${x.addUnits ? rs(x.cost) : '–'}</td></tr>`).join('')}
      </tbody></table></div><div class="cn-total">Total to buy: <b>${rs(planCost)}</b></div>` : '<div class="empty">Enter a few days of sales first, then the planner can suggest quantities.</div>'}</div>
      <div class="panel"><h3>⏱ Selling speed</h3><p class="sub">“Batch sells out in” = average days a stock you gave took to finish (last 3 batches).</p><div class="tw"><table class="lt"><thead><tr><th>Product</th><th>Sells per day</th><th>In stock</th><th>Stock lasts</th><th>Batch sells out in</th><th>Last sold</th></tr></thead><tbody>
      ${[...ps].sort((a, b) => b.avg - a.avg).map(p => `<tr><td><b>${H.esc(p.name)}</b></td><td>${p.avg ? nf(p.avg) + ' ' + (isG(p) ? 'gl' : 'pcs') : '–'}</td><td>${leftText(p)}</td>
        <td>${p.lastsDays != null ? `<span class="${p.lastsDays < 2 ? 'bad' : ''}">${nf(p.lastsDays)} days</span>` : (p.left > 0 ? 'No sales yet' : '<span class="bad">Out of stock</span>')}</td><td>${speed(p)}</td><td>${p.lastSale ? nice(p.lastSale) : '–'}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="panel"><h3>🐢 Slow / not selling – don’t restock</h3>${slow.length ? `<div class="tw"><table class="lt"><thead><tr><th>Product</th><th>Sold in period</th><th>In stock</th><th>Advice</th></tr></thead><tbody>
      ${slow.map(p => `<tr><td><b>${H.esc(p.name)}</b></td><td>${nf(p.pQty, 0)} ${uName(p, p.pQty)}</td><td>${leftText(p)}</td><td>${p.pQty === 0 ? '<span class="bad">Not selling – stop buying, clear stock</span>' : `Enough for ${nf(p.lastsDays, 0)} days – don’t restock yet`}</td></tr>`).join('')}</tbody></table></div>` : '<div class="okmsg">Everything in stock is selling well.</div>'}
      ${ps.filter(p => p.left <= 0 && p.avg > 0).length ? `<p class="sub" style="margin-top:10px"><b>Out of stock but selling:</b> ${ps.filter(p => p.left <= 0 && p.avg > 0).map(p => H.esc(p.name)).join(', ')}</p>` : ''}</div>`;
    H.$('#cper', root).onchange = e => { period = +e.target.value; analyse(); vInsights(); };
    H.$('#pdays', root).onchange = e => { planDays = Math.max(1, Math.min(60, Math.round(+e.target.value || 5))); vInsights(); };
  }

  // ---------------- products ----------------
  function vProducts() {
    box().innerHTML = `<div class="panel"><div class="row" style="justify-content:space-between;margin-bottom:10px"><h3 style="margin:0">Products</h3><button class="btn gold" id="padd">+ Add product</button></div>
      ${D.products.length ? `<div class="tw"><table class="lt"><thead><tr><th>Product</th><th>Type</th><th>Your cost</th><th>Selling price</th><th>Profit</th><th>In stock</th><th></th></tr></thead><tbody>
      ${D.products.map(p => `<tr style="${p.active ? '' : 'opacity:.55'}"><td><b>${H.esc(p.name)}</b>${p.category ? `<br><small class="muted">${H.esc(p.category)}</small>` : ''}${p.active ? '' : ' <small>(hidden)</small>'}</td>
        <td>${isG(p) ? `Per glass<br><small class="muted">1 bottle = ${p.per_bottle} glasses</small>` : 'Per piece'}</td><td>${rs(p.cost)} / ${isG(p) ? 'bottle' : 'pc'}${isG(p) ? `<br><small class="muted">${rs(p.ucost)} / glass</small>` : ''}</td>
        <td>${rs(p.price)} / ${isG(p) ? 'glass' : 'pc'}</td><td class="${p.uprofit < 0 ? 'bad' : 'ok'}">${rs(p.uprofit)} / ${isG(p) ? 'glass' : 'pc'}${isG(p) ? `<br><small class="muted">${rs(p.uprofit * p.per_bottle)} / bottle</small>` : ''}</td>
        <td>${leftText(p)}</td><td><button class="btn sm" data-pe="${p.id}">Edit</button></td></tr>`).join('')}</tbody></table></div>` : noProducts()}</div>`;
    H.$('#padd', root).onclick = () => form(null);
    H.$$('[data-pe]', root).forEach(b => b.onclick = () => form(D.byId[+b.dataset.pe]));
  }
  function form(p) {
    const isNew = !p; p = p || { unit: 'piece', active: 1, cost: '', price: '', per_bottle: '' };
    const m = H.modal(`<div class="mh"><h2>${isNew ? 'Add product' : 'Edit ' + H.esc(p.name)}</h2><button class="btn" id="fcl">Close</button></div>
      <div class="grid"><div class="f"><label>Product name *</label><input id="fn" value="${H.esc(p.name || '')}" placeholder="Blue Lays"></div>
      <div class="f"><label>Category</label><input id="fc" value="${H.esc(p.category || '')}" placeholder="Chips / Drinks / Biscuits"></div>
      <div class="f"><label>How is it sold?</label><select id="fu"><option value="piece" ${!isG(p) ? 'selected' : ''}>Per piece (packet, bottle, item)</option><option value="glass" ${isG(p) ? 'selected' : ''}>Per glass (from a big bottle)</option></select></div>
      <div class="f" id="fpbw"><label>Glasses in one bottle *</label><input id="fpb" inputmode="numeric" value="${p.per_bottle || ''}" placeholder="e.g. 5"></div>
      <div class="f"><label id="fcl2">Your cost price (₹)</label><input id="fco" inputmode="decimal" value="${p.cost}"></div>
      <div class="f"><label id="fpl">Selling price (₹)</label><input id="fpr" inputmode="decimal" value="${p.price}"></div>
      ${!isNew ? `<div class="f"><label>Show in lists?</label><select id="fa"><option value="1" ${p.active ? 'selected' : ''}>Yes</option><option value="0" ${!p.active ? 'selected' : ''}>No – hide (stopped selling)</option></select></div>` : ''}</div>
      <div class="cn-total" id="fcalc"></div>
      ${!isNew ? `<div class="f" style="margin-top:10px"><label>Stock correction (damaged, expired, counting error)</label><div class="row"><input id="fadj" class="mk" style="width:110px" inputmode="numeric" placeholder="-2"><span class="muted" id="fadju"></span><button class="btn sm" id="fadjb">Apply</button></div><div class="hint">Use minus for less stock (e.g. -2), plus for more.</div></div>` : ''}
      <div id="fm"></div><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn pri" id="fsv">${isNew ? 'Add product' : 'Save'}</button></div>`);
    const calc = () => {
      const g = H.$('#fu', m).value === 'glass', pb = +H.$('#fpb', m).value || 0, c = +H.$('#fco', m).value || 0, pr = +H.$('#fpr', m).value || 0;
      H.$('#fpbw', m).style.display = g ? '' : 'none';
      H.$('#fcl2', m).textContent = g ? 'Your cost per bottle (₹)' : 'Your cost per piece (₹)';
      H.$('#fpl', m).textContent = g ? 'Selling price per glass (₹)' : 'Selling price per piece (₹)';
      if (H.$('#fadju', m)) H.$('#fadju', m).textContent = g ? 'glasses' : 'pcs';
      const uc = g ? (pb ? c / pb : 0) : c, up = pr - uc;
      H.$('#fcalc', m).innerHTML = (c || pr) ? (g ? `Cost per glass <b>${rs(uc)}</b> · Profit per glass <b class="${up < 0 ? 'bad' : 'ok'}">${rs(up)}</b> · Profit per bottle <b>${rs(up * pb)}</b>`
        : `Profit per piece <b class="${up < 0 ? 'bad' : 'ok'}">${rs(up)}</b>${c ? ` (${nf(up / c * 100, 0)}% on cost)` : ''}`) : '';
    };
    H.$$('#fu,#fpb,#fco,#fpr', m).forEach(el => el.oninput = calc); H.$('#fu', m).onchange = calc; calc();
    H.$('#fcl', m).onclick = H.closeModal;
    H.$('#fsv', m).onclick = async () => {
      const body = { name: H.$('#fn', m).value, category: H.$('#fc', m).value, unit: H.$('#fu', m).value, per_bottle: H.$('#fpb', m).value, cost: H.$('#fco', m).value, price: H.$('#fpr', m).value };
      if (!isNew) body.active = H.$('#fa', m).value === '1';
      try { await H.api(isNew ? '/canteen/products' : '/canteen/products/' + p.id, { method: isNew ? 'POST' : 'PUT', body }); H.closeModal(); refresh(); }
      catch (e) { H.toast(H.$('#fm', m), e.message); }
    };
    if (!isNew) H.$('#fadjb', m).onclick = async () => {
      const q = +H.$('#fadj', m).value; if (!q) return;
      try { await H.api('/canteen/moves', { method: 'POST', body: { entries: [{ product_id: p.id, kind: 'adjust', qty: q, day: today(), note: 'Stock correction' }] } }); H.closeModal(); refresh(); }
      catch (e) { H.toast(H.$('#fm', m), e.message); }
    };
  }

  window.Canteen = { render };
})();
