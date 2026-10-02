'use strict';

/* ============================================================
 * 物品收纳管家 —— 家庭物品库存与保质期管理
 * 纯前端实现：数据保存在浏览器 localStorage 中，无需联网。
 * ============================================================ */

const LS_ITEMS = 'homeInventory.items.v1';
const LS_SETTINGS = 'homeInventory.settings.v1';

const state = {
  items: [],
  settings: { warnDays: 7 },
  filters: { q: '', status: 'all', category: 'all', location: 'all', sort: 'expiry' },
  editingId: null, // 正在编辑的物品 id；null 表示新增
};

/* ---------------- 工具函数 ---------------- */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function pad2(n) { return String(n).padStart(2, '0'); }

function toYMD(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function todayStr() { return toYMD(new Date()); }

function offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toYMD(d);
}

/** 距到期还有多少天（按自然日计算，0 = 今天到期，负数 = 已过期） */
function daysUntil(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtNum(n) {
  const v = typeof n === 'number' ? n : parseFloat(n);
  if (!Number.isFinite(v)) return '0';
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

function expiryInfo(item) {
  if (!item.expiryDate) return { code: 'none', label: '无保质期' };
  const d = daysUntil(item.expiryDate);
  if (d < 0) return { code: 'expired', label: `已过期 ${-d} 天` };
  if (d === 0) return { code: 'soon', label: '今天到期' };
  if (d <= state.settings.warnDays) return { code: 'soon', label: `${d} 天后到期` };
  return { code: 'ok', label: `剩 ${d} 天` };
}

function isLowStock(item) {
  return item.minStock > 0 && item.quantity <= item.minStock;
}

function dateOrNull(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function normalizeItem(raw) {
  const s = (v) => (typeof v === 'string' ? v.trim() : '');
  const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    name: s(raw.name) || '未命名物品',
    category: s(raw.category),
    location: s(raw.location),
    quantity: num(raw.quantity),
    unit: s(raw.unit) || '个',
    purchaseDate: dateOrNull(raw.purchaseDate),
    expiryDate: dateOrNull(raw.expiryDate),
    minStock: num(raw.minStock),
    note: s(raw.note),
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : new Date().toISOString(),
  };
}

/* ---------------- 数据读写 ---------------- */

function load() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_ITEMS));
    state.items = Array.isArray(arr) ? arr.map(normalizeItem) : [];
  } catch { state.items = []; }
  try {
    const s = JSON.parse(localStorage.getItem(LS_SETTINGS));
    if (s && typeof s === 'object') Object.assign(state.settings, s);
  } catch { /* 忽略损坏的设置 */ }
  state.settings.warnDays = Math.min(365, Math.max(1, parseInt(state.settings.warnDays, 10) || 7));
}

function saveItems() {
  localStorage.setItem(LS_ITEMS, JSON.stringify(state.items));
}

function saveSettings() {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(state.settings));
}

/* ---------------- 渲染 ---------------- */

function renderAll() {
  renderStats();
  renderAlerts();
  renderCharts();
  renderDatalists();
  renderFilterOptions();
  renderList();
}

function renderStats() {
  let soon = 0, expired = 0, low = 0;
  for (const it of state.items) {
    const code = expiryInfo(it).code;
    if (code === 'soon') soon++;
    else if (code === 'expired') expired++;
    if (isLowStock(it)) low++;
  }
  $('#stat-total').textContent = state.items.length;
  $('#stat-soon').textContent = soon;
  $('#stat-expired').textContent = expired;
  $('#stat-low').textContent = low;
  $('#overview-empty').classList.toggle('hidden', state.items.length > 0);
  $('#overview-content').classList.toggle('hidden', state.items.length === 0);
}

function renderAlerts() {
  const el = $('#alerts-list');
  const alertItems = state.items
    .filter((it) => it.expiryDate && ['soon', 'expired'].includes(expiryInfo(it).code))
    .sort((a, b) => daysUntil(a.expiryDate) - daysUntil(b.expiryDate));
  if (!alertItems.length) {
    el.innerHTML = '<div class="chart-empty">🎉 太棒了，没有临期或过期的物品</div>';
    return;
  }
  const top = alertItems.slice(0, 8);
  el.innerHTML = top.map((it) => {
    const info = expiryInfo(it);
    return `<div class="alert-row" data-action="locate" data-name="${escapeHtml(it.name)}">
      <span class="alert-name">${escapeHtml(it.name)}</span>
      <span class="alert-right">
        <span class="badge ${info.code === 'expired' ? 'expired' : 'soon'}">${info.label}</span>
        ${it.location ? `<span class="chip">📍 ${escapeHtml(it.location)}</span>` : ''}
      </span>
    </div>`;
  }).join('') + (alertItems.length > top.length
    ? `<div class="alert-more">还有 ${alertItems.length - top.length} 件临期/过期物品，去物品列表查看 →</div>`
    : '');
}

