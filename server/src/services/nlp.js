// Rule-based parser for quick task entry. This is pattern matching, not machine learning.
// Example: "Fix login bug tomorrow high priority @riya #backend 2h"

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function parseTaskText(input, members = [], now = new Date()) {
  let text = ` ${input} `;
  const take = (re, fn) => {
    const m = text.match(re);
    if (!m) return null;
    text = text.replace(re, ' ');
    return fn ? fn(m) : m;
  };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out = { title: '', priority: undefined, dueDate: null, estimateMinutes: 0, labels: [], assigneeIds: [], assigneeNames: [], unmatched: [] };

  // labels and mentions
  out.labels = [...text.matchAll(/#([\w-]+)/g)].map((m) => m[1].toLowerCase());
  text = text.replace(/#[\w-]+/g, ' ');
  const mentions = [...text.matchAll(/@([\w.-]+)/g)].map((m) => m[1].toLowerCase());
  text = text.replace(/@[\w.-]+/g, ' ');
  mentions.forEach((name) => {
    const hit = members.find((m) => {
      const full = m.name.toLowerCase().replace(/\s+/g, '');
      const first = m.name.toLowerCase().split(/\s+/)[0];
      return first === name || full === name || full.startsWith(name) || m.email.toLowerCase().split('@')[0] === name;
    });
    if (hit && !out.assigneeIds.includes(String(hit._id))) {
      out.assigneeIds.push(String(hit._id));
      out.assigneeNames.push(hit.name);
    } else if (!hit) out.unmatched.push(name);
  });

  // estimate: 2h, 1.5 hours, 45m, 90 min
  take(/\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i, (m) => {
    const n = parseFloat(m[1]);
    out.estimateMinutes = Math.round(/^h/i.test(m[2]) ? n * 60 : n);
  });

  // priority
  if (take(/\b(urgent|asap|critical)\b(\s+priority)?/i)) out.priority = 'urgent';
  else if (take(/\bhigh\s+priority\b|\bpriority\s+high\b|\bhigh\b/i)) out.priority = 'high';
  else if (take(/\blow\s+priority\b|\bpriority\s+low\b|\blow\b/i)) out.priority = 'low';
  else if (take(/\b(medium|normal)(\s+priority)?\b/i)) out.priority = 'medium';

  // due date
  const set = (d) => (out.dueDate = ymd(d));
  take(/\b(?:by|due|on|before)?\s*(\d{4})-(\d{2})-(\d{2})\b/i, (m) => set(new Date(+m[1], +m[2] - 1, +m[3]))) ||
    take(/\b(?:by|due|on)?\s*today\b/i, () => set(today)) ||
    take(/\b(?:by|due|on)?\s*tomorrow\b/i, () => set(addDays(today, 1))) ||
    take(/\bin\s+(\d+)\s+(day|days|week|weeks)\b/i, (m) => set(addDays(today, +m[1] * (/^w/i.test(m[2]) ? 7 : 1)))) ||
    take(/\bnext\s+week\b/i, () => set(addDays(today, 7))) ||
    take(new RegExp(`\\b(?:by|due|on)?\\s*(next\\s+)?(${WEEKDAYS.join('|')}|${WEEKDAYS.map((w) => w.slice(0, 3)).join('|')})\\b`, 'i'), (m) => {
      const idx = WEEKDAYS.findIndex((w) => w.startsWith(m[2].toLowerCase().slice(0, 3)));
      let diff = (idx - today.getDay() + 7) % 7;
      if (diff === 0 || m[1]) diff += diff === 0 ? 7 : m[1] && diff < 7 ? 7 : 0;
      set(addDays(today, diff));
    }) ||
    take(new RegExp(`\\b(?:by|due|on)?\\s*(${MONTHS.join('|')})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'), (m) => monthDay(m[1], m[2])) ||
    take(new RegExp(`\\b(?:by|due|on)?\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join('|')})[a-z]*\\b`, 'i'), (m) => monthDay(m[2], m[1]));

  function monthDay(mon, day) {
    let d = new Date(now.getFullYear(), MONTHS.indexOf(mon.toLowerCase().slice(0, 3)), +day);
    if (d < today) d = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
    set(d);
  }

  const title = text.replace(/\b(by|due|on|for|to|at)\s*$/i, '').replace(/\s+/g, ' ').trim();
  out.title = title ? title[0].toUpperCase() + title.slice(1) : '';
  return out;
}
