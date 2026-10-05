'use strict';

const STORAGE_KEY = 'xiaoman-ledger-v1';
const categories = {
  expense: ['餐饮', '交通', '购物', '住房', '娱乐', '医疗', '学习', '其他'],
  income: ['工资', '奖金', '兼职', '投资', '红包', '其他'],
};
const icons = { 餐饮: '☕', 交通: '↗', 购物: '◇', 住房: '⌂', 娱乐: '♫', 医疗: '＋', 学习: '▤', 工资: '¥', 奖金: '☆', 兼职: '▣', 投资: '↗', 红包: '♡', 其他: '·' };
const $ = (id) => document.getElementById(id);
const money = (cents) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(cents / 100);
const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && localDate(date) === value;
}
function validEntry(entry) {
  return entry && typeof entry.id === 'string' && validDate(entry.date) &&
    Object.hasOwn(categories, entry.type) && categories[entry.type].includes(entry.category) &&
    Number.isSafeInteger(entry.cents) && entry.cents > 0 && entry.cents <= 99999999999 &&
    typeof entry.note === 'string' && entry.note.length <= 200 && Number.isFinite(entry.createdAt);
}
let entries = [];
let storageReadable = true;
let visibleCount = 10;
function message(text, error = false) {
  $('message').textContent = text;
  $('message').classList.toggle('error', error);
}
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== null) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(validEntry) || new Set(parsed.map((entry) => entry.id)).size !== parsed.length) throw new Error('Invalid saved data');
    entries = parsed;
  }
} catch {
  storageReadable = false;
  message('无法读取本地账本。为保护已有数据，已暂停保存；请检查浏览器存储设置。', true);
}
function persist(next) {
  if (!storageReadable) {
    message('本地账本无法读取，暂时不能修改。请检查浏览器存储设置。', true);
    return false;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    entries = next;
    return true;
  } catch {
    message('保存失败：浏览器存储不可用或空间不足。请保留表单内容并检查设置。', true);
    return false;
  }
}
function updateCategories() {
  const type = $('entry-form').elements.type.value;
  $('category').replaceChildren(...categories[type].map((category) => new Option(category, category)));
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
function render() {
  const now = new Date();
  const month = localDate(now).slice(0, 7);
  $('month-label').textContent = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 · 本月概览`;
  const totals = entries.filter((entry) => entry.date.startsWith(month)).reduce((result, entry) => {
    result[entry.type] += entry.cents;
    return result;
  }, { income: 0, expense: 0 });
  $('income').textContent = money(totals.income);
  $('expense').textContent = money(totals.expense);
  $('balance').textContent = money(totals.income - totals.expense);
  const filter = $('filter').value;
  const filtered = entries.filter((entry) => filter === 'all' || entry.type === filter)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  $('record-count').textContent = filter === 'all' ? `共 ${entries.length} 笔记录 · 按日期排序` : `筛选出 ${filtered.length} 笔 · 共 ${entries.length} 笔`;
  $('records').replaceChildren();
  if (!filtered.length) {
    const empty = element('div', 'empty', '');
    empty.append(element('span', 'empty-icon', '▤'), element('strong', '', '还没有收支记录'), element('p', '', '记下第一笔，开启井井有条的每一天。'));
    $('records').append(empty);
  }
  filtered.slice(0, visibleCount).forEach((entry) => {
    const row = element('article', `record ${entry.type}`, '');
    const content = element('div', 'record-content', '');
    content.append(element('div', 'record-title', entry.category));
    if (entry.note) content.append(element('div', 'record-note', entry.note));
    const date = element('time', 'record-date', entry.date.replaceAll('-', '.'));
    date.dateTime = entry.date;
    content.append(date);
    const remove = element('button', 'delete-button', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `删除 ${entry.date} ${entry.category} ${money(entry.cents)} 的记录`);
    remove.addEventListener('click', () => {
      if (!window.confirm(`确定删除这笔${entry.type === 'income' ? '收入' : '支出'} ${money(entry.cents)} 吗？`)) return;
      if (persist(entries.filter((item) => item.id !== entry.id))) {
        render();
        message('记录已删除。');
      }
    });
    row.append(element('span', 'record-icon', icons[entry.category]), content,
      element('div', 'record-amount', `${entry.type === 'income' ? '+' : '−'}${money(entry.cents)}`), remove);
    $('records').append(row);
  });
  $('show-more').hidden = filtered.length <= visibleCount;
}
$('date').value = localDate();
updateCategories();
$('entry-form').addEventListener('change', (event) => {
  if (event.target.name === 'type') updateCategories();
});
$('entry-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const rawAmount = $('amount').value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(rawAmount)) {
    message('请输入大于 0 的金额，最多保留两位小数。', true);
    return;
  }
  const [whole, fraction = ''] = rawAmount.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  const entry = {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    date: $('date').value, type: form.elements.type.value, category: $('category').value,
    cents, note: $('note').value.trim(), createdAt: Date.now(),
  };
  if (!validEntry(entry)) {
    message('请检查日期、类别和金额；金额应在 0.01 至 999,999,999.99 元之间。', true);
    return;
  }
  if (persist([...entries, entry])) {
    $('amount').value = '';
    $('note').value = '';
    visibleCount = 10;
    render();
    message('已保存，刷新页面后记录仍会保留。');
    $('amount').focus();
  }
});
$('filter').addEventListener('change', () => { visibleCount = 10; render(); });
$('show-more').addEventListener('click', () => { visibleCount += 10; render(); });
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY || event.key === null) window.location.reload();
});
window.addEventListener('focus', render);
render();
