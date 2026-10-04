'use strict';

/* ============================================================
 * 物品收纳管家 —— 家庭物品库存与保质期管理
 * 纯前端实现：数据保存在浏览器 localStorage 中，无需联网。
 * ============================================================ */

const LS_ITEMS = 'homeInventory.items.v1';
const LS_SETTINGS = 'homeInventory.settings.v1';
const LS_CATEGORIES = 'homeInventory.categories.v1';

// 预设类目（icon = 自绘 SVG 图标 id；presets = 该类目下的常用物品预设）
const DEFAULT_CATEGORIES = [
  { name: '食品', icon: 'food' },
  { name: '药品', icon: 'med' },
  { name: '日用品', icon: 'bottle' },
  { name: '美妆', icon: 'lipstick', presets: [['面霜', 'cream'], ['香水', 'perfume'], ['面膜', 'mask'], ['口红', 'lipstick'], ['眼影', 'eyeshadow'], ['化妆镜', 'mirror'], ['梳子', 'comb'], ['乳液', 'lotion']] },
  { name: '宠物', icon: 'paw', presets: [['项圈', 'collar'], ['猫砂', 'litter'], ['逗猫棒', 'wand'], ['狗盆', 'bowl'], ['宠物窝', 'petnest'], ['宠物药', 'petmed'], ['狗', 'dogface'], ['猫', 'catface']] },
  { name: '小猫', icon: 'catface' },
  { name: '数码', icon: 'headphones' },
  { name: '衣物', icon: 'tee' },
  { name: '其他', icon: 'box' },
];

// 类目管理器里的候选图标（自绘 SVG）
const ICON_CHOICES = [
  'food', 'med', 'bottle', 'lipstick', 'cream', 'perfume', 'mask', 'eyeshadow',
  'mirror', 'comb', 'lotion', 'paw', 'catface', 'dogface', 'collar', 'litter',
  'wand', 'bowl', 'petmed', 'petnest', 'headphones', 'tee', 'box',
];