function tally(keyFn, emptyLabel) {
  const m = new Map();
  for (const it of state.items) {
    const k = keyFn(it) || emptyLabel;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return Array.from(m, ([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

function renderBarChart(el, entries) {
  if (!entries.length) {
    el.innerHTML = '<div class="chart-empty">暂无数据</div>';
    return;
  }
  const max = Math.max(...entries.map((e) => e.count));
  el.innerHTML = entries.map((e) => `
    <div class="bar-row">
      <span class="bar-label" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(8, Math.round(e.count / max * 100))}%"></div></div>
      <span class="bar-val">${e.count}</span>
    </div>`).join('');
}

function renderCharts() {
  renderBarChart($('#chart-category'), tally((it) => it.category.trim(), '未分类'));
  renderBarChart($('#chart-location'), tally((it) => it.location.trim(), '未设置位置'));
}

function distinctValues(fn) {
  return Array.from(new Set(state.items.map(fn).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'zh'));
}

function renderDatalists() {
  $('#dl-category').innerHTML = distinctValues((it) => it.category)
    .map((v) => `<option value="${escapeHtml(v)}"></option>`).join('');
  $('#dl-location').innerHTML = distinctValues((it) => it.location)
    .map((v) => `<option value="${escapeHtml(v)}"></option>`).join('');
}

function renderFilterOptions() {
  const fill = (sel, values, label) => {
    const prev = sel.value;
    sel.innerHTML = `<option value="all">${label}</option>` +
      values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    const keep = values.includes(prev) ? prev : 'all';
    sel.value = keep;
    return keep;
  };
  state.filters.category = fill($('#filter-category'), distinctValues((it) => it.category), '全部分类');
  state.filters.location = fill($('#filter-location'), distinctValues((it) => it.location), '全部位置');
}

function filteredItems() {
  const f = state.filters;
  const q = f.q.trim().toLowerCase();
  const arr = state.items.filter((it) => {
    if (q) {
      const hay = [it.name, it.category, it.location, it.note].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.category !== 'all' && it.category !== f.category) return false;
    if (f.location !== 'all' && it.location !== f.location) return false;
    if (f.status !== 'all') {
      if (f.status === 'low') {
        if (!isLowStock(it)) return false;
      } else if (expiryInfo(it).code !== f.status) return false;
    }
    return true;
  });
  const byName = (a, b) => a.name.localeCompare(b.name, 'zh');
  const sorters = {
    expiry: (a, b) =>
      (a.expiryDate ? daysUntil(a.expiryDate) : Number.MAX_SAFE_INTEGER) -
      (b.expiryDate ? daysUntil(b.expiryDate) : Number.MAX_SAFE_INTEGER) || byName(a, b),
    created: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
    name: byName,
    qty: (a, b) => a.quantity - b.quantity || byName(a, b),
  };
  return arr.sort(sorters[f.sort] || sorters.expiry);
}

function itemCardHtml(it) {
  const info = expiryInfo(it);
  const low = isLowStock(it);
  const meta = [];
  if (it.category) meta.push(`<span class="chip">🏷 ${escapeHtml(it.category)}</span>`);
  if (it.location) meta.push(`<span class="chip">📍 ${escapeHtml(it.location)}</span>`);
  if (it.expiryDate) meta.push(`<span class="chip">⏳ 保质期至 ${escapeHtml(it.expiryDate)}</span>`);
  if (it.purchaseDate) meta.push(`<span class="chip">🛒 购于 ${escapeHtml(it.purchaseDate)}</span>`);
  return `<div class="item-card">
    <div class="item-main">
      <div class="item-name-row">
        <span class="item-name">${escapeHtml(it.name)}</span>
        <span class="badge ${info.code}">${info.label}</span>
        ${low ? '<span class="badge low">库存不足</span>' : ''}
      </div>
      ${meta.length ? `<div class="item-meta">${meta.join('')}</div>` : ''}
      ${it.note ? `<div class="item-note">📝 ${escapeHtml(it.note)}</div>` : ''}
    </div>
    <div class="item-side">
      <div class="qty-stepper">
        <button class="qty-btn" data-action="dec" data-id="${it.id}" title="减少 1">−</button>
        <span class="qty-val">${fmtNum(it.quantity)} <small>${escapeHtml(it.unit)}</small></span>
        <button class="qty-btn" data-action="inc" data-id="${it.id}" title="增加 1">＋</button>
      </div>
      <div class="item-ops">
        <button class="link-btn" data-action="edit" data-id="${it.id}">编辑</button>
        <button class="link-btn danger" data-action="del" data-id="${it.id}">删除</button>
      </div>
    </div>
  </div>`;
}

function renderList() {
  const arr = filteredItems();
  $('#item-count').textContent = `共 ${arr.length} 件`;
  const listEl = $('#item-list');
  const emptyEl = $('#list-empty');
  if (!arr.length) {
    emptyEl.classList.remove('hidden');
    $('#list-empty-text').textContent = state.items.length
      ? '没有符合条件的物品，试试调整搜索词或筛选条件'
      : '还没有记录任何物品，点击右下角的 ＋ 开始添加吧';
    listEl.innerHTML = '';
    return;
  }
  emptyEl.classList.add('hidden');
  listEl.innerHTML = arr.map(itemCardHtml).join('');
}

/* ---------------- 增删改 ---------------- */

function adjustQty(id, delta) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  it.quantity = Math.max(0, (parseFloat(it.quantity) || 0) + delta);
  it.updatedAt = new Date().toISOString();
  saveItems();
  renderAll();
}

function deleteItem(id) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  if (!confirm(`确定删除「${it.name}」吗？`)) return;
  state.items = state.items.filter((i) => i.id !== id);
  saveItems();
  renderAll();
  toast('已删除');
}

/* ---------------- 弹窗表单 ---------------- */

function openModal(item) {
  const form = $('#item-form');
  state.editingId = item ? item.id : null;
  $('#modal-title').textContent = item ? '编辑物品' : '添加物品';
  form.reset();
  if (item) {
    form.elements['name'].value = item.name;
    form.elements['category'].value = item.category;
    form.elements['location'].value = item.location;
    form.elements['quantity'].value = fmtNum(item.quantity);
    form.elements['unit'].value = item.unit;
    form.elements['purchaseDate'].value = item.purchaseDate || '';
    form.elements['expiryDate'].value = item.expiryDate || '';
    form.elements['minStock'].value = fmtNum(item.minStock);
    form.elements['note'].value = item.note;
  }
  $('#modal-overlay').classList.remove('hidden');
  setTimeout(() => form.elements['name'].focus(), 60);
}

function closeModal() {
  $('#modal-overlay').classList.add('hidden');
  state.editingId = null;
}

function submitForm(e) {
  e.preventDefault();
  const fd = new FormData($('#item-form'));
  const data = {
    name: String(fd.get('name') || '').trim(),
    category: String(fd.get('category') || '').trim(),
    location: String(fd.get('location') || '').trim(),
    quantity: Math.max(0, parseFloat(fd.get('quantity')) || 0),
    unit: String(fd.get('unit') || '').trim() || '个',
    purchaseDate: dateOrNull(fd.get('purchaseDate')),
    expiryDate: dateOrNull(fd.get('expiryDate')),
    minStock: Math.max(0, parseFloat(fd.get('minStock')) || 0),
    note: String(fd.get('note') || '').trim(),
  };
  if (!data.name) { toast('请填写物品名称'); return; }
  const now = new Date().toISOString();
  if (state.editingId) {
    const it = state.items.find((i) => i.id === state.editingId);
    if (it) Object.assign(it, data, { updatedAt: now });
    toast('已保存修改');
  } else {
    state.items.push({ id: uid(), ...data, createdAt: now, updatedAt: now });
    toast(`已添加「${data.name}」`);
  }
  saveItems();
  closeModal();
  renderAll();
}

/* ---------------- 导出 / 导入 ---------------- */

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function buildBackupPayload() {
  return {
    app: 'home-inventory',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    items: state.items,
  };
}

function backupFilename() {
  return `物品库存备份-${todayStr().replace(/-/g, '')}.json`;
}

function exportJson() {
  download(backupFilename(), JSON.stringify(buildBackupPayload(), null, 2), 'application/json');
  toast('已导出 JSON 备份');
}

/* 手机端：调出系统分享面板，备份文件可以存到文件管理器的任意目录、
 * 微信/网盘等任何用户选择的位置（Web Share API，桌面端按钮自动隐藏） */
async function shareBackup() {
  const file = new File(
    [JSON.stringify(buildBackupPayload(), null, 2)],
    backupFilename(),
    { type: 'application/json' }
  );
  try {
    await navigator.share({
      files: [file],
      title: '物品收纳管家 · 数据备份',
      text: '物品收纳管家备份文件，导入应用即可恢复',
    });
    toast('已调出系统分享，选择要保存到的位置即可');
  } catch (err) {
    if (err && err.name === 'AbortError') return; // 用户取消了分享
    exportJson(); // 分享不可用时退回普通下载
  }
}

function setupShareButton() {
  const btn = $('#btn-share');
  try {
    const probe = new File(['{}'], 'probe.json', { type: 'application/json' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [probe] })) {
      btn.hidden = false;
    }
  } catch { /* 该环境不支持分享，保持隐藏 */ }
}

/* ---------------- 安装提示条 ---------------- */

const HINT_DISMISSED_KEY = 'homeInventory.installHintDismissed.v1';
let deferredInstall = null;

function setupInstallHint() {
  const el = $('#install-hint');
  if (!el) return;
  try {
    if (localStorage.getItem(HINT_DISMISSED_KEY) === '1') return;
  } catch { /* 忽略 */ }
  // 已经安装为独立应用（standalone 模式）就不再提示
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return;

  const textEl = $('#install-hint-text');
  const btn = $('#install-btn');

  // Chrome / Edge 等：捕获安装事件，可直接一键安装
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    textEl.textContent = '把「物品收纳管家」安装到本设备，之后可离线使用';
    btn.classList.remove('hidden');
    el.classList.remove('hidden');
  });

  btn.addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    const choice = await deferredInstall.userChoice;
    if (choice && choice.outcome === 'accepted') {
      el.classList.add('hidden');
      toast('安装成功后桌面会出现应用图标');
    }
    deferredInstall = null;
  });

  // 其他浏览器（vivo/小米等自带浏览器）：提示换 Chrome / Edge 安装
  setTimeout(() => {
    if (deferredInstall || dismissed) return;
    textEl.textContent = '当前浏览器不支持一键安装。用 Chrome 或 Edge 打开本页，菜单里点「添加到主屏幕 / 安装应用」，即可像 App 一样离线使用';
    el.classList.remove('hidden');
  }, 1500);

  let dismissed = false;
  $('#install-hint-close').addEventListener('click', () => {
    dismissed = true;
    el.classList.add('hidden');
    try { localStorage.setItem(HINT_DISMISSED_KEY, '1'); } catch { /* 忽略 */ }
  });
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCsv() {
  const headers = ['名称', '分类', '存放位置', '数量', '单位', '购买日期', '保质期至', '距到期(天,负为已过期)', '状态', '最低库存', '备注'];
  const rows = state.items.map((it) => {
    const info = expiryInfo(it);
    return [
      it.name, it.category, it.location, fmtNum(it.quantity), it.unit,
      it.purchaseDate || '', it.expiryDate || '',
      it.expiryDate ? daysUntil(it.expiryDate) : '',
      info.label, fmtNum(it.minStock), it.note,
    ].map(csvCell).join(',');
  });
  // 开头加 \ufeff BOM，保证 Excel 直接打开中文不乱码
  download(`物品库存-${todayStr().replace(/-/g, '')}.csv`,
    '\ufeff' + [headers.map(csvCell).join(','), ...rows].join('\r\n'),
    'text/csv;charset=utf-8');
  toast('已导出 CSV 表格');
}

