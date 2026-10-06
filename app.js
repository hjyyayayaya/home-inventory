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

// 猫咪日常记录分类（整合自小猫微信小程序）
const CARE_GROUPS = [
  { group: '日常', items: [
    { key: 'shensi', name: '铲屎', icon: '🐾' },
    { key: 'weight', name: '体重', icon: '⚖️' },
    { key: 'water', name: '喝水', icon: '💧' },
    { key: 'feed', name: '喂食', icon: '🍽️' }
  ] },
  { group: '零食玩具', items: [
    { key: 'catfood', name: '猫粮', icon: '🍚' },
    { key: 'can', name: '罐头', icon: '🥫' },
    { key: 'freeze', name: '冻干', icon: '🐟' },
    { key: 'snack', name: '零食', icon: '🍪' },
    { key: 'homecook', name: '自制猫饭', icon: '🍳' },
    { key: 'toy', name: '玩具', icon: '🧶' },
    { key: 'like', name: '喜好', icon: '💖' }
  ] },
  { group: '美容清洁', items: [
    { key: 'bath', name: '洗澡', icon: '🛁' },
    { key: 'nail', name: '剪指甲', icon: '✂️' },
    { key: 'ear', name: '洗耳朵', icon: '👂' },
    { key: 'tooth', name: '刷牙', icon: '🦷' },
    { key: 'fur', name: '梳毛', icon: '🪮' },
    { key: 'litter', name: '换猫砂', icon: '🧹' },
    { key: 'eye', name: '擦眼屎', icon: '👀' }
  ] },
  { group: '健康医疗', items: [
    { key: 'deworm', name: '驱虫', icon: '💊' },
    { key: 'vaccine', name: '疫苗', icon: '💉' },
    { key: 'checkup', name: '体检', icon: '🩺' },
    { key: 'supplement', name: '保健品', icon: '🧴' },
    { key: 'buydrug', name: '买药', icon: '🧫' },
    { key: 'doctor', name: '看病', icon: '🏥' },
    { key: 'sterile', name: '绝育', icon: '⚕️' },
    { key: 'usedrug', name: '用药', icon: '💧' }
  ] },
  { group: '出行', items: [
    { key: 'carry', name: '托运', icon: '🧳' },
    { key: 'foster', name: '寄养', icon: '🏠' }
  ] }
];
const CARE_MEDICAL = ['deworm', 'vaccine', 'checkup', 'supplement', 'buydrug', 'doctor', 'sterile', 'usedrug'];
// 记录类型 → 建议扣减的库存关键词
const CARE_CONSUME_HINT = {
  feed: '猫粮', catfood: '猫粮', can: '罐头', freeze: '冻干', snack: '零食',
  litter: '猫砂', supplement: '保健品', usedrug: '药品', water: '水'
};

// 常用单位预设 + 不同单位对应的阈值滑条量程
const UNIT_PRESETS = ['个', '瓶', '罐', '卷', '袋', '盒', '包', '支', 'ml', 'L', 'kg', 'g'];
const UNIT_SLIDER_MAX = { ml: 1000, L: 100, kg: 50, g: 500 };

function unitSliderMax(unit) {
  return UNIT_SLIDER_MAX[unit.trim()] || 20;
}

function renderUnitChips() {
  const el = $('#unit-select');
  if (!el) return;
  const cur = $('#f-unit').value.trim();
  el.innerHTML = UNIT_PRESETS.map((u) =>
    `<button type="button" class="cat-chip${cur === u ? ' selected' : ''}" data-unit="${escapeHtml(u)}">${u}</button>`).join('');
}

function updateSliderMax() {
  const sl = $('#f-minstock');
  if (!sl) return;
  const max = unitSliderMax($('#f-unit').value.trim());
  sl.max = max;
  if (parseFloat(sl.value) > max) sl.value = max;
  $('#f-minstock-val').textContent = sl.value;
  const ticks = $('#f-minstock-ticks');
  if (ticks) ticks.innerHTML = [0, 0.25, 0.5, 0.75, 1].map((p) =>
    `<span>${Math.round(max * p)}</span>`).join('');
}

let viewMode = 'grid'; // 图鉴视图：grid / list
let formTags = []; // 表单里正在编辑的标签
let reportRange = 'month'; // 分析账单：month / year
const LS_SHOP = 'homeInventory.shoplist.v1';
let shopList = []; // 手动添加的采购项 {name, done}

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
  cats: [], // 猫咪档案 [{id,name,breed,gender,birthday}]
  careRecords: [], // 猫咪日常记录 [{id,type,name,icon,date,time,note,amount,pets,sync}]
  catTodos: [], // 猫咪待办 [{id,title,date,repeat,done}]
  careType: '', carePetSel: {}, careSyncSel: {},
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
  if (!item.expiryDate) return { code: 'none', label: '无保质期', lvl: '' };
  const d = daysUntil(item.expiryDate);
  if (d < 0) return { code: 'expired', label: `已过期 ${-d} 天`, lvl: 'red' };
  if (d === 0) return { code: 'soon', label: '今天到期', lvl: 'orange' };
  if (d <= 7) return { code: 'soon', label: `${d} 天后到期`, lvl: 'orange' };
  if (d <= state.settings.warnDays) return { code: 'soon', label: `${d} 天后到期`, lvl: 'yellow' };
  return { code: 'ok', label: `剩 ${d} 天`, lvl: '' };
}

/** 徽章配色：临期黄 / 7天内橙 / 过期红 */
function badgeClass(info) {
  return info.code === 'soon' ? (info.lvl === 'orange' ? 'urgent' : 'soon') : info.code;
}