const state = {
  items: [],
  categories: [],
  settings: { warnDays: 7 },
  filters: { q: '', status: 'all', category: 'all', location: 'all', sort: 'expiry' },
  editingId: null, // 正在编辑的物品 id；null 表示新增
  formCategory: '', // 弹窗表单当前选中的类目
  formIcon: '', // 弹窗表单当前选中的物品图标
  detailId: null, // 详情页当前展示的物品 id
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

/** 把物品当成小区里的居民，生成一句它的"心声" */
function personify(it) {
  if (!it.expiryDate) {
    return isLowStock(it) ? '库存不足啦，记得带新的我回家' : '我没有保质期，可以陪你很久';
  }
  const d = daysUntil(it.expiryDate);
  if (d < 0) return `已经过期 ${-d} 天啦，还记得我吗`;
  if (d === 0) return '今天到期啦，想被今天用掉';
  if (d <= state.settings.warnDays) return `还有 ${d} 天到期，想被早点用掉`;
  if (isLowStock(it)) return '库存不足啦，记得带新的我回家';
  return `还剩 ${d} 天，可以慢慢来`;
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
  // 类目注册表：读不到就回退默认；历史物品里的旧类目自动补进来
  try {
    const arr = JSON.parse(localStorage.getItem(LS_CATEGORIES));
    state.categories = Array.isArray(arr) && arr.length
      ? arr.filter((c) => c && typeof c.name === 'string' && c.name.trim())
          .map((c) => ({
            name: c.name.trim().slice(0, 20),
            icon: String(c.icon || c.emoji || '🏷').slice(0, 24),
            ...(Array.isArray(c.presets) ? { presets: c.presets } : {}),
          }))
      : [];
  } catch { state.categories = []; }
  // 保证预设类目存在（老数据自动升级为手绘图标；用户自建的类目不动）
  for (const preset of DEFAULT_CATEGORIES) {
    const existing = state.categories.find((c) => c.name === preset.name);
    if (existing) {
      existing.icon = preset.icon;
      if (preset.presets) existing.presets = preset.presets;
    } else {
      state.categories.push({ name: preset.name, icon: preset.icon, ...(preset.presets ? { presets: preset.presets } : {}) });
    }
  }
  for (const it of state.items) {
    if (it.category && !state.categories.some((c) => c.name === it.category)) {
      state.categories.push({ name: it.category, icon: '🏷' });
    }
  }
}

function saveItems() {
  localStorage.setItem(LS_ITEMS, JSON.stringify(state.items));
}

function saveCategories() {
  localStorage.setItem(LS_CATEGORIES, JSON.stringify(state.categories));
}

function catIcon(name) {
  const c = state.categories.find((x) => x.name === name);
  return c ? (c.icon || '🏷') : '🏷';
}

/** icon 传入 svg 图标名（如 'lipstick'）或 emoji 字符，返回对应 HTML */
function iconHtml(id, cls) {
  if (!id) return '';
  if (/^[a-z][a-z0-9-]*$/.test(id)) {
    return `<svg class="ic ${cls || ''}" aria-hidden="true"><use href="#ic-${id}"/></svg>`;
  }
  return `<span class="em ${cls || ''}">${escapeHtml(id)}</span>`;
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
  renderBook();
  renderCalendar();
}

/* ---------------- 小区村景插画 ---------------- */

/** 生成大插画：珊瑚小屋 + 真实物品作为居民站在屋前（临期/过期头顶冒感叹号） */
function renderScene() {
  const svg = $('#diary-scene');
  if (!svg) return;
  const W = 680, GROUND = 252;
  const parts = [];

  // 天空装饰：云 ×2、太阳、飞鸟两笔
  parts.push(`<path d="M84 62a10 10 0 0 1 3-18 12 12 0 0 1 23-3 10 10 0 0 1 15 9 7 7 0 0 1-3 12z" fill="#BFD9EE" stroke="#25211F" stroke-width="3" stroke-linejoin="round"/>`);
  parts.push(`<path d="M520 44a8 8 0 0 1 2-14 10 10 0 0 1 19-2 8 8 0 0 1 12 7 6 6 0 0 1-2 10z" fill="#DCEEE2" stroke="#25211F" stroke-width="2.5" stroke-linejoin="round"/>`);
  parts.push(`<circle cx="606" cy="86" r="24" fill="#F7E7A6" stroke="#25211F" stroke-width="3"/><path d="M606 50v-10M606 132v-6M646 86h8M560 86h-8M632 60l7-7M574 112l-6 6M636 110l6 6M578 62l-6-6" stroke="#25211F" stroke-width="3" stroke-linecap="round"/>`);
  parts.push(`<path d="M330 46q7-8 14 0M356 52q6-7 12 0" fill="none" stroke="#25211F" stroke-width="2.5" stroke-linecap="round"/>`);

  // 地面：手绘波浪线
  parts.push(`<path d="M20 ${GROUND}q60-8 120 0t120 0 120 0 120 0 120 0 58 0" fill="none" stroke="#25211F" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="80 10 60 12 50"/>`);

  // 草丛 ×3
  const grass = (x, y, s) => `<path d="M${x} ${y}q-3-${10 * s} -8-${12 * s}M${x} ${y}q0-${13 * s} 0-${15 * s}M${x} ${y}q3-${10 * s} 8-${12 * s}" fill="none" stroke="#8fae8b" stroke-width="${3 * s}" stroke-linecap="round"/>`;
  parts.push(grass(70, GROUND + 2, 1), grass(636, GROUND + 2, .9), grass(206, GROUND + 2, .7));

  // 珊瑚小屋（居中）
  const hx = 260, hy = GROUND;
  parts.push(`<path d="M${hx - 96} ${hy - 78}L${hx} ${hy - 176}l96 98z" fill="#25211F"/>`);
  parts.push(`<path d="M${hx - 78} ${hy - 82}L${hx} ${hy - 158}l78 76z" fill="#F2695C"/>`);
  parts.push(`<g><path d="M${hx + 46} ${hy - 150}h26v-0" stroke="#25211F" stroke-width="3"/><rect x="${hx + 48}" y="${hy - 186}" width="22" height="38" fill="#FEFBF4" stroke="#25211F" stroke-width="3"/><path d="M${hx + 52} ${hy - 156}q3-6 6 0t6-2" fill="none" stroke="#25211F" stroke-width="2.5"/></g>`);
  parts.push(`<rect x="${hx - 74}" y="${hy - 82}" width="148" height="82" rx="8" fill="#F2695C" stroke="#25211F" stroke-width="3.5"/>`);
  parts.push(`<path d="M${hx - 26} ${hy}v-38a26 26 0 0 1 52 0v38z" fill="#FEFBF4" stroke="#25211F" stroke-width="3"/>`);
  parts.push(`<circle cx="${hx + 12}" cy="${hy - 18}" r="3" fill="#25211F"/>`);
  // 门里的黑猫（迎客）
  parts.push(`<g><ellipse cx="${hx - 4}" cy="${hy - 16}" rx="13" ry="12" fill="#25211F"/><path d="M${hx - 15} ${hy - 24}l-3-10 9 5zM${hx + 7} ${hy - 24}l3-10-9 5z" fill="#25211F"/><circle cx="${hx - 8}" cy="${hy - 17}" r="1.8" fill="#FEFBF4"/><circle cx="${hx + 1}" cy="${hy - 17}" r="1.8" fill="#FEFBF4"/></g>`);

  // 居民：真实物品图标沿地面排开（屋左右各一排，最多 9 位）
  const shown = state.items.slice(0, 9);
  const slots = [
    [88, 236], [170, 244], [218, 228],
    [468, 232], [540, 246], [600, 230],
    [140, 200], [452, 196], [592, 178],
  ];
  shown.forEach((it, i) => {
    const [x, y] = slots[i];
    const scale = 0.86 + (i % 3) * 0.07;
    const code = expiryInfo(it).code;
    parts.push(`<use href="#ic-${/^([a-z][a-z0-9-]*)$/.test(it.icon || catIcon(it.category)) ? (it.icon || catIcon(it.category)) : 'box'}" x="${x - 24 * scale}" y="${y - 48 * scale}" width="${48 * scale}" height="${48 * scale}"/>`);
    if (code === 'soon') parts.push(`<g><circle cx="${x + 20}" cy="${y - 58}" r="9" fill="#F7E7A6" stroke="#25211F" stroke-width="2.5"/><text x="${x + 20}" y="${y - 53}" font-size="13" font-weight="900" text-anchor="middle" fill="#25211F">!</text></g>`);
    else if (code === 'expired') parts.push(`<g><circle cx="${x + 20}" cy="${y - 60}" r="10" fill="#F6AFA3" stroke="#25211F" stroke-width="2.5"/><text x="${x + 20}" y="${y - 55}" font-size="13" font-weight="900" text-anchor="middle" fill="#25211F">!!</text></g>`);
    else if (isLowStock(it)) parts.push(`<path d="M${x + 14} ${y - 52}q4-8 8 0q4 8-4 8t-4-8z" fill="#BFD9EE" stroke="#25211F" stroke-width="2"/>`);
  });
  if (state.items.length > shown.length) {
    parts.push(`<g><circle cx="66" cy="170" r="20" fill="#F7E7A6" stroke="#25211F" stroke-width="2.5"/><text x="66" y="176" font-size="14" font-weight="900" text-anchor="middle" fill="#25211F">+${state.items.length - shown.length}</text></g>`);
  }

  svg.innerHTML = parts.join('');
}

/** 手账页头副标题：入住天数 + 居民数 */
function renderDiaryHead() {
  const el = $('#diary-sub');
  if (!el || !state.items.length) return;
  const first = state.items.reduce((min, it) =>
    Math.min(min, Date.parse(it.createdAt) || Infinity), Infinity);
  const days = Number.isFinite(first)
    ? Math.max(1, Math.ceil((Date.now() - first) / 86400000))
    : 1;
  const m = new Date();
  el.textContent = `${m.getMonth() + 1}月${m.getDate()}日 · 小区开张第 ${days} 天 · 住着 ${state.items.length} 位居民`;
}

/* ---------------- 贴纸式统计 ---------------- */

function renderStickerStats() {
  const el = $('#sticker-row');
  if (!el) return;
  let soon = 0, expired = 0, low = 0;
  for (const it of state.items) {
    const code = expiryInfo(it).code;
    if (code === 'soon') soon++;
    else if (code === 'expired') expired++;
    if (isLowStock(it)) low++;
  }
  const stickers = [
    { n: state.items.length, label: '居民', cls: 'butter', rot: -4, status: null, title: '小区居民总数' },
    { n: soon, label: '想被用掉', cls: 'peach', rot: 3, status: 'soon', title: '点击查看临期居民' },
    { n: expired, label: '过期啦', cls: 'coral', rot: -2, status: 'expired', title: '点击查看过期居民' },
    { n: low, label: '要补货', cls: 'sky', rot: 4, status: 'low', title: '点击查看库存不足' },
  ];
  el.innerHTML = stickers.map((s) => `
    <button type="button" class="sticker ${s.cls}${s.status ? ' clickable' : ''}"
      ${s.status ? `data-status="${s.status}"` : ''} title="${s.title}" style="--rot:${s.rot}deg">
      <span class="sticker-num">${s.n}</span>
      <span class="sticker-label">${s.label}</span>
    </button>`).join('');
}

function renderStats() {
  renderScene();
  renderDiaryHead();
  renderStickerStats();
  $('#overview-empty').classList.toggle('hidden', state.items.length > 0);
  $('#overview-content').classList.toggle('hidden', state.items.length === 0);
}

function renderAlerts() {
  const el = $('#alerts-list');
  const alertItems = state.items
    .filter((it) => it.expiryDate && ['soon', 'expired'].includes(expiryInfo(it).code))
    .sort((a, b) => daysUntil(a.expiryDate) - daysUntil(b.expiryDate));
  if (!alertItems.length) {
    el.innerHTML = '<div class="chart-empty">居民们都被照顾得很好，没有临期或过期的</div>';
    return;
  }
  const top = alertItems.slice(0, 8);
  el.innerHTML = top.map((it) => {
    const info = expiryInfo(it);
    return `<div class="say-bubble" data-action="locate" data-name="${escapeHtml(it.name)}" title="点击去看看它">
      <span class="say-name">${escapeHtml(it.name)}</span>
      <span class="badge ${info.code === 'expired' ? 'expired' : 'soon'}">${info.label}</span><br>
      ${escapeHtml(personify(it))}
    </div>`;
  }).join('') + (alertItems.length > top.length
    ? `<div class="alert-more">还有 ${alertItems.length - top.length} 位居民想被想起，去居民列表看看 →</div>`
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
      <span class="bar-label" title="${escapeHtml(e.name)}">${e.icon ? iconHtml(e.icon) : ''}${escapeHtml(e.name)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(8, Math.round(e.count / max * 100))}%"></div></div>
      <span class="bar-val">${e.count}</span>
    </div>`).join('');
}

function renderCharts() {
  const catEntries = tally((it) => it.category.trim(), '未分类')
    .map((e) => ({ name: e.name, count: e.count, icon: catIcon(e.name) }));
  renderBarChart($('#chart-category'), catEntries);
  renderBarChart($('#chart-location'), tally((it) => it.location.trim(), '未设置位置'));
}

function distinctValues(fn) {
  return Array.from(new Set(state.items.map(fn).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'zh'));
}

function renderDatalists() {
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
  state.filters.category = fill($('#filter-category'),
    Array.from(new Set([...state.categories.map((c) => c.name), ...distinctValues((it) => it.category)]))
      .sort((a, b) => a.localeCompare(b, 'zh')), '全部分类');
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

/* ---------------- 图鉴 / 日历 / 详情 的渲染在下方 ---------------- */

/* ---------------- 居民图鉴 ---------------- */

function renderBook() {
  const grid = $('#book-grid');
  if (!grid) return;
  const owned = filteredItems();
  const ownedHtml = owned.map((it) => {
    const info = expiryInfo(it);
    return `<button type="button" class="book-card owned" data-id="${it.id}" title="点击看小档案">
      ${iconHtml(it.icon || catIcon(it.category), 'book-ic')}
      <span class="book-name">${escapeHtml(it.name)}</span>
      <span class="badge ${info.code}">${info.label}</span>
      <span class="book-qty">×${fmtNum(it.quantity)} ${escapeHtml(it.unit)}</span>
    </button>`;
  }).join('');

  // 未遇见：各预设类目的常用物品中还没录入的
  const ownedNames = new Set(state.items.map((i) => i.name));
  const missing = [];
  for (const c of state.categories) {
    for (const [n, i] of (c.presets || [])) {
      if (!ownedNames.has(n)) missing.push({ name: n, icon: i });
    }
  }
  const missingHtml = missing.map((m) => `
    <div class="book-card silhouette">
      ${iconHtml(m.icon, 'book-ic')}
      <span class="book-name">${escapeHtml(m.name)}</span>
      <span class="book-qty">还没遇见</span>
    </div>`).join('');

  grid.innerHTML =
    (owned.length ? `<div class="book-section">已遇见 ${owned.length} 位居民</div>` : '') + ownedHtml +
    (missing.length ? `<div class="book-section">还没遇见 ${missing.length} 位，等你把它们领回家</div>` + missingHtml : '');

  $('#item-count').textContent = `已收录 ${owned.length} 位居民`;
  const emptyEl = $('#list-empty');
  if (!owned.length && !missing.length) {
    emptyEl.classList.remove('hidden');
    $('#list-empty-text').textContent = '图鉴还是空的，先去家园领一位居民吧';
  } else {
    emptyEl.classList.add('hidden');
  }
}

/* ---------------- 物品记录日历 ---------------- */

let calY, calM; // 当前查看的年 / 月（0 起）

function renderCalendar() {
  const grid = $('#cal-grid');
  if (!grid) return;
  if (calY === undefined) {
    const n = new Date();
    calY = n.getFullYear();
    calM = n.getMonth();
  }
  $('#cal-month').textContent = `${calY}年${calM + 1}月`;
  const startDow = new Date(calY, calM, 1).getDay();
  const days = new Date(calY, calM + 1, 0).getDate();
  const sameMonth = (ds) => ds && +ds.slice(0, 4) === calY && +ds.slice(5, 7) === calM + 1;

  const ev = {};
  const add = (d, it, type) => { (ev[d] = ev[d] || []).push({ it, type }); };
  for (const it of state.items) {
    if (sameMonth(it.purchaseDate)) add(+it.purchaseDate.slice(8, 10), it, 'buy');
    const c = (it.createdAt || '').slice(0, 10);
    if (sameMonth(c)) add(+c.slice(8, 10), it, 'join');
    if (sameMonth(it.expiryDate)) add(+it.expiryDate.slice(8, 10), it, 'expire');
  }

  const today = toYMD(new Date());
  let html = '';
  for (let i = 0; i < startDow; i++) html += '<div class="cal-cell blank"></div>';
  for (let d = 1; d <= days; d++) {
    const list = ev[d] || [];
    const marks = list.slice(0, 3).map(({ it, type }) => {
      if (type === 'expire') return '<span class="mark">⏰</span>';
      if (type === 'join') return '<span class="mark">🏡</span>';
      const ic = /^([a-z][a-z0-9-]*)$/.test(it.icon || catIcon(it.category)) ? (it.icon || catIcon(it.category)) : 'box';
      return `<svg class="ic mark-ic" aria-hidden="true"><use href="#ic-${ic}"/></svg>`;
    }).join('');
    html += `<button type="button" class="cal-cell${list.length ? ' has' : ''}${toYMD(new Date(calY, calM, d)) === today ? ' today' : ''}" data-day="${d}">
      <span class="cal-d">${d}</span><span class="cal-marks">${marks}</span></button>`;
  }
  grid.innerHTML = html;
}

function showCalDay(d) {
  const ds = `${calY}-${pad2(calM + 1)}-${pad2(d)}`;
  const list = [];
  for (const it of state.items) {
    if (it.purchaseDate === ds) list.push({ it, tag: '这一天购入' });
    if ((it.createdAt || '').slice(0, 10) === ds) list.push({ it, tag: '这一天搬进小区' });
    if (it.expiryDate === ds) list.push({ it, tag: '这一天到期' });
  }
  $('#cal-day-panel').classList.remove('hidden');
  $('#cal-day-title').textContent = `${calM + 1}月${d}日 · ${list.length} 条记录`;
  $('#cal-day-list').innerHTML = list.length
    ? list.map(({ it, tag }) => `
      <button type="button" class="cal-day-row" data-id="${it.id}">
        ${iconHtml(it.icon || catIcon(it.category))} <b>${escapeHtml(it.name)}</b>
        <span class="chip">${tag}</span>
      </button>`).join('')
    : '<div class="chart-empty">这一天没有记录</div>';
  $('#cal-day-list').scrollTop = 0;
}

function hideCalDay() {
  $('#cal-day-panel').classList.add('hidden');
}

/* ---------------- 居民小档案（详情卡片） ---------------- */

function openDetail(id) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  state.detailId = id;
  const info = expiryInfo(it);
  const iconId = /^([a-z][a-z0-9-]*)$/.test(it.icon || catIcon(it.category)) ? (it.icon || catIcon(it.category)) : 'box';
  $('#detail-icon-use').setAttribute('href', `#ic-${iconId}`);
  $('#d-name').textContent = it.name;
  $('#d-badges').innerHTML =
    `<span class="badge ${info.code}">${info.label}</span>` +
    (isLowStock(it) ? '<span class="badge low">库存不足</span>' : '') +
    (it.category ? `<span class="chip">${iconHtml(catIcon(it.category))} ${escapeHtml(it.category)}</span>` : '');
  $('#d-say').textContent = `“${personify(it)}”`;
  const row = (k, v) => (v ? `<div class="d-row"><span>${k}</span><b>${v}</b></div>` : '');
  $('#d-rows').innerHTML =
    row('数量', `${fmtNum(it.quantity)} ${escapeHtml(it.unit)}`) +
    row('存放位置', escapeHtml(it.location)) +
    row('购入时间', it.purchaseDate) +
    row('保质期至', it.expiryDate) +
    row('最低库存提醒', it.minStock > 0 ? `少于 ${fmtNum(it.minStock)} 时提醒` : '') +
    row('备注', escapeHtml(it.note));
  $('#d-stepper').innerHTML = `
    <button type="button" class="qty-btn" data-d="-1" title="减少 1">−</button>
    <span class="qty-val">${fmtNum(it.quantity)} <small>${escapeHtml(it.unit)}</small></span>
    <button type="button" class="qty-btn" data-d="1" title="增加 1">＋</button>`;
  $('#detail-overlay').classList.remove('hidden');
}

function closeDetail() {
  $('#detail-overlay').classList.add('hidden');
  state.detailId = null;
  renderAll();
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
  toast('它搬走了，小区会想它的');
}

/* ---------------- 弹窗表单 ---------------- */

function openModal(item) {
  const form = $('#item-form');
  state.editingId = item ? item.id : null;
  state.formCategory = item ? item.category : '';
  state.formIcon = item ? (item.icon || catIcon(item.category)) : '';
  $('#modal-title').textContent = item ? '编辑物品' : '添加物品';
  form.reset();
  if (item) {
    form.elements['name'].value = item.name;
    form.elements['location'].value = item.location;
    form.elements['quantity'].value = fmtNum(item.quantity);
    form.elements['unit'].value = item.unit;
    form.elements['purchaseDate'].value = item.purchaseDate || '';
    form.elements['expiryDate'].value = item.expiryDate || '';
    form.elements['minStock'].value = fmtNum(item.minStock);
    form.elements['note'].value = item.note;
  }
  renderCatSelect();
  renderPresets();
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
    category: (state.formCategory || '').trim(),
    icon: state.formIcon || catIcon(state.formCategory),
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
    toast(`「${data.name}」搬进了小区`);
  }
  saveItems();
  closeModal();
  renderAll();
}

/* ---------------- 类目管理 ---------------- */

let catIconPick = 'box';
let catEditing = null; // 正在编辑的原始类目名；null 表示新建模式

function openCatManager() {
  resetCatForm();
  renderCatList();
  renderCatPicker();
  $('#cat-overlay').classList.remove('hidden');
}

function closeCatManager() {
  $('#cat-overlay').classList.add('hidden');
  catEditing = null;
  renderCatSelect();
}

function renderCatPicker() {
  $('#cat-emoji-picker').innerHTML = ICON_CHOICES.map((id) =>
    `<button type="button" class="emoji-pick${id === catIconPick ? ' picked' : ''}" data-icon="${id}" title="${id}"><svg class="ic"><use href="#ic-${id}"/></svg></button>`).join('');
}

function renderCatList() {
  $('#cat-list').innerHTML = state.categories.map((c) =>
    `<button type="button" class="cat-chip${c.name === catEditing ? ' selected' : ''}" data-name="${escapeHtml(c.name)}">${iconHtml(c.icon)} ${escapeHtml(c.name)}</button>`).join('')
    || '<div class="chart-empty">还没有类目，先添加一个吧</div>';
}

function resetCatForm() {
  catEditing = null;
  catIconPick = 'box';
  $('#cat-new-name').value = '';
  $('#cat-add-btn').textContent = '添加类目';
  $('#cat-del-btn').classList.add('hidden');
  $('#cat-cancel-edit').classList.add('hidden');
  renderCatPicker();
}

function startEditCategory(name) {
  catEditing = name;
  const c = state.categories.find((x) => x.name === name);
  catIconPick = c ? (c.icon || 'box') : 'box';
  $('#cat-new-name').value = name;
  $('#cat-add-btn').textContent = '保存修改';
  $('#cat-del-btn').classList.remove('hidden');
  $('#cat-cancel-edit').classList.remove('hidden');
  renderCatPicker();
  renderCatList();
}

function saveCategory() {
  const name = $('#cat-new-name').value.trim();
  if (!name) { toast('先给类目起个名字'); return; }
  if (state.categories.some((c) => c.name === name && c.name !== catEditing)) {
    toast(`类目「${name}」已经存在啦`);
    return;
  }
  if (catEditing) {
    const cat = state.categories.find((c) => c.name === catEditing);
    const oldName = cat.name;
    cat.name = name;
    cat.icon = catIconPick;
    if (oldName !== name) {
      // 改名同步到所有物品和筛选状态
      for (const it of state.items) if (it.category === oldName) it.category = name;
      if (state.filters.category === oldName) state.filters.category = name;
      if (state.formCategory === oldName) state.formCategory = name;
      saveItems();
    }
    saveCategories();
    toast('类目已更新');
    catEditing = name;
    $('#cat-add-btn').textContent = '保存修改';
  } else {
    state.categories.push({ name, icon: catIconPick });
    saveCategories();
    toast(`已添加类目「${name}」`);
    catEditing = name;
    $('#cat-add-btn').textContent = '保存修改';
    $('#cat-del-btn').classList.remove('hidden');
    $('#cat-cancel-edit').classList.remove('hidden');
  }
  renderCatList();
  renderCatSelect();
  renderFilterOptions();
  renderList();
  renderCharts();
}

function deleteCategory() {
  if (!catEditing) return;
  const name = catEditing;
  const used = state.items.filter((it) => it.category === name).length;
  const msg = used
    ? `有 ${used} 件物品属于「${name}」，删除后它们将变成未分类，确定删除吗？`
    : `确定删除类目「${name}」吗？`;
  if (!confirm(msg)) return;
  state.categories = state.categories.filter((c) => c.name !== name);
  for (const it of state.items) if (it.category === name) it.category = '';
  if (state.filters.category === name) state.filters.category = 'all';
  if (state.formCategory === name) state.formCategory = '';
  saveCategories();
  saveItems();
  toast('类目已删除');
  resetCatForm();
  renderCatList();
  renderCatSelect();
  renderFilterOptions();
  renderList();
  renderCharts();
}

function renderCatSelect() {
  const el = $('#cat-select');
  if (!el) return;
  el.innerHTML = state.categories.map((c) =>
    `<button type="button" class="cat-chip${c.name === state.formCategory ? ' selected' : ''}" data-name="${escapeHtml(c.name)}">${iconHtml(c.icon)} ${escapeHtml(c.name)}</button>`).join('')
    + '<button type="button" class="cat-chip cat-add-mini" id="cat-add-mini" title="新建类目">＋ 新建</button>';
}

/** 选中类目后，展示该类目下的常用物品预设（点一下自动填名称和图标） */
function renderPresets() {
  const wrap = $('#preset-chips');
  const list = $('#preset-chip-list');
  if (!wrap || !list) return;
  const cat = state.categories.find((c) => c.name === state.formCategory);
  const presets = cat && Array.isArray(cat.presets) ? cat.presets : [];
  if (!presets.length) {
    wrap.classList.add('hidden');
    list.innerHTML = '';
    return;
  }
  wrap.classList.remove('hidden');
  list.innerHTML = presets.map(([n, i]) =>
    `<button type="button" class="preset-chip${state.formIcon === i ? ' selected' : ''}" data-name="${escapeHtml(n)}" data-icon="${i}">${iconHtml(i)} ${escapeHtml(n)}</button>`).join('');
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
  toast('10 位示例居民已入住，可随意修改或送走');
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
  $$('.nav-item').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${name}`));
  if (name === 'book') renderBook();
  if (name === 'calendar') renderCalendar();
}

/* ---------------- 事件绑定与启动 ---------------- */

function bindEvents() {
  // 底部导航
  $$('.nav-item').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('#nav-add').addEventListener('click', () => openModal(null));

  // 概览：贴纸统计点击 → 跳到居民列表并按状态筛选
  $('#sticker-row').addEventListener('click', (e) => {
    const st = e.target.closest('.sticker[data-status]');
    if (!st) return;
    state.filters.status = st.dataset.status;
    $('#filter-status').value = state.filters.status;
    switchTab('book');
    renderBook();
  });

  // 概览：提醒区点击 → 去图鉴里找该居民
  $('#alerts-list').addEventListener('click', (e) => {
    const row = e.target.closest('[data-action="locate"]');
    if (!row) return;
    state.filters.q = row.dataset.name || '';
    $('#search').value = state.filters.q;
    switchTab('book');
    renderBook();
  });

  // 临期提醒天数设置
  $('#warn-days').addEventListener('change', (e) => {
    const v = Math.min(365, Math.max(1, parseInt(e.target.value, 10) || 7));
    e.target.value = v;
    state.settings.warnDays = v;
    saveSettings();
    renderAll();
  });

  // 列表：数量增减 / 编辑 / 删除（事件委托）——已由图鉴与详情页接管，保留兼容
  // 图鉴：点已拥有的卡片 → 打开居民小档案
  $('#book-grid').addEventListener('click', (e) => {
    const c = e.target.closest('.book-card.owned');
    if (c) openDetail(c.dataset.id);
  });

  // 详情页：关闭 / 编辑 / 送走 / 数量步进
  $('#detail-close').addEventListener('click', closeDetail);
  $('#detail-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeDetail(); });
  $('#d-edit').addEventListener('click', () => {
    const it = state.items.find((i) => i.id === state.detailId);
    if (!it) return;
    closeDetail();
    openModal(it);
  });
  $('#d-del').addEventListener('click', () => {
    const id = state.detailId;
    if (!id) return;
    closeDetail();
    deleteItem(id);
  });
  $('#d-stepper').addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]');
    if (!b || !state.detailId) return;
    adjustQty(state.detailId, +b.dataset.d);
    openDetail(state.detailId); // 刷新详情数字
  });

  // 日历：翻月 + 点日期看当天记录
  $('#cal-prev').addEventListener('click', () => { calM--; if (calM < 0) { calM = 11; calY--; } hideCalDay(); renderCalendar(); });
  $('#cal-next').addEventListener('click', () => { calM++; if (calM > 11) { calM = 0; calY++; } hideCalDay(); renderCalendar(); });
  $('#cal-grid').addEventListener('click', (e) => {
    const cell = e.target.closest('.cal-cell[data-day]');
    if (!cell) return;
    showCalDay(+cell.dataset.day);
  });

  // 搜索 / 筛选 / 排序
  $('#search').addEventListener('input', (e) => { state.filters.q = e.target.value; renderBook(); });
  $('#filter-status').addEventListener('change', (e) => { state.filters.status = e.target.value; renderBook(); });
  $('#filter-category').addEventListener('change', (e) => { state.filters.category = e.target.value; renderBook(); });
  $('#filter-location').addEventListener('change', (e) => { state.filters.location = e.target.value; renderBook(); });
  $('#sort').addEventListener('change', (e) => { state.filters.sort = e.target.value; renderBook(); });

  // 添加 / 编辑弹窗
  $('#fab').addEventListener('click', () => openModal(null));
  $('#btn-add-first').addEventListener('click', () => openModal(null));
  $('#btn-sample').addEventListener('click', loadSample);
  $('#modal-close').addEventListener('click', closeModal);
  $('#btn-cancel').addEventListener('click', closeModal);
  $('#modal-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#modal-overlay').classList.contains('hidden')) closeModal();
    if (!$('#detail-overlay').classList.contains('hidden')) closeDetail();
    if (!$('#cat-overlay').classList.contains('hidden')) closeCatManager();
  });
  $('#cal-day-list').addEventListener('click', (e) => {
    const row = e.target.closest('.cal-day-row[data-id]');
    if (row) { hideCalDay(); openDetail(row.dataset.id); }
  });
  $('#item-form').addEventListener('submit', submitForm);

  // 类目管理
  $('#btn-cats').addEventListener('click', openCatManager);
  $('#cat-close').addEventListener('click', closeCatManager);
  $('#cat-done').addEventListener('click', closeCatManager);
  $('#cat-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeCatManager(); });
  $('#cat-emoji-picker').addEventListener('click', (e) => {
    const b = e.target.closest('[data-icon]');
    if (!b) return;
    catIconPick = b.dataset.icon;
    renderCatPicker();
  });
  $('#cat-add-btn').addEventListener('click', saveCategory);
  $('#cat-del-btn').addEventListener('click', deleteCategory);
  $('#cat-cancel-edit').addEventListener('click', () => { resetCatForm(); renderCatList(); });
  $('#cat-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-name]');
    if (b) startEditCategory(b.dataset.name);
  });

  // 表单里的类目选择区
  $('#cat-select').addEventListener('click', (e) => {
    const b = e.target.closest('[data-name]');
    if (b) {
      state.formCategory = b.dataset.name;
      state.formIcon = catIcon(state.formCategory);
      renderCatSelect();
      renderPresets();
      return;
    }
    if (e.target.closest('#cat-add-mini')) openCatManager();
  });

  // 类目下的常用物品预设：点一下自动填名称和图标
  $('#preset-chip-list').addEventListener('click', (e) => {
    const b = e.target.closest('.preset-chip');
    if (!b) return;
    $('#item-form').elements['name'].value = b.dataset.name;
    state.formIcon = b.dataset.icon;
    renderPresets();
  });

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
  renderCatPicker();
  renderCatSelect();
  $('#warn-days').value = state.settings.warnDays;
  bindEvents();
  renderAll();
}

init();