async function importJson(file) {
  try {
    const data = JSON.parse(await file.text());
    const rawItems = Array.isArray(data) ? data : (data && Array.isArray(data.items)) ? data.items : null;
    if (!rawItems) throw new Error('文件里没有找到物品数据');
    const byId = new Map(state.items.map((i) => [i.id, i]));
    let added = 0, updated = 0;
    for (const raw of rawItems) {
      const it = normalizeItem(raw);
      if (byId.has(it.id)) { Object.assign(byId.get(it.id), it); updated++; }
      else { state.items.push(it); byId.set(it.id, it); added++; }
    }
    if (data && typeof data === 'object' && data.settings) Object.assign(state.settings, data.settings);
    saveItems();
    saveSettings();
    renderAll();
    toast(`导入完成：新增 ${added} 件，更新 ${updated} 件`);
  } catch (err) {
    alert('导入失败：' + err.message);
  }
}

/* ---------------- 示例数据 ---------------- */

function loadSample() {
  const mk = (name, category, location, quantity, unit, expiryOffset, extra = {}) => ({
    id: uid(),
    name, category, location, quantity, unit,
    purchaseDate: offsetDate(-(Math.ceil(Math.random() * 5) + 1)),
    expiryDate: expiryOffset == null ? null : offsetDate(expiryOffset),
    minStock: 0, note: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...extra,
  });
  const samples = [
    mk('鲜牛奶 250ml', '食品', '冰箱·冷藏室', 6, '盒', 4, { minStock: 2, note: '早餐用，喝完记得补' }),
    mk('土鸡蛋', '食品', '冰箱·门架', 10, '个', 14),
    mk('原味酸奶 100g', '食品', '冰箱·冷藏室', 3, '杯', -1),
    mk('全麦吐司', '食品', '厨房·面包盒', 1, '袋', 2),
    mk('东北大米 5kg', '食品', '厨房·米缸', 1, '袋', 180),
    mk('感冒灵颗粒', '药品', '药箱·上层', 2, '盒', 220),
    mk('维生素C泡腾片', '药品', '药箱·下层', 1, '罐', 35, { minStock: 1 }),
    mk('抽纸 3层100抽', '日用品', '客厅·茶几', 4, '包', null, { minStock: 2 }),
    mk('洗洁精', '日用品', '厨房·水槽下', 1, '瓶', null, { minStock: 1 }),
    mk('换季被褥', '其他', '储物间·B柜', 2, '套', null),
  ];
  state.items.push(...samples);
  saveItems();
  renderAll();
  toast('已载入 10 件示例物品，可随意修改或删除');
}