/** 开封后的到期日（有开封记录才算） */
function openDue(it) {
  if (!it.openedDate || !it.openLifeDays) return null;
  const d = new Date(it.openedDate);
  d.setDate(d.getDate() + it.openLifeDays);
  return toYMD(d);
}

/** 消耗速度预测：按消耗日志估算日均用量 → 预计用完日期 */
function forecast(it) {
  const logs = (it.log || []).filter((l) => l.t === '消耗' && l.q < 0);
  if (!logs.length) return null;
  const days = logs.map((l) => Date.parse(l.d)).filter(Number.isFinite).sort((a, b) => a - b);
  if (!days.length) return null;
  const span = Math.max((Date.now() - days[0]) / 86400000, 7);
  const totalUsed = logs.reduce((sum, l) => sum + Math.abs(l.q), 0);
  const perDay = totalUsed / span;
  if (perDay <= 0) return null;
  const daysLeft = Math.ceil((it.quantity || 0) / perDay);
  return { perDay: +perDay.toFixed(2), daysLeft, date: offsetDate(daysLeft) };
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
      if (d < 0) list.push({ it, icon, type: 'expired', title: `【过期】${it.name} 已过期 ${-d} 天`, sub: `保质期至 ${it.expiryDate}`, date: it.expiryDate, id: it.id });
      else if (d <= 7) list.push({ it, icon, type: 'expire', title: `【紧急】${it.name} 还有 ${d} 天过期`, sub: `保质期至 ${it.expiryDate}`, date: it.expiryDate, id: it.id });
      else if (d <= state.settings.warnDays) list.push({ it, icon, type: 'expire', title: `【临期】${it.name} 还有 ${d} 天过期`, sub: `保质期至 ${it.expiryDate}`, date: it.expiryDate, id: it.id });
    }
    if (isLowStock(it)) list.push({ it, icon, type: 'restock', title: `${it.name} 库存不足`, sub: `只剩 ${fmtNum(it.quantity)} ${it.unit}，最低要备 ${fmtNum(it.minStock)}`, date: (it.updatedAt || '').slice(0, 10), id: it.id });
    if (it.remind && needCheck(it)) {
      const last = it.log && it.log.length ? it.log[0].d : (it.createdAt || '').slice(0, 10);
      list.push({ it, icon, type: 'check', title: `${it.name} 已经 30 天没盘点了`, sub: last ? `上次记录 ${last}` : '入住后还没盘点过', date: last, id: it.id });
    }
    // 开封后保质期
    const od = openDue(it);
    if (it.remind && od) {
      const d = daysUntil(od);
      if (d < 0) list.push({ it, icon, type: 'expired', title: `${it.name} 开封后 ${it.openLifeDays} 天已用完`, sub: `开封后到期日 ${od}`, date: od, id: it.id });
      else if (d <= state.settings.warnDays) list.push({ it, icon, type: 'expire', title: `${it.name} 开封后还剩 ${d} 天`, sub: `开封后到期日 ${od}`, date: od, id: it.id });
    }
    // 维保提醒（家电保养 / 数码保修 / 年检）
    if (it.remind && it.maintainCycleDays && it.lastMaintainDate) {
      const due = new Date(it.lastMaintainDate);
      due.setDate(due.getDate() + it.maintainCycleDays);
      const dd = toYMD(due);
      const left = daysUntil(dd);
      if (left <= 0) list.push({ it, icon, type: 'check', title: `${it.name} 该保养 / 维护啦`, sub: `周期每 ${it.maintainCycleDays} 天 · 应于 ${dd}`, date: dd, id: it.id });
      else if (left <= 7) list.push({ it, icon, type: 'check', title: `${it.name} 将在 ${left} 天后到维保期`, sub: `应于 ${dd} 前后维护`, date: dd, id: it.id });
    }
    // 消耗速度预测：提前 7 天提醒补货
    if (it.remind && it.minStock > 0) {
      const fc = forecast(it);
      if (fc && fc.daysLeft <= 7) {
        list.push({ it, icon, type: 'restock', title: `${it.name} 按现在的用量约 ${fc.daysLeft} 天后用完`, sub: `日均 ${fc.perDay} ${it.unit} · 预计 ${fc.date} 用完，提前买起来`, date: fc.date, id: it.id });
      }
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
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => s(String(t)).slice(0, 12)).filter(Boolean).slice(0, 8) : [],
    openedDate: dateOrNull(raw.openedDate),
    openLifeDays: raw.openLifeDays ? num(raw.openLifeDays) : 0,
    maintainCycleDays: raw.maintainCycleDays ? num(raw.maintainCycleDays) : 0,
    lastMaintainDate: dateOrNull(raw.lastMaintainDate),
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
  renderCats();
  renderCareList();
  renderCatTodos();
}

/* ---------------- 采购小票（统一采购清单） ---------------- */

function loadShop() {
  try { shopList = JSON.parse(localStorage.getItem(LS_SHOP)) || []; }
  catch { shopList = []; }
  shopList = Array.isArray(shopList) ? shopList.filter((m) => m && m.name) : [];
}

function saveShop() {
  localStorage.setItem(LS_SHOP, JSON.stringify(shopList));
}

function openShopPage() {
  loadShop();
  renderShop();
  $('#page-shop').classList.remove('hidden');
  $('#page-shop').scrollTop = 0;
}

function closeShopPage() {
  $('#page-shop').classList.add('hidden');
  renderAll();
}

