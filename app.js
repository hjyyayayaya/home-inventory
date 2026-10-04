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

// 五大家庭空间（家园地图的区域）
const ROOMS = ['客厅', '卧室', '厨房', '卫生间', '储物间'];

let viewMode = 'grid'; // 图鉴视图：grid / list

const state = {
  items: [],
  categories: [],
  settings: { warnDays: 7 },
  filters: { q: '', status: 'all', category: 'all', location: 'all', sort: 'expiry' },
  editingId: null, // 正在编辑的物品 id；null 表示新增
  formCategory: '', // 表单当前选中的类目
  formIcon: '', // 表单当前选中的物品图标
  formRemind: true, // 表单：过期提醒开关
  formUsage: 'often', // 表单：使用状态
  detailId: null, // 详情页当前展示的物品 id
  remindFilter: 'all', // 提醒中心筛选
  roomFilter: '', // 图鉴的房间筛选
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

/** 是否到了该定期盘点的时间（30 天没有记录） */
function needCheck(it) {
  const last = it.log && it.log.length ? it.log[0].d : (it.createdAt || '').slice(0, 10);
  if (!last) return false;
  return -daysUntil(last) >= 30;
}

/** 汇总三类提醒：过期 / 补货 / 定期盘点 */
function buildReminders() {
  const list = [];
  for (const it of state.items) {
    const icon = /^([a-z][a-z0-9-]*)$/.test(it.icon || catIcon(it.category)) ? (it.icon || catIcon(it.category)) : 'box';
    if (it.remind && it.expiryDate) {
      const d = daysUntil(it.expiryDate);
      if (d < 0) list.push({ it, icon, type: 'expired', title: `${it.name} 已过期 ${-d} 天`, sub: `保质期至 ${it.expiryDate}`, date: it.expiryDate, id: it.id });
      else if (d <= state.settings.warnDays) list.push({ it, icon, type: 'expire', title: `${it.name} 还有 ${d} 天过期`, sub: `保质期至 ${it.expiryDate}`, date: it.expiryDate, id: it.id });
    }
    if (isLowStock(it)) list.push({ it, icon, type: 'restock', title: `${it.name} 库存不足`, sub: `只剩 ${fmtNum(it.quantity)} ${it.unit}，最低要备 ${fmtNum(it.minStock)}`, date: (it.updatedAt || '').slice(0, 10), id: it.id });
    if (it.remind && needCheck(it)) {
      const last = it.log && it.log.length ? it.log[0].d : (it.createdAt || '').slice(0, 10);
      list.push({ it, icon, type: 'check', title: `${it.name} 已经 30 天没盘点了`, sub: last ? `上次记录 ${last}` : '入住后还没盘点过', date: last, id: it.id });
    }
  }
  list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return list;
}

function dateOrNull(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function normalizeItem(raw) {
  const s = (v) => (typeof v === 'string' ? v.trim() : '');
  const s2 = (v) => (typeof v === 'string' ? v.trim() : '');
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
    price: num(raw.price),
    remind: raw.remind === false ? false : true,
    usage: raw.usage === 'idle' ? 'idle' : 'often',
    log: Array.isArray(raw.log)
      ? raw.log.filter((l) => l && typeof l.d === 'string').slice(0, 60)
          .map((l) => ({ d: l.d, t: s2(l.t), q: num(l.q) }))
      : [],
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

const dRow = (k, v) => (v ? `<div class="d-row"><span>${k}</span><b>${v}</b></div>` : '');

function saveSettings() {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(state.settings));
}

/* ---------------- 渲染 ---------------- */

function renderAll() {
  renderStats();
  renderAlerts();
  renderCharts();
  renderDatalists();
  renderTagChips();
  renderBook();
  renderCalendar();
  renderMine();
}

/* ---------------- 我的（个人中心） ---------------- */

function renderMine() {
  const el = $('#mine-stats');
  if (!el) return;
  const dates = new Set();
  for (const it of state.items) {
    for (const l of (it.log || [])) if (l.d) dates.add(l.d);
    const c = (it.createdAt || '').slice(0, 10);
    if (c) dates.add(c);
  }
  el.innerHTML = `
    <div class="mine-stat"><b>${state.items.length}</b><span>累计收录</span></div>
    <div class="mine-stat"><b>${dates.size}</b><span>坚持记录天数</span></div>`;
  const w = $('#warn-days-mine');
  if (w) w.value = state.settings.warnDays;
}

/* ---------------- 提醒中心（全屏页） ---------------- */

function openRemindPage() {
  renderReminders();
  $('#page-remind').classList.remove('hidden');
  $('#page-remind').scrollTop = 0;
}

function closeRemindPage() {
  $('#page-remind').classList.add('hidden');
  renderBellBadge();
}

function renderReminders() {
  const all = buildReminders();
  const f = state.remindFilter;
  const shown = f === 'all' ? all : all.filter((r) => r.type === f);
  const chipsEl = $('#remind-chips');
  if (chipsEl) chipsEl.innerHTML = [['all', '全部'], ['expired', '过期提醒'], ['restock', '补货提醒'], ['check', '盘点提醒']].map(([v, l]) => {
    const n = v === 'all' ? all.length : all.filter((r) => r.type === v).length;
    return `<button type="button" class="tag-chip${f === v ? ' selected' : ''}" data-remind="${v}">${l} · ${n}</button>`;
  }).join('');
  const listEl = $('#remind-list');
  if (!listEl) return;
  listEl.innerHTML = shown.length ? shown.map((r) => `
    <button type="button" class="remind-card ${r.type}" data-id="${r.id}">
      <span class="remind-avatar">${iconHtml(r.icon)}</span>
      <span class="remind-main"><b>${escapeHtml(r.title)}</b><small>${escapeHtml(r.sub || '')}</small></span>
      <span class="remind-arrow">›</span>
    </button>`).join('') : '<div class="empty"><p>风平浪静，没有需要处理的提醒 🎉</p></div>';
}

/* ---------------- 小区村景插画 ---------------- */

/** 家园地图：五大房间区域 + 真实物品居民 + 装饰（点区域跳图鉴） */
function renderMap() {
  const svg = $('#home-map');
  if (!svg) return;
  const parts = [];
  // 小路
  parts.push('<path d="M-10 330q130 44 250 12t240 32 180-24" fill="none" stroke="#e3ded2" stroke-width="14" stroke-linecap="round" stroke-dasharray="2 22"/>');
  // 太阳 + 云
  parts.push('<circle cx="610" cy="60" r="22" fill="#F5EBD8" stroke="#25211F" stroke-width="3"/><path d="M610 28v-8M610 110v-6M646 62h8M566 62h-6" stroke="#25211F" stroke-width="3" stroke-linecap="round"/>');
  parts.push('<path d="M30 56a9 9 0 0 1 3-16 11 11 0 0 1 21-3 9 9 0 0 1 13 8 6 6 0 0 1-2 11z" fill="#C9E4F5" stroke="#25211F" stroke-width="2.5" stroke-linejoin="round"/>');
  // 小树
  const tree = (x, y) => '<g><circle cx="' + x + '" cy="' + y + '" r="15" fill="#C7E8D4" stroke="#25211F" stroke-width="3"/><rect x="' + (x - 3) + '" y="' + (y + 13) + '" width="6" height="12" fill="#cbb89c" stroke="#25211F" stroke-width="2.5"/></g>';
  parts.push(tree(646, 236), tree(30, 348));
  // 星星
  const star = (x, y, sc, c) => { let p = ''; for (let i = 0; i < 8; i++) { const rad = i % 2 ? sc * 0.4 : sc; const a = -Math.PI / 2 + i * Math.PI / 4; p += (x + rad * Math.cos(a)).toFixed(1) + ',' + (y + rad * Math.sin(a)).toFixed(1) + ' '; } return '<polygon points="' + p + '" fill="' + c + '" stroke="#25211F" stroke-width="2.5" stroke-linejoin="round"/>'; };
  parts.push(star(320, 26, 10, '#FAD2DC'), star(20, 210, 9, '#C9E4F5'), star(660, 392, 10, '#F5EBD8'));

  // 五大房间区域
  const zones = [
    { room: '卧室', x: 30, y: 76, w: 180, h: 140, fill: '#E3D7F5' },
    { room: '客厅', x: 240, y: 100, w: 200, h: 150, fill: '#F5EBD8' },
    { room: '厨房', x: 470, y: 70, w: 180, h: 150, fill: '#FAD2DC' },
    { room: '储物间', x: 60, y: 268, w: 190, h: 140, fill: '#C7E8D4' },
    { room: '卫生间', x: 440, y: 256, w: 200, h: 130, fill: '#C9E4F5' },
  ];
  const inRoom = (room) => state.items.filter((it) => (it.location || '').includes(room));
  for (const z of zones) {
    const list = inRoom(z.room);
    parts.push('<g class="map-zone" data-room="' + z.room + '" style="cursor:pointer"><rect x="' + z.x + '" y="' + z.y + '" width="' + z.w + '" height="' + z.h + '" rx="26" fill="' + z.fill + '" stroke="#25211F" stroke-width="3" stroke-dasharray="60 8 40 10"/><rect x="' + (z.x + 12) + '" y="' + (z.y - 14) + '" width="' + Math.min(z.w - 24, 34 + z.room.length * 17) + '" height="30" rx="15" fill="#fff" stroke="#25211F" stroke-width="2.5"/><text x="' + (z.x + 24) + '" y="' + (z.y + 7) + '" font-size="16" fill="#25211F" style="font-family:var(--font-cute)">' + z.room + '</text>' + (list.length ? '' : '<text x="' + (z.x + z.w / 2) + '" y="' + (z.y + z.h / 2) + '" font-size="13" fill="#96897b" text-anchor="middle" style="font-family:var(--font-cute)">还空着～</text>') + '</g>');
    const per = Math.min(4, list.length);
    const cell = Math.min(46, (z.w - 40) / Math.max(1, per));
    list.slice(0, 4).forEach((it, i) => {
      const iconId = /^([a-z][a-z0-9-]*)$/.test(it.icon || catIcon(it.category)) ? (it.icon || catIcon(it.category)) : 'box';
      const info = expiryInfo(it);
      const ix = z.x + 22 + i * (cell + 8);
      const iy = z.y + 38;
      let mark = '';
      if (info.code === 'soon') mark = '<circle cx="' + (ix + cell - 2) + '" cy="' + (iy - 2) + '" r="8" fill="#F5EBD8" stroke="#25211F" stroke-width="2"/><text x="' + (ix + cell - 2) + '" y="' + (iy + 2.5) + '" font-size="11" font-weight="900" text-anchor="middle" fill="#25211F">!</text>';
      else if (info.code === 'expired') mark = '<circle cx="' + (ix + cell - 2) + '" cy="' + (iy - 2) + '" r="8" fill="#FAD2DC" stroke="#25211F" stroke-width="2"/><text x="' + (ix + cell - 2) + '" y="' + (iy + 2.5) + '" font-size="11" font-weight="900" text-anchor="middle" fill="#25211F">!!</text>';
      parts.push('<g class="map-zone" data-room="' + z.room + '" style="cursor:pointer"><use href="#ic-' + iconId + '" x="' + ix + '" y="' + iy + '" width="' + cell + '" height="' + cell + '"/>' + mark + '</g>');
    });
    if (list.length > 4) parts.push('<g class="map-zone" data-room="' + z.room + '" style="cursor:pointer"><text x="' + (z.x + z.w - 16) + '" y="' + (z.y + z.h - 14) + '" font-size="15" font-weight="900" text-anchor="end" fill="#25211F" style="font-family:var(--font-cute)">+' + (list.length - 4) + '</text></g>');
  }
  // 其他角落（位置不在五大房间）
  const other = state.items.filter((it) => !ROOMS.some((r) => (it.location || '').includes(r)));
  if (other.length) {
    const zx = 290, zy = 272, zw = 120, zh = 122;
    parts.push('<g class="map-zone" data-room="__other" style="cursor:pointer"><rect x="' + zx + '" y="' + zy + '" width="' + zw + '" height="' + zh + '" rx="26" fill="#fff" stroke="#25211F" stroke-width="3" stroke-dasharray="26 8 18 9"/><rect x="' + (zx + 12) + '" y="' + (zy - 14) + '" width="86" height="30" rx="15" fill="#fff" stroke="#25211F" stroke-width="2.5"/><text x="' + (zx + 24) + '" y="' + (zy + 7) + '" font-size="16" fill="#25211F" style="font-family:var(--font-cute)">其他</text><text x="' + (zx + zw / 2) + '" y="' + (zy + zh / 2 + 6) + '" font-size="16" font-weight="900" text-anchor="middle" fill="#25211F" style="font-family:var(--font-cute)">×' + other.length + '</text></g>');
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

function renderStats() {
  renderDiaryHead();
  renderDataCards();
  renderMap();
  renderBellBadge();
  $('#overview-empty').classList.toggle('hidden', state.items.length > 0);
  $('#overview-content').classList.toggle('hidden', state.items.length === 0);
}

function renderDataCards() {
  const el = $('#data-cards');
  if (!el) return;
  const now = new Date();
  const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const monthNew = state.items.filter((it) => (it.createdAt || '').slice(0, 7) === ym).length;
  let soon = 0, check = 0;
  for (const it of state.items) {
    const code = expiryInfo(it).code;
    if (it.remind && (code === 'soon' || code === 'expired')) soon++;
    if (it.remind && needCheck(it)) check++;
  }
  const cards = [
    { n: state.items.length, label: '已收录居民', cls: 'butter', rot: -3 },
    { n: monthNew, label: '本月新入住', cls: 'mint', rot: 2 },
    { n: soon + check, label: '需要关心', cls: 'peach', rot: -2 },
  ];
  el.innerHTML = cards.map((c) => '<div class="data-card ' + c.cls + '" style="transform:rotate(' + c.rot + 'deg)"><span class="data-num">' + c.n + '</span><span class="data-label">' + c.label + '</span></div>').join('');
}

function renderBellBadge() {
  const b = $('#bell-badge');
  if (!b) return;
  const n = buildReminders().length;
  b.textContent = n > 99 ? '99+' : (n || '');
  b.classList.toggle('hidden', !n);
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

function renderTagChips() {
  const el = $('#tag-chips');
  if (!el) return;
  const f = state.filters;
  const rf = state.roomFilter || '';
  const st = [['all', '全部'], ['often', '常用'], ['idle', '闲置'], ['soon', '临期'], ['expired', '过期']];
  let html = st.map(([v, l]) =>
    `<button type="button" class="tag-chip${f.status === v && !rf ? ' selected' : ''}" data-status="${v}">${l}</button>`).join('');
  html += ROOMS.map((r) =>
    `<button type="button" class="tag-chip${rf === r ? ' selected' : ''}" data-room="${escapeHtml(r)}">${r}</button>`).join('');
  el.innerHTML = html;
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
    if (f.status === 'often' || f.status === 'idle') {
      if ((it.usage || 'often') !== f.status) return false;
    } else if (f.status === 'low') {
      if (!isLowStock(it)) return false;
    } else if (f.status !== 'all') {
      if (expiryInfo(it).code !== f.status) return false;
    }
    if (state.roomFilter && !(it.location || '').includes(state.roomFilter)) return false;
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
  renderTagChips();
  grid.classList.toggle('list-view', viewMode === 'list');
  const owned = filteredItems();
  const ownedHtml = owned.map((it) => {
    const info = expiryInfo(it);
    const usage = it.usage === 'idle'
      ? '<span class="badge idle-b">闲置</span>'
      : '<span class="badge often-b">常用</span>';
    return `<button type="button" class="book-card owned" data-id="${it.id}" title="点击看小档案">
      ${iconHtml(it.icon || catIcon(it.category), 'book-ic')}
      <span class="book-name">${escapeHtml(it.name)}</span>
      <span class="badge ${info.code}">${info.label}</span>
      ${usage}
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
  renderCalSummary();
  renderTheater();
}

function renderCalSummary() {
  const el = $('#cal-summary');
  if (!el) return;
  const inMonth = (ds) => ds && +ds.slice(0, 4) === calY && +ds.slice(5, 7) === calM + 1;
  let added = 0, consumed = 0;
  for (const it of state.items) {
    if (inMonth((it.createdAt || '').slice(0, 10))) added++;
    for (const l of (it.log || [])) if (l.t === '消耗' && inMonth(l.d)) consumed += Math.abs(l.q) || 1;
  }
  const soon = state.items.filter((it) => expiryInfo(it).code === 'soon').length;
  el.innerHTML = `
    <div class="sum-item mint"><b>${added}</b><span>本月新入住</span></div>
    <div class="sum-item butter"><b>${consumed}</b><span>本月消耗</span></div>
    <div class="sum-item peach"><b>${soon}</b><span>临期居民</span></div>`;
}

function renderTheater() {
  const el = $('#theater');
  if (!el) return;
  const start = Date.now() - 7 * 86400000;
  const joins = [], used = [];
  for (const it of state.items) {
    const c = (it.createdAt || '').slice(0, 10);
    if (c && Date.parse(c) >= start) joins.push(it);
    for (const l of (it.log || [])) {
      if (l.t === '消耗' && l.d && Date.parse(l.d) >= start) used.push(Math.abs(l.q) || 1);
    }
  }
  const rooms = {};
  for (const it of joins) {
    const r = ROOMS.find((rm) => (it.location || '').includes(rm)) || '小区';
    rooms[r] = (rooms[r] || 0) + 1;
  }
  const lines = [];
  for (const [r, n] of Object.entries(rooms)) lines.push(`本周「${r}」新入住了 ${n} 位居民`);
  if (used.length) lines.push(`一共消耗掉了 ${used.reduce((a, b) => a + b, 0)} 件物品，大家都很勤快`);
  const exp = state.items.filter((it) => expiryInfo(it).code === 'expired').length;
  if (exp) lines.push(`有 ${exp} 位居民在闹脾气（过期啦），快去看看它们`);
  if (!lines.length) lines.push('这一周风平浪静，居民们睡得可香啦');
  el.innerHTML = `
    <div class="theater-strip">
      <svg class="ic" style="width:36px;height:36px"><use href="#ic-house"/></svg>
      <svg class="ic" style="width:30px;height:30px"><use href="#ic-catface"/></svg>
      <svg class="ic" style="width:32px;height:32px"><use href="#ic-paw"/></svg>
      <svg class="ic" style="width:26px;height:26px"><use href="#ic-calendar"/></svg>
    </div>
    <div class="theater-lines">${lines.map((l) => `<p>✿ ${escapeHtml(l)}</p>`).join('')}</div>`;
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

let detailStepperOpen = false;

function openDetail(id) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  state.detailId = id;
  detailStepperOpen = false;
  const info = expiryInfo(it);
  const iconId = /^([a-z][a-z0-9-]*)$/.test(it.icon || catIcon(it.category)) ? (it.icon || catIcon(it.category)) : 'box';
  $('#pd-icon').setAttribute('href', '#ic-' + iconId);
  $('#pd-name').textContent = it.name;
  $('#pd-badges').innerHTML =
    `<span class="badge ${info.code}">${info.label}</span>` +
    (isLowStock(it) ? '<span class="badge low">库存不足</span>' : '') +
    (it.usage === 'idle' ? '<span class="badge idle-b">闲置中</span>' : '') +
    (it.category ? `<span class="chip">${iconHtml(catIcon(it.category))} ${escapeHtml(it.category)}</span>` : '');
  $('#pd-say').textContent = `“${personify(it)}”`;
  $('#pd-cards').innerHTML = `
    <div class="panel info-card"><h2>基础信息</h2>
      ${dRow('分类', it.category ? `${iconHtml(catIcon(it.category))} ${escapeHtml(it.category)}` : '')}
      ${dRow('存放位置', escapeHtml(it.location))}
      ${dRow('总数量', `${fmtNum(it.quantity)} ${escapeHtml(it.unit)}`)}
      ${dRow('使用状态', it.usage === 'idle' ? '闲置中' : '常用')}
    </div>
    <div class="panel info-card"><h2>时间信息</h2>
      ${dRow('购入日期', it.purchaseDate)}
      ${dRow('保质期至', it.expiryDate)}
      ${dRow('过期提醒', it.remind ? '已开启 🔔' : '已关闭')}
    </div>
    <div class="panel info-card"><h2>价值信息</h2>
      ${dRow('单价', it.price ? `${fmtNum(it.price)} 元` : '')}
      ${dRow('总计花费', it.price ? `约 ${fmtNum(it.price * it.quantity)} 元` : '')}
    </div>
    <div class="panel info-card"><h2>备注</h2><div class="d-note">${escapeHtml(it.note || '（没有备注，安静地待着）')}</div></div>
    <div class="panel info-card"><h2>使用记录时间线</h2>${timelineHtml(it)}</div>`;
  $('#pd-stepper').classList.add('hidden');
  $('#page-detail').classList.remove('hidden');
  $('#page-detail').scrollTop = 0;
}

function timelineHtml(it) {
  const logs = (it.log || []).slice(0, 12);
  if (!logs.length) return '<div class="chart-empty">还没有记录，点上面的「盘点增减」记一笔吧</div>';
  return '<div class="timeline">' + logs.map((l) => {
    const q = l.q > 0 ? '+' + fmtNum(l.q) : l.q === 0 ? '点名' : fmtNum(l.q);
    return `<div class="tl-row"><span class="tl-dot"></span><span class="tl-date">${escapeHtml(l.d)}</span><span class="chip">${escapeHtml(l.t)}</span><b class="tl-q ${l.q > 0 ? 'up' : l.q < 0 ? 'down' : ''}">${q}</b></div>`;
  }).join('') + '</div>';
}

function stocktakeQty(id, delta) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  it.quantity = Math.max(0, (parseFloat(it.quantity) || 0) + delta);
  it.updatedAt = new Date().toISOString();
  it.log = it.log || [];
  it.log.unshift({ d: todayStr(), t: '盘点', q: delta });
  it.log = it.log.slice(0, 60);
  saveItems();
}

function generateCard(it) {
  const iconId = /^([a-z][a-z0-9-]*)$/.test(it.icon || catIcon(it.category)) ? (it.icon || catIcon(it.category)) : 'box';
  const sym = document.querySelector('#ic-' + iconId);
  if (!sym) return;
  const attrs = [...sym.attributes].map((a) => a.name + '="' + a.value + '"').join(' ');
  const svgStr = '<svg xmlns="http://www.w3.org/2000/svg" ' + attrs + '>' + sym.innerHTML + '</svg>';
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = 600; c.height = 820;
    const x = c.getContext('2d');
    x.fillStyle = '#FBF8F1'; x.fillRect(0, 0, 600, 820);
    x.strokeStyle = '#25211F'; x.lineWidth = 5;
    x.beginPath();
    const r = 36, w = 552, h = 772, px = 24, py = 24;
    x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r);
    x.closePath(); x.stroke();
    x.drawImage(img, 190, 80, 220, 220);
    x.fillStyle = '#25211F'; x.textAlign = 'center';
    x.font = '44px "ZCOOL KuaiLe", "Noto Sans SC", sans-serif';
    x.fillText(it.name.slice(0, 12), 300, 386);
    const rows = [['分类', it.category], ['位置', it.location], ['数量', fmtNum(it.quantity) + ' ' + it.unit], ['购入', it.purchaseDate || '—'], ['保质期', it.expiryDate || '长期']];
    rows.forEach(([k, v], i) => {
      const y = 458 + i * 54;
      x.textAlign = 'left'; x.fillStyle = '#7d746a'; x.font = '26px "Noto Sans SC", sans-serif'; x.fillText(k, 90, y);
      x.textAlign = 'right'; x.fillStyle = '#453E38'; x.font = '28px "Noto Sans SC", sans-serif'; x.fillText(String(v || '—'), 510, y);
      x.strokeStyle = '#e3ded2'; x.lineWidth = 2; x.setLineDash([6, 9]);
      x.beginPath(); x.moveTo(90, y + 18); x.lineTo(510, y + 18); x.stroke(); x.setLineDash([]);
    });
    x.textAlign = 'center'; x.fillStyle = '#F4756B'; x.font = '27px "ZCOOL KuaiLe", sans-serif';
    x.fillText('“' + personify(it) + '”', 300, 758);
    const a = document.createElement('a');
    a.download = '居民卡片-' + it.name + '.png';
    a.href = c.toDataURL('image/png');
    a.click();
    toast('专属卡片已生成，长按或右键保存吧');
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
}

function closeDetail(quiet) {
  $('#page-detail').classList.add('hidden');
  state.detailId = null;
  if (!quiet) renderAll();
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

function openForm(item) {
  const form = $('#item-form');
  state.editingId = item ? item.id : null;
  state.formCategory = item ? item.category : '';
  state.formIcon = item ? (item.icon || catIcon(item.category)) : '';
  state.formRemind = item ? item.remind !== false : true;
  state.formUsage = item ? (item.usage || 'often') : 'often';
  $('#form-title').textContent = item ? '编辑居民' : '添加新物品';
  form.reset();
  if (item) {
    form.elements['name'].value = item.name;
    form.elements['location'].value = item.location;
    form.elements['quantity'].value = fmtNum(item.quantity);
    form.elements['unit'].value = item.unit;
    form.elements['price'].value = item.price ? fmtNum(item.price) : '';
    form.elements['purchaseDate'].value = item.purchaseDate || '';
    form.elements['expiryDate'].value = item.expiryDate || '';
    form.elements['minStock'].value = fmtNum(item.minStock);
    form.elements['note'].value = item.note;
  }
  renderCatSelect();
  renderLocChips();
  renderUsageChips();
  setRemindToggle(state.formRemind);
  renderPresets();
  $('#page-form').classList.remove('hidden');
  $('#page-form').scrollTop = 0;
  setTimeout(() => form.elements['name'].focus(), 150);
}

function closeForm() {
  $('#page-form').classList.add('hidden');
  state.editingId = null;
  renderAll();
}

function renderLocChips() {
  const el = $('#loc-select');
  if (!el) return;
  const cur = $('#item-form').elements['location'].value.trim();
  el.innerHTML = ROOMS.map((r) =>
    `<button type="button" class="cat-chip${cur.includes(r) ? ' selected' : ''}" data-room="${escapeHtml(r)}">${r}</button>`).join('');
}

function renderUsageChips() {
  const el = $('#usage-select');
  if (!el) return;
  el.innerHTML = [['often', '⭐ 常用'], ['idle', '🌙 闲置']].map(([v, l]) =>
    `<button type="button" class="cat-chip${state.formUsage === v ? ' selected' : ''}" data-usage="${v}">${l}</button>`).join('');
}

function setRemindToggle(on) {
  const t = $('#f-remind');
  if (!t) return;
  t.classList.toggle('on', on);
  t.setAttribute('aria-checked', on ? 'true' : 'false');
  t.textContent = on ? '开着 🔔' : '关着';
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
    price: Math.max(0, parseFloat(fd.get('price')) || 0),
    purchaseDate: dateOrNull(fd.get('purchaseDate')),
    expiryDate: dateOrNull(fd.get('expiryDate')),
    remind: state.formRemind,
    usage: state.formUsage,
    minStock: Math.max(0, parseFloat(fd.get('minStock')) || 0),
    note: String(fd.get('note') || '').trim(),
  };
  if (!data.name) { toast('先给居民起个名字吧'); return; }
  const now = new Date().toISOString();
  const today = todayStr();
  if (state.editingId) {
    const it = state.items.find((i) => i.id === state.editingId);
    if (it) {
      const oldQty = parseFloat(it.quantity) || 0;
      Object.assign(it, data, { updatedAt: now });
      it.log = it.log || [];
      if (data.quantity !== oldQty) it.log.unshift({ d: today, t: '盘点', q: +(data.quantity - oldQty).toFixed(2) });
      toast('帮它记好啦');
    }
  } else {
    state.items.push({ id: uid(), ...data, createdAt: now, updatedAt: now, log: [{ d: today, t: '入库', q: data.quantity }] });
    toast(`「${data.name}」搬进了小区`);
  }
  saveItems();
  closeForm();
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
    minStock: 0, note: '', price: 0, remind: true, usage: 'often',
    log: [{ d: todayStr(), t: '入库', q: quantity }],
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
  $('#nav-add').addEventListener('click', () => openForm(null));

  // 家园
  $('#btn-quick-add').addEventListener('click', () => openForm(null));
  $('#btn-stocktake').addEventListener('click', () => {
    if (!state.items.length) { toast('小区还没有居民呢'); return; }
    const d = todayStr();
    for (const it of state.items) {
      it.log = it.log || [];
      it.log.unshift({ d, t: '盘点', q: 0 });
      it.log = it.log.slice(0, 60);
    }
    saveItems();
    renderAll();
    toast(`今日盘点完成，${state.items.length} 位居民都被点名啦`);
  });
  $('#home-map').addEventListener('click', (e) => {
    const z = e.target.closest('.map-zone[data-room]');
    if (!z) return;
    state.roomFilter = z.dataset.room === '__other' ? '' : z.dataset.room;
    switchTab('book');
    renderBook();
  });
  $('#btn-bell').addEventListener('click', openRemindPage);
  $('#to-reminds').addEventListener('click', openRemindPage);

  // 图鉴
  $('#search').addEventListener('input', (e) => { state.filters.q = e.target.value; renderBook(); });
  $('#sort').addEventListener('change', (e) => { state.filters.sort = e.target.value; renderBook(); });
  $('#tag-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-status],[data-room]');
    if (!b) return;
    if (b.dataset.status) state.filters.status = b.dataset.status;
    if (b.dataset.room) state.roomFilter = state.roomFilter === b.dataset.room ? '' : b.dataset.room;
    renderTagChips();
    renderBook();
  });
  $('#view-toggle').addEventListener('click', () => {
    viewMode = viewMode === 'grid' ? 'list' : 'grid';
    renderBook();
  });
  $('#book-grid').addEventListener('click', (e) => {
    const owned = e.target.closest('.book-card.owned');
    if (owned) openDetail(owned.dataset.id);
    const sil = e.target.closest('.book-card.silhouette');
    if (sil) openForm(null);
  });

  // 日历
  $('#cal-prev').addEventListener('click', () => { calM--; if (calM < 0) { calM = 11; calY--; } hideCalDay(); renderCalendar(); });
  $('#cal-next').addEventListener('click', () => { calM++; if (calM > 11) { calM = 0; calY++; } hideCalDay(); renderCalendar(); });
  $('#cal-grid').addEventListener('click', (e) => {
    const cell = e.target.closest('.cal-cell[data-day]');
    if (!cell) return;
    showCalDay(+cell.dataset.day);
  });
  $('#cal-day-list').addEventListener('click', (e) => {
    const row = e.target.closest('.cal-day-row[data-id]');
    if (row) { hideCalDay(); openDetail(row.dataset.id); }
  });

  // 详情页
  $('#detail-back').addEventListener('click', () => closeDetail());
  $('#pd-stock').addEventListener('click', () => {
    const st = $('#pd-stepper');
    if (st.classList.contains('hidden')) {
      const it = state.items.find((i) => i.id === state.detailId);
      if (!it) return;
      st.innerHTML = `
        <button type="button" class="qty-btn" data-d="-1" title="消耗 1">−</button>
        <span class="qty-val">${fmtNum(it.quantity)} <small>${escapeHtml(it.unit)}</small></span>
        <button type="button" class="qty-btn" data-d="1" title="入库 1">＋</button>`;
      st.classList.remove('hidden');
    } else {
      st.classList.add('hidden');
    }
  });
  $('#pd-stepper').addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]');
    if (!b || !state.detailId) return;
    stocktakeQty(state.detailId, +b.dataset.d);
    openDetail(state.detailId);
    $('#pd-stepper').classList.remove('hidden');
  });
  $('#pd-edit').addEventListener('click', () => {
    const it = state.items.find((i) => i.id === state.detailId);
    if (!it) return;
    closeDetail(true);
    openForm(it);
  });
  $('#pd-card-btn').addEventListener('click', () => {
    const it = state.items.find((i) => i.id === state.detailId);
    if (it) generateCard(it);
  });
  $('#pd-share-card').addEventListener('click', () => {
    const it = state.items.find((i) => i.id === state.detailId);
    if (it) generateCard(it);
  });

  // 表单
  $('#form-back').addEventListener('click', () => closeForm());
  $('#item-form').addEventListener('submit', submitForm);
  $('#f-minus').addEventListener('click', () => { const q = $('#f-qty'); q.value = Math.max(0, (parseFloat(q.value) || 0) - 1); });
  $('#f-plus').addEventListener('click', () => { const q = $('#f-qty'); q.value = (parseFloat(q.value) || 0) + 1; });
  $('#cat-select').addEventListener('click', (e) => {
    const b = e.target.closest('[data-name]');
    if (!b) return;
    state.formCategory = b.dataset.name;
    state.formIcon = catIcon(state.formCategory);
    renderCatSelect();
    renderPresets();
  });
  $('#preset-chip-list').addEventListener('click', (e) => {
    const b = e.target.closest('.preset-chip');
    if (!b) return;
    state.formIcon = b.dataset.icon;
    $('#item-form').elements['name'].value = b.dataset.name;
    renderPresets();
  });
  $('#loc-select').addEventListener('click', (e) => {
    const b = e.target.closest('[data-room]');
    if (!b) return;
    $('#item-form').elements['location'].value = b.dataset.room;
    renderLocChips();
  });
  $('#usage-select').addEventListener('click', (e) => {
    const b = e.target.closest('[data-usage]');
    if (!b) return;
    state.formUsage = b.dataset.usage;
    renderUsageChips();
  });
  $('#f-remind').addEventListener('click', () => {
    state.formRemind = !state.formRemind;
    setRemindToggle(state.formRemind);
  });

  // 提醒中心
  $('#btn-bell').addEventListener('click', openRemindPage);
  $('#to-reminds').addEventListener('click', openRemindPage);
  $('#remind-back').addEventListener('click', closeRemindPage);
  $('#remind-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-remind]');
    if (!b) return;
    state.remindFilter = b.dataset.remind;
    renderReminders();
  });
  $('#remind-list').addEventListener('click', (e) => {
    const c = e.target.closest('.remind-card[data-id]');
    if (c) { closeRemindPage(); openDetail(c.dataset.id); }
  });

  // 我的
  $('#menu-cats').addEventListener('click', openCatManager);
  $('#menu-backup').addEventListener('click', () => $('#backup-row').classList.toggle('hidden'));
  $('#menu-export-json').addEventListener('click', exportJson);
  $('#menu-share').addEventListener('click', shareBackup);
  $('#menu-export-csv').addEventListener('click', exportCsv);
  $('#menu-import').addEventListener('click', () => $('#file-import').click());
  $('#file-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) await importJson(file);
  });
  $('#menu-remind').addEventListener('click', () => $('#remind-row').classList.toggle('hidden'));
  $('#warn-days-mine').addEventListener('change', (e) => {
    const v = Math.min(365, Math.max(1, parseInt(e.target.value, 10) || 7));
    e.target.value = v;
    state.settings.warnDays = v;
    saveSettings();
    renderAll();
  });
  $('#menu-help').addEventListener('click', () => $('#help-overlay').classList.remove('hidden'));
  $('#help-close').addEventListener('click', () => $('#help-overlay').classList.add('hidden'));
  $('#help-done').addEventListener('click', () => $('#help-overlay').classList.add('hidden'));
  $('#menu-about').addEventListener('click', () => $('#about-overlay').classList.remove('hidden'));
  $('#about-close').addEventListener('click', () => $('#about-overlay').classList.add('hidden'));
  $('#about-done').addEventListener('click', () => $('#about-overlay').classList.add('hidden'));

  // 类目管理
  $('#btn-cats').addEventListener('click', openCatManager);
  $('#cat-close').addEventListener('click', () => { closeCatManager(); renderAll(); });
  $('#cat-done').addEventListener('click', () => { closeCatManager(); renderAll(); });
  $('#cat-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) { closeCatManager(); renderAll(); } });
  $('#cat-emoji-picker').addEventListener('click', (e) => {
    const b = e.target.closest('[data-icon]');
    if (!b) return;
    catIconPick = b.dataset.icon;
    renderCatPicker();
  });
  $('#cat-add-btn').addEventListener('click', () => { saveCategory(); renderAll(); });
  $('#cat-del-btn').addEventListener('click', deleteCategory);
  $('#cat-cancel-edit').addEventListener('click', () => { resetCatForm(); renderCatList(); });
  $('#cat-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-name]');
    if (b) startEditCategory(b.dataset.name);
  });

  // Esc 关闭所有浮层
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    ['#page-form', '#page-detail', '#page-remind', '#cat-overlay', '#help-overlay', '#about-overlay'].forEach((sel) => {
      const el = $(sel);
      if (el && !el.classList.contains('hidden')) {
        el.classList.add('hidden');
        if (sel === '#page-form') { state.editingId = null; renderAll(); }
        if (sel === '#page-detail') state.detailId = null;
      }
    });
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
  bindEvents();
  renderAll();
}

init();