/* ---------------- 其他 UI ---------------- */

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('off');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('off'), 2400);
}

function switchTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${name}`));
}

/* ---------------- 事件绑定与启动 ---------------- */

function bindEvents() {
  $$('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  // 概览：统计卡片点击 → 跳到列表并按状态筛选
  $$('.stat-card[data-status]').forEach((card) => {
    card.addEventListener('click', () => {
      state.filters.status = card.dataset.status;
      $('#filter-status').value = state.filters.status;
      switchTab('items');
      renderList();
    });
  });

  // 概览：提醒区点击 → 去列表里搜该物品
  $('#alerts-list').addEventListener('click', (e) => {
    const row = e.target.closest('[data-action="locate"]');
    if (!row) return;
    state.filters.q = row.dataset.name || '';
    $('#search').value = state.filters.q;
    switchTab('items');
    renderList();
  });

  // 临期提醒天数设置
  $('#warn-days').addEventListener('change', (e) => {
    const v = Math.min(365, Math.max(1, parseInt(e.target.value, 10) || 7));
    e.target.value = v;
    state.settings.warnDays = v;
    saveSettings();
    renderAll();
  });

  // 列表：数量增减 / 编辑 / 删除（事件委托）
  $('#item-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'inc') adjustQty(id, 1);
    else if (action === 'dec') adjustQty(id, -1);
    else if (action === 'edit') openModal(state.items.find((i) => i.id === id));
    else if (action === 'del') deleteItem(id);
  });

  // 搜索 / 筛选 / 排序
  $('#search').addEventListener('input', (e) => { state.filters.q = e.target.value; renderList(); });
  $('#filter-status').addEventListener('change', (e) => { state.filters.status = e.target.value; renderList(); });
  $('#filter-category').addEventListener('change', (e) => { state.filters.category = e.target.value; renderList(); });
  $('#filter-location').addEventListener('change', (e) => { state.filters.location = e.target.value; renderList(); });
  $('#sort').addEventListener('change', (e) => { state.filters.sort = e.target.value; renderList(); });

  // 添加 / 编辑弹窗
  $('#fab').addEventListener('click', () => openModal(null));
  $('#btn-add-first').addEventListener('click', () => openModal(null));
  $('#btn-sample').addEventListener('click', loadSample);
  $('#modal-close').addEventListener('click', closeModal);
  $('#btn-cancel').addEventListener('click', closeModal);
  $('#modal-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal-overlay').classList.contains('hidden')) closeModal();
  });
  $('#item-form').addEventListener('submit', submitForm);

  // 导出 / 分享 / 导入
  $('#btn-export-json').addEventListener('click', exportJson);
  $('#btn-share').addEventListener('click', shareBackup);
  $('#btn-export-csv').addEventListener('click', exportCsv);
  $('#btn-import').addEventListener('click', () => $('#file-import').click());
  $('#file-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) await importJson(file);
  });
}

function init() {
  load();
  // 申请持久化存储：告诉浏览器这些数据需要长期保留，降低被自动清理的风险
  if (navigator.storage && typeof navigator.storage.persist === 'function') {
    navigator.storage.persist().catch(() => {});
  }
  setupShareButton();
  setupInstallHint();
  $('#warn-days').value = state.settings.warnDays;
  bindEvents();
  renderAll();
}

init();