function renderShop() {
  const receipt = $('#shop-receipt');
  if (!receipt) return;
  const auto = restockItems();
  const rows = auto.map((it) => `
    <label class="rc-row">
      <input type="checkbox" data-buy="${it.id}">
      <span class="rc-name">${iconHtml(it.icon || catIcon(it.category))} ${escapeHtml(it.name)}</span>
      <span class="rc-qty">补 ${buyQtyOf(it)} ${escapeHtml(it.unit)}</span>
    </label>`).join('');
  const manual = shopList.map((m, i) => `
    <label class="rc-row ${m.done ? 'done' : ''}">
      <input type="checkbox" data-manual="${i}" ${m.done ? 'checked' : ''}>
      <span class="rc-name">${escapeHtml(m.name)}</span>
    </label>`).join('');
  receipt.innerHTML = `
    <div class="rc-head">🛒 采购小票 · ${todayStr()}</div>
    <div class="rc-sub">${auto.length} 件自动补货${shopList.length ? ` · ${shopList.length} 件手动添加` : ''}</div>
    ${rows || '<div class="rc-empty">暂时没有需要补货的居民，家里满满当当～</div>'}
    ${manual ? `<div class="rc-div">· 手动添加 ·</div>${manual}` : ''}
    <div class="rc-foot">✂ - - - - - - - - - - - - - - - -</div>`;
}

function shareShopList() {
  const auto = restockItems().map((it) => `${it.name} 补${buyQtyOf(it)}${it.unit}`);
  const manual = shopList.filter((m) => !m.done).map((m) => m.name);
  const text = '🛒 家庭采购清单：\n' + [...auto, ...manual].map((x) => '· ' + x).join('\n');
  if (navigator.share) {
    navigator.share({ title: '家庭采购清单', text }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(text).then(() => toast('清单已复制，去粘贴给家人吧')).catch(() => toast('复制失败，请手动抄写'));
  }
}

/* ---------------- 消费与闲置分析（账单页） ---------------- */

function openReportPage() {
  renderReport();
  $('#page-report').classList.remove('hidden');
  $('#page-report').scrollTop = 0;
}

function closeReportPage() {
  $('#page-report').classList.add('hidden');
}

function renderReport() {
  const chips = $('#report-range');
  if (chips) chips.innerHTML = [['month', '本月'], ['year', '今年']].map(([v, l]) =>
    `<button type="button" class="tag-chip${reportRange === v ? ' selected' : ''}" data-range="${v}">${l}</button>`).join('');
  const body = $('#report-body');
  if (!body) return;

  const now = new Date();
  const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear());
  const inRange = (ds) => ds && (reportRange === 'month' ? ds.slice(0, 7) === ym : ds.slice(0, 4) === yy);

  let spend = 0, waste = 0, idle = 0, expiredN = 0;
  for (const it of state.items) {
    if (it.price && inRange(it.purchaseDate)) spend += it.price * (it.quantity || 1);
    const d = it.expiryDate ? daysUntil(it.expiryDate) : null;
    if (d !== null && d < 0) {
      expiredN++;
      if (it.price) waste += it.price * (it.quantity || 1);
    }
    if ((it.usage || 'often') === 'idle') idle++;
  }
  const total = state.items.length;
  const idlePct = total ? Math.round(idle / total * 100) : 0;

  // 手绘甜甜圈：闲置占比
  const dash = Math.round(idlePct * 2.2);
  const donut = `
    <div class="donut-wrap">
      <svg viewBox="0 0 120 120" class="donut">
        <circle cx="60" cy="60" r="46" fill="none" stroke="#F4F1E9" stroke-width="18"/>
        <circle cx="60" cy="60" r="46" fill="none" stroke="#FAD2DC" stroke-width="18"
          stroke-dasharray="${dash} 220" stroke-linecap="round" transform="rotate(-90 60 60)"/>
        <text x="60" y="66" text-anchor="middle" font-size="24" fill="#25211F" style="font-family:var(--font-cute)">${idlePct}%</text>
      </svg>
      <span>闲置物品占比（${idle}/${total}）</span>
    </div>`;

  // 常用物品 TOP10（按数量）
  const top = state.items.filter((it) => (it.usage || 'often') === 'often')
    .sort((a, b) => b.quantity - a.quantity).slice(0, 10);
  const maxQ = Math.max(1, ...top.map((t) => t.quantity));
  const topHtml = top.length ? top.map((it, i) => `
    <div class="bar-row">
      <span class="bar-label">${iconHtml(it.icon || catIcon(it.category))}${escapeHtml(it.name)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(8, Math.round(it.quantity / maxQ * 100))}%"></div></div>
      <span class="bar-val">${fmtNum(it.quantity)}</span>
    </div>`).join('') : '<div class="chart-empty">还没有常用物品</div>';

  const copy = [];
  if (idlePct >= 30 && idle > 0) copy.push(`今年有 ${idle} 件物品一次都没怎么用过，它们在家园里快孤单啦 🥺`);
  if (waste > 0) copy.push(`过期浪费了约 ${fmtNum(waste)} 元，下次少买一点点`);
  if (spend > 0) copy.push(`这段时间为家里添置了约 ${fmtNum(spend)} 元的宝贝`);
  if (!copy.length) copy.push('数据还不够多，继续记录就能看到有趣的分析啦');

  body.innerHTML = `
    <div class="panel"><h2>💰 这段时间的花费</h2>
      <div class="report-big"><b>${spend ? fmtNum(spend) : '0'}</b><span>元</span></div>
      ${copy.map((c) => `<p class="report-copy">✿ ${escapeHtml(c)}</p>`).join('')}
    </div>
    <div class="panel"><h2>🌙 闲置占比</h2>${donut}</div>
    <div class="panel"><h2>⭐ 常用物品 TOP10</h2>${topHtml}</div>
    <div class="panel"><h2>😱 过期浪费</h2>
      ${expiredN ? `<p class="report-copy">有 ${expiredN} 位居民过期了，浪费约 <b>${fmtNum(waste)} 元</b></p>` : '<div class="chart-empty">没有过期浪费，很棒！</div>'}
    </div>`;
}

