import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Insights({ projectId, refreshKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/projects/${projectId}/insights`).then(setData).catch((e) => setError(e.message));
  }, [projectId, refreshKey]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <p className="muted">Loading insights…</p>;
  const acc = data.estimateAccuracy;

  return (
    <div>
      <p className="muted">These are counts and averages from your own tasks. Taskboard does not make predictions yet.</p>
      <div className="stat-row">
        <div className="stat"><b>{data.total}</b><span>Total tasks</span></div>
        <div className="stat"><b>{data.open}</b><span>Open</span></div>
        <div className="stat"><b>{data.done}</b><span>Done</span></div>
        <div className="stat"><b className={data.overdue ? 'text-danger' : ''}>{data.overdue}</b><span>Overdue</span></div>
        <div className="stat"><b>{data.unassigned}</b><span>Open and unassigned</span></div>
      </div>

      <div className="two-col">
        <div className="panel">
          <h3>Workload by person</h3>
          <table>
            <thead><tr><th>Person</th><th>Open</th><th>Overdue</th><th>Estimated</th></tr></thead>
            <tbody>
              {data.workload.map((w) => (
                <tr key={w.userId}>
                  <td>{w.name}</td><td>{w.openTasks}</td>
                  <td className={w.overdue ? 'text-danger' : ''}>{w.overdue}</td>
                  <td>{w.estimateMinutes} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <h3>Estimate vs actual</h3>
          {acc.sampleSize === 0 ? (
            <p className="muted">Finish a few tasks that have both an estimate and logged time, and the comparison appears here.</p>
          ) : (
            <>
              <p>Across {acc.sampleSize} finished {acc.sampleSize === 1 ? 'task' : 'tasks'}, you estimated <b>{acc.estimatedMinutes} min</b> and logged <b>{acc.actualMinutes} min</b>
                {' '}({Math.round((acc.actualMinutes / acc.estimatedMinutes) * 100)}% of the estimate).</p>
              {acc.sampleSize < 10 && <p className="muted">Small sample. Treat this as a rough guide.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
