import { useMemo, useState } from 'react';

export default function CalendarView({ tasks, onOpen }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const out = Array(first.getDay()).fill(null);
    for (let d = 1; d <= days; d++) out.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    return out;
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = {};
    tasks.forEach((t) => {
      if (!t.dueDate) return;
      const d = new Date(t.dueDate);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      (map[key] ||= []).push(t);
    });
    return map;
  }, [tasks]);

  const shift = (n) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  const undated = tasks.filter((t) => !t.dueDate).length;

  return (
    <div className="panel">
      <div className="cal-head">
        <button className="btn" onClick={() => shift(-1)}>Previous</button>
        <h3>{cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
        <button className="btn" onClick={() => shift(1)}>Next</button>
      </div>
      <div className="cal-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {cells.map((d, i) => (
          <div key={i} className={`cal-cell ${d ? '' : 'cal-empty'}`}>
            {d && <span className="cal-num">{d.getDate()}</span>}
            {d && (byDay[`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`] || []).map((t) => (
              <button key={t._id} className={`cal-task p-${t.priority}`} onClick={() => onOpen(t)}>{t.title}</button>
            ))}
          </div>
        ))}
      </div>
      {undated > 0 && <p className="muted">{undated} {undated === 1 ? 'task has' : 'tasks have'} no due date and don't appear here.</p>}
    </div>
  );
}