/* ---------------- 猫咪小区（整合自小猫微信小程序） ---------------- */

const LS_CATS = 'homeInventory.cats.v1';
const LS_CARE = 'homeInventory.care.v1';
const LS_CATTODO = 'homeInventory.catTodos.v1';

function loadCats() {
  try { state.cats = JSON.parse(localStorage.getItem(LS_CATS)) || []; } catch { state.cats = []; }
  try { state.careRecords = JSON.parse(localStorage.getItem(LS_CARE)) || []; } catch { state.careRecords = []; }
  try { state.catTodos = JSON.parse(localStorage.getItem(LS_CATTODO)) || []; } catch { state.catTodos = []; }
}

function saveCats() { localStorage.setItem(LS_CATS, JSON.stringify(state.cats)); }
function saveCare() { localStorage.setItem(LS_CARE, JSON.stringify(state.careRecords)); }
function saveCatTodos() { localStorage.setItem(LS_CATTODO, JSON.stringify(state.catTodos)); }

function findCareType(key) {
  for (const g of CARE_GROUPS)
    for (const t of g.items)
      if (t.key === key) return { key: t.key, name: t.name, icon: t.icon, group: g.group };
  return null;
}

function careTypeName(key) {
  const c = findCareType(key);
  return c ? c.name : key;
}

/** 库存扣减：记录消耗日志并减数量（数量不足时扣到 0） */
function deductItemStock(itemId, q, note) {
  const it = state.items.find((i) => i.id === itemId);
  if (!it || q <= 0) return false;
  const realQ = Math.min(q, it.quantity);
  it.quantity = +(Math.max(0, (parseFloat(it.quantity) || 0) - q)).toFixed(2);
  it.updatedAt = new Date().toISOString();
  it.log = it.log || [];
  it.log.unshift({ d: todayStr(), t: '消耗', q: -realQ });
  it.log = it.log.slice(0, 60);
  return true;
}

function renderCats() {
  const list = $('#cats-list');
  if (!list) return;
  list.innerHTML = state.cats.length ? state.cats.map((c) => `
    <div class="cat-profile">
      <svg class="ic cat-avatar" aria-hidden="true"><use href="#ic-catface"/></svg>
      <div class="cat-profile-info">
        <b>${escapeHtml(c.name)}</b>
        <small>${escapeHtml(c.breed || '猫咪')}${c.gender ? ' · ' + escapeHtml(c.gender) : ''}${c.birthday ? ' · ' + escapeHtml(c.birthday) : ''}</small>
      </div>
      <button type="button" class="tag-x" data-delcat="${c.id}" title="送走">✕</button>
    </div>`).join('')
    : '<div class="chart-empty">还没有猫咪住户，点右上角「领养一只」</div>';
}

function renderCareList() {
  const list = $('#care-list');
  if (!list) return;
  const recs = state.careRecords.slice(0, 30);
  $('#care-count').textContent = `共 ${state.careRecords.length} 条`;
  list.innerHTML = recs.length ? recs.map((r) => `
    <div class="care-row">
      <span class="care-ico">${typeof r.icon === 'string' && r.icon.length <= 4 ? escapeHtml(r.icon) : iconHtml(r.icon)}</span>
      <div class="care-main">
        <b>${escapeHtml(r.name)}</b>
        <small>${escapeHtml(r.date)} ${escapeHtml(r.time || '')}${r.petsNames ? ' · ' + escapeHtml(r.petsNames) : ''}${r.note ? ' · ' + escapeHtml(r.note) : ''}</small>
        ${r.syncNames ? `<small class="care-synced">🔗 已扣库存：${escapeHtml(r.syncNames)}</small>` : ''}
      </div>
      <button type="button" class="tag-x" data-delcare="${r.id}" title="删除">✕</button>
    </div>`).join('')
    : '<div class="chart-empty">还没有记录，点上面的按钮记一笔</div>';
  const h = $('#health-list');
  if (h) {
    const med = state.careRecords.filter((r) => CARE_MEDICAL.includes(r.type));
    $('#health-count').textContent = `共 ${med.length} 条`;
    h.innerHTML = med.length ? med.map((r) => `
      <div class="care-row">
        <span class="care-ico">${typeof r.icon === 'string' && r.icon.length <= 4 ? escapeHtml(r.icon) : iconHtml(r.icon)}</span>
        <div class="care-main"><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.date)} ${escapeHtml(r.time || '')}${r.note ? ' · ' + escapeHtml(r.note) : ''}</small></div>
      </div>`).join('') : '<div class="chart-empty">还没有健康医疗记录</div>';
  }
}

function renderCatTodos() {
  const el = $('#cat-todos-list');
  if (!el) return;
  const list = state.catTodos.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  el.innerHTML = list.length ? list.map((t) => `
    <div class="care-row cat-todo-row ${t.done ? 'done' : ''}">
      <label class="cat-todo-check"><input type="checkbox" data-todo="${t.id}" ${t.done ? 'checked' : ''}><span class="cat-todo-fake"></span></label>
      <div class="care-main"><b class="${t.done ? 'done-text' : ''}">${escapeHtml(t.title)}</b><small>${escapeHtml(t.date)} · ${t.repeat === 'none' ? '不重复' : t.repeat === 'daily' ? '每天' : t.repeat === 'weekly' ? '每周' : '每月'}</small></div>
      <button type="button" class="tag-x" data-deltodo="${t.id}" title="删除">✕</button>
    </div>`).join('') : '<div class="chart-empty">没有待办，安排一个吧</div>';
}

function addCat(name, breed) {
  state.cats.push({ id: uid(), name: name.trim().slice(0, 12), breed: (breed || '').trim().slice(0, 16), gender: '', birthday: '' });
  saveCats();
  renderCats();
}

function addCatTodo(title, date, repeat) {
  state.catTodos.unshift({ id: uid(), title: title.trim().slice(0, 30), date: date || todayStr(), repeat: repeat || 'none', done: false });
  saveCatTodos();
  renderCatTodos();
}

function toggleCatTodo(id) {
  const t = state.catTodos.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  if (t.done && t.repeat && t.repeat !== 'none') {
    // 周期待办：完成后顺延一个周期（保留一条未完成）
    const base = new Date(t.date >= todayStr() ? t.date : todayStr());
    if (t.repeat === 'daily') base.setDate(base.getDate() + 1);
    else if (t.repeat === 'weekly') base.setDate(base.getDate() + 7);
    else base.setMonth(base.getMonth() + 1);
    state.catTodos.unshift({ id: uid(), title: t.title, date: toYMD(base), repeat: t.repeat, done: false });
  }
  saveCatTodos();
  renderCatTodos();
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
  // 自定义位置（不在五大房间）→ 同步显示在地图中间空地
  const customs = distinctValues((it) => it.location)
    .filter((l) => !ROOMS.some((r) => l.includes(r)));
  const unlocated = state.items.filter((it) => !(it.location || '').trim());
  const zx = 268, zy = 262, zw = 160, zh = 130;
  const firstLoc = customs[0];
  const firstList = firstLoc ? inRoom(firstLoc) : [];
  const restN = customs.slice(1).reduce((n, l) => n + inRoom(l).length, 0) + unlocated.length;
  const zoneLabel = firstLoc || (unlocated.length ? '未分配' : '');
  if (zoneLabel) {
    const zoneItems = firstLoc ? firstList : unlocated;
    parts.push('<g class="map-zone" data-room="' + (firstLoc ? escapeHtml(firstLoc) : '') + '" style="cursor:pointer"><rect x="' + zx + '" y="' + zy + '" width="' + zw + '" height="' + zh + '" rx="26" fill="#fff" stroke="#25211F" stroke-width="3" stroke-dasharray="26 8 18 9"/><rect x="' + (zx + 12) + '" y="' + (zy - 14) + '" width="' + Math.min(zw - 24, 34 + zoneLabel.length * 17) + '" height="30" rx="15" fill="#fff" stroke="#25211F" stroke-width="2.5"/><text x="' + (zx + 24) + '" y="' + (zy + 7) + '" font-size="16" fill="#25211F" style="font-family:var(--font-cute)">' + escapeHtml(zoneLabel) + '</text>' + (restN ? '<text x="' + (zx + zw - 14) + '" y="' + (zy + zh - 12) + '" font-size="14" font-weight="900" text-anchor="end" fill="#25211F" style="font-family:var(--font-cute)">+' + restN + '</text>' : '') + '</g>');
    zoneItems.slice(0, 3).forEach((it, i) => {
      const iconId = /^([a-z][a-z0-9-]*)$/.test(it.icon || catIcon(it.category)) ? (it.icon || catIcon(it.category)) : 'box';
      parts.push('<g class="map-zone" data-room="' + (firstLoc ? escapeHtml(firstLoc) : '') + '" style="cursor:pointer"><use href="#ic-' + iconId + '" x="' + (zx + 20 + i * 46) + '" y="' + (zy + 36) + '" width="40" height="40"/></g>');
    });
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

function restockItems() {
  return state.items.filter((it) => it.minStock > 0 && it.quantity <= it.minStock);
}

function buyQtyOf(it) {
  return Math.max(1, Math.ceil((it.minStock || 0) - it.quantity + 1));
}

function renderShopBubble() {
  const el = $('#shop-bubble');
  if (!el) return;
  const n = restockItems().length;
  el.classList.toggle('hidden', !n);
  if (n) el.innerHTML = `🛒 采购小票上有 <b>${n}</b> 件物品等着补货，点我看看 →`;
}

function renderStats() {
  renderDiaryHead();
  renderDataCards();
  renderMap();
  renderBellBadge();
  renderShopBubble();
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
      <span class="badge ${badgeClass(info)}">${info.label}</span><br>
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
  const tf = state.tagFilter || '';
  const st = [['all', '全部'], ['often', '常用'], ['idle', '闲置'], ['soon', '临期'], ['expired', '过期']];
  let html = `<span class="tag-group">状态</span>` + st.map(([v, l]) =>
    `<button type="button" class="tag-chip${f.status === v && !rf && !tf ? ' selected' : ''}" data-status="${v}">${l}</button>`).join('');
  html += `<span class="tag-group">类目</span>` + state.categories.map((c) =>
    `<button type="button" class="tag-chip${f.category === c.name ? ' selected' : ''}" data-cat="${escapeHtml(c.name)}">${iconHtml(c.icon)}${escapeHtml(c.name)}</button>`).join('');
  html += ROOMS.map((r) =>
    `<button type="button" class="tag-chip${rf === r ? ' selected' : ''}" data-room="${escapeHtml(r)}">${r}</button>`).join('');
  const tagSet = new Set();
  for (const it of state.items) for (const t of (it.tags || [])) tagSet.add(t);
  for (const t of tagSet) html += `<button type="button" class="tag-chip tag-only${state.tagFilter === t ? ' selected' : ''}" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</button>`;
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
    if (state.tagFilter && !(it.tags || []).includes(state.tagFilter)) return false;
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
      <span class="badge ${badgeClass(info)}">${info.label}</span>
      ${usage}
      <span class="book-qty">×${fmtNum(it.quantity)} ${escapeHtml(it.unit)}</span>
      ${(it.tags || []).length ? `<span class="book-tags">${(it.tags || []).map((t) => '#' + escapeHtml(t)).join(' ')}</span>` : ''}
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
    `<span class="badge ${badgeClass(info)}">${info.label}</span>` +
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
      ${(it.tags || []).length ? dRow('标签', (it.tags || []).map((t) => '#' + escapeHtml(t)).join(' ')) : ''}
    </div>
    <div class="panel info-card"><h2>时间信息</h2>
      ${dRow('购入日期', it.purchaseDate)}
      ${dRow('保质期至', it.expiryDate)}
      ${dRow('过期提醒', it.remind ? '已开启 🔔' : '已关闭')}
      ${dRow('开封日期', it.openedDate)}
      ${dRow('开封后可用', openDue(it) ? `${it.openLifeDays} 天 · 至 ${openDue(it)}` : '')}
      ${dRow('维保周期', it.maintainCycleDays ? `每 ${it.maintainCycleDays} 天` : '')}
      ${dRow('上次维护', it.lastMaintainDate)}
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

let confirmCb = null;

function showConfirm(msg, cb) {
  $('#confirm-msg').textContent = msg;
  confirmCb = cb || null;
  $('#confirm-overlay').classList.remove('hidden');
}

function closeConfirm() {
  $('#confirm-overlay').classList.add('hidden');
  confirmCb = null;
}

function deleteItem(id) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  showConfirm(`确定送走「${it.name}」吗？它搬走后小区会想它的`, () => {
    state.items = state.items.filter((i) => i.id !== id);
    saveItems();
    renderAll();
    toast('它搬走了，小区会想它的');
  });
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
  formTags = item ? [...(item.tags || [])] : [];
  renderFormTags();
  form.elements['openedDate'].value = item ? (item.openedDate || '') : '';
  form.elements['openLifeDays'].value = item && item.openLifeDays ? item.openLifeDays : '';
  form.elements['maintainCycleDays'].value = item && item.maintainCycleDays ? item.maintainCycleDays : '';
  form.elements['lastMaintainDate'].value = item ? (item.lastMaintainDate || '') : '';
  const ms = item ? fmtNum(item.minStock) : 0;
  form.elements['minStock'].value = ms;
  const slider = $('#f-minstock');
  slider.value = Math.min(20, parseFloat(ms) || 0);
  $('#f-minstock-val').textContent = slider.value;
  renderCatSelect();
  renderLocChips();
  renderUnitChips();
  updateSliderMax();
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


function renderFormTags() {
  const el = $('#f-tag-list');
  if (!el) return;
  el.innerHTML = formTags.map((t) =>
    `<span class="chip">#${escapeHtml(t)} <button type="button" class="tag-x" data-del="${escapeHtml(t)}" title="移除">✕</button></span>`).join('');
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
    tags: [...formTags],
    openedDate: dateOrNull(fd.get('openedDate')),
    openLifeDays: parseFloat(fd.get('openLifeDays')) || 0,
    maintainCycleDays: parseFloat(fd.get('maintainCycleDays')) || 0,
    lastMaintainDate: dateOrNull(fd.get('lastMaintainDate')),
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
  showConfirm(msg, () => {
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
    renderTagChips();
    renderBook();
    renderCharts();
  });
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
    toast('导入失败：' + err.message);
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

/* ---------------- 猫咪记录表单（含库存联动） ---------------- */

function openCareForm(presetType) {
  const c = presetType ? findCareType(presetType) : null;
  state.careType = c ? c.key : '';
  state.carePetSel = {};
  state.careSyncSel = {};
  const form = $('#item-form');
  $('#f-care-date').value = todayStr();
  $('#f-care-time').value = new Date().toTimeString().slice(0, 5);
  $('#f-care-note').value = '';
  $('#f-care-amount').value = '';
  $('#f-care-weight').value = '';
  renderCareCats();
  renderCarePets();
  renderCareSync();
  $('#care-weight-row').classList.toggle('hidden', state.careType !== 'weight');
  $('#page-care').classList.remove('hidden');
  $('#page-care').scrollTop = 0;
}

function closeCareForm() {
  $('#page-care').classList.add('hidden');
  renderAll();
}

function renderCareCats() {
  const el = $('#care-cats');
  if (!el) return;
  el.innerHTML = CARE_GROUPS.map((g) => `
    <div class="care-group">
      <span class="care-group-name">${escapeHtml(g.group)}</span>
      <div class="care-group-items">${g.items.map((t) =>
        `<button type="button" class="care-cat${state.careType === t.key ? ' selected' : ''}" data-type="${t.key}" title="${t.name}">${t.icon}<small>${escapeHtml(t.name)}</small></button>`).join('')}</div>
    </div>`).join('');
}

function renderCarePets() {
  const el = $('#care-pets');
  if (!el) return;
  el.innerHTML = state.cats.length ? state.cats.map((c) =>
    `<button type="button" class="cat-chip${state.carePetSel[c.id] ? ' selected' : ''}" data-pet="${c.id}">${escapeHtml(c.name)}</button>`).join('')
    : '<div class="chart-empty">先去猫咪档案领养一只吧</div>';
}

/** 库存联动：消耗类记录 → 自动匹配物品（同名/同关键词/宠物类目） */
function careSyncCandidates(typeKey) {
  const kw = CARE_CONSUME_HINT[typeKey] || '';
  const scored = [];
  for (const it of state.items) {
    let score = 0;
    if (kw && it.name.includes(kw)) score += 4;
    if (kw && (it.category || '').includes(kw)) score += 3;
    if ((it.tags || []).some((t) => kw && (t.includes(kw) || kw.includes(t) && t.length > 1))) score += 2;
    if ((it.category || '') === '宠物' || (it.category || '') === '小猫') score += 1;
    if (score > 0) scored.push({ it, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((x) => x.it);
}

function renderCareSync() {
  const box = $('#care-sync-box');
  const list = $('#care-sync-list');
  if (!box || !list) return;
  const cands = careSyncCandidates(state.careType);
  if (!cands.length) {
    box.classList.add('hidden');
    list.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  list.innerHTML = cands.slice(0, 6).map((it) => `
    <label class="care-sync-row">
      <input type="checkbox" data-sync="${it.id}" ${state.careSyncSel[it.id] ? 'checked' : ''}>
      ${iconHtml(it.icon || catIcon(it.category))}
      <span class="care-sync-name">${escapeHtml(it.name)}</span>
      <small>现存 ${fmtNum(it.quantity)} ${escapeHtml(it.unit)}</small>
      <span class="care-sync-q">−<input type="number" min="0" step="any" value="1" data-syncq="${it.id}"></span>
    </label>`).join('');
}

function saveCareRecord() {
  const c = findCareType(state.careType);
  if (!c) { toast('请先选一个分类'); return; }
  const petIds = Object.keys(state.carePetSel).filter((k) => state.carePetSel[k]);
  if (!petIds.length) { toast('请选择要记录的猫咪'); return; }
  const date = $('#f-care-date').value || todayStr();
  const time = $('#f-care-time').value || new Date().toTimeString().slice(0, 5);
  const note = $('#f-care-note').value.trim();
  const amount = parseFloat($('#f-care-amount').value) || 0;
  const weight = parseFloat($('#f-care-weight').value) || 0;
  if (state.careType === 'weight' && !weight) { toast('请填写体重'); return; }

  const petsNames = petIds.map((pid) => { const c = state.cats.find((x) => x.id === pid); return c ? c.name : ''; }).filter(Boolean).join('、');
  const syncs = [];
  for (const it of state.items) {
    if (state.careSyncSel[it.id]) {
      const input = document.querySelector('[data-syncq="' + it.id + '"]');
      const q = Math.max(1, parseFloat(input ? input.value : 1) || 1);
      syncs.push({ itemId: it.id, name: it.name, q });
    }
  }

  const rec = {
    id: uid(), type: state.careType, name: c.name, icon: c.icon,
    date, time, note, amount, weight: state.careType === 'weight' ? weight : 0,
    pets: petIds, petsNames,
    sync: syncs.map((s) => ({ name: s.name, q: s.q })),
  };
  state.careRecords.unshift(rec);
  saveCare();

  // 同步扣减库存（写入消耗日志 → 预测/补货自动生效）
  syncs.forEach((s) => { deductItemStock(s.itemId, s.q, c.name); });
  saveItems();

  closeCareForm();
  renderCareList();
  toast(syncs.length ? `已记录「${c.name}」，并同步扣减了 ${syncs.length} 件库存` : `已记录「${c.name}」`);
}

/* ---------------- 事件绑定 ---------------- */
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
    const b = e.target.closest('[data-status],[data-room],[data-tag]');
    if (!b) return;
    if (b.dataset.status) state.filters.status = b.dataset.status;
    if (b.dataset.cat) state.filters.category = state.filters.category === b.dataset.cat ? 'all' : b.dataset.cat;
    if (b.dataset.room) state.roomFilter = state.roomFilter === b.dataset.room ? '' : b.dataset.room;
    if (b.dataset.tag) state.tagFilter = state.tagFilter === b.dataset.tag ? '' : b.dataset.tag;
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
  $('#pd-del').addEventListener('click', () => {
    const id = state.detailId;
    if (!id) return;
    closeDetail(true);
    deleteItem(id);
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

  // 单位选择（联动阈值滑条量程）
  $('#unit-select').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unit]');
    if (!b) return;
    $('#f-unit').value = b.dataset.unit;
    renderUnitChips();
    updateSliderMax();
  });
  $('#f-unit').addEventListener('input', () => { renderUnitChips(); updateSliderMax(); });

  // 最低库存滑条
  $('#f-minstock').addEventListener('input', (e) => {
    $('#f-minstock-val').textContent = e.target.value;
  });

  // 自定义标签输入
  $('#f-tag-add').addEventListener('click', () => {
    const v = $('#f-tag-input').value.trim();
    if (!v) return;
    if (formTags.includes(v)) { toast('这个标签已经有了'); return; }
    formTags.push(v);
    $('#f-tag-input').value = '';
    renderFormTags();
  });
  $('#f-tag-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#f-tag-add').click(); }
  });
  $('#f-tag-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    formTags = formTags.filter((t) => t !== b.dataset.del);
    renderFormTags();
  });

  // 采购小票
  $('#shop-bubble').addEventListener('click', openShopPage);
  $('#menu-shop').addEventListener('click', openShopPage);
  $('#shop-back').addEventListener('click', closeShopPage);
  $('#shop-receipt').addEventListener('change', (e) => {
    if (e.target.dataset.buy) {
      const it = state.items.find((i) => i.id === e.target.dataset.buy);
      if (!it) return;
      const q = buyQtyOf(it);
      it.quantity = (parseFloat(it.quantity) || 0) + q;
      it.updatedAt = new Date().toISOString();
      it.log = it.log || [];
      it.log.unshift({ d: todayStr(), t: '入库', q });
      it.log = it.log.slice(0, 60);
      saveItems();
      renderShop();
      renderAll();
      toast(`已购入「${it.name}」×${q}，自动入库啦`);
    } else if (e.target.dataset.manual !== undefined) {
      const i = +e.target.dataset.manual;
      if (shopList[i]) shopList[i].done = e.target.checked;
      saveShop();
    }
  });
  $('#shop-add-btn').addEventListener('click', () => {
    const v = $('#shop-add-name').value.trim();
    if (!v) { toast('先写上要买什么'); return; }
    loadShop();
    shopList.push({ name: v, done: false });
    saveShop();
    $('#shop-add-name').value = '';
    renderShop();
  });
  $('#shop-share').addEventListener('click', shareShopList);

  // 分析报告
  $('#btn-report').addEventListener('click', openReportPage);
  $('#menu-report').addEventListener('click', openReportPage);
  $('#report-back').addEventListener('click', closeReportPage);
  $('#report-range').addEventListener('click', (e) => {
    const b = e.target.closest('[data-range]');
    if (!b) return;
    reportRange = b.dataset.range;
    renderReport();
  });

  // 确认弹窗
  $('#confirm-ok').addEventListener('click', () => {
    const cb = confirmCb;
    closeConfirm();
    if (cb) cb();
  });
  $('#confirm-cancel').addEventListener('click', closeConfirm);
  $('#confirm-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeConfirm(); });

  // 猫咪小区
  $('#cat-add-toggle').addEventListener('click', () => $('#cat-add-row').classList.toggle('hidden'));
  $('#cat-add-btn2').addEventListener('click', () => {
    const name = $('#cat-profile-name').value.trim();
    if (!name) { toast('先给猫咪起个名字'); return; }
    addCat(name, $('#cat-new-breed').value);
    $('#cat-new-name').value = '';
    $('#cat-new-breed').value = '';
    $('#cat-add-row').classList.add('hidden');
    toast(`${name} 入住了猫咪小区`);
  });
  $('#cats-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-delcat]');
    if (!b) return;
    showConfirm('确定送走这只猫咪吗？它的记录会保留', () => {
      state.cats = state.cats.filter((c) => c.id !== b.dataset.delcat);
      saveCats();
      renderCats();
      toast('猫咪搬去了新家');
    });
  });
  $('#care-seg').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    $$('#care-seg .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
    ['records', 'todos', 'health'].forEach((seg) =>
      $('#care-seg-' + seg).classList.toggle('hidden', seg !== b.dataset.seg));
    if (b.dataset.seg === 'records') renderCareList();
    if (b.dataset.seg === 'todos') renderCatTodos();
    if (b.dataset.seg === 'health') renderCareList();
  });
  $('#btn-care-add').addEventListener('click', () => openCareForm());
  $('#care-back').addEventListener('click', closeCareForm);
  $('#care-cats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]');
    if (!b) return;
    state.careType = b.dataset.type;
    state.careSyncSel = {};
    renderCareCats();
    $('#care-weight-row').classList.toggle('hidden', state.careType !== 'weight');
    renderCareSync();
  });
  $('#care-pets').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pet]');
    if (!b) return;
    state.carePetSel[b.dataset.pet] = !state.carePetSel[b.dataset.pet];
    renderCarePets();
  });
  $('#care-sync-list').addEventListener('click', (e) => {
    const cb = e.target.closest('[data-sync]');
    if (cb) state.careSyncSel[cb.dataset.sync] = cb.checked;
  });
  $('#care-save').addEventListener('click', saveCareRecord);
  $('#care-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-delcare]');
    if (!b) return;
    state.careRecords = state.careRecords.filter((r) => r.id !== b.dataset.delcare);
    saveCare();
    renderCareList();
  });
  $('#health-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-delcare]');
    if (!b) return;
    state.careRecords = state.careRecords.filter((r) => r.id !== b.dataset.delcare);
    saveCare();
    renderCareList();
  });
  $('#cat-todo-add').addEventListener('click', () => {
    const title = $('#cat-todo-title').value.trim();
    if (!title) { toast('先写上待办内容'); return; }
    addCatTodo(title, $('#cat-todo-date').value, $('#cat-todo-repeat').value);
    $('#cat-todo-title').value = '';
  });
  $('#cat-todos-list').addEventListener('click', (e) => {
    const c = e.target.closest('[data-todo]');
    if (c) { toggleCatTodo(c.dataset.todo); return; }
    const d = e.target.closest('[data-deltodo]');
    if (d) {
      state.catTodos = state.catTodos.filter((t) => t.id !== d.dataset.deltodo);
      saveCatTodos();
      renderCatTodos();
    }
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
  loadShop();
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
