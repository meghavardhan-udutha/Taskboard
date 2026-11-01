import { useEffect, useState } from 'react';
import { api } from '../api.js';

const d = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const pct = (n) => (n == null ? 'n/a' : `${Math.round(n * 100)}%`);

export default function AIPanel({ projectId, refreshKey, onOpen }) {
  const [analysis, setAnalysis] = useState(null);
  const [rec, setRec] = useState(null);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    setError('');
    Promise.all([api(`/projects/${projectId}/ai/analysis`), api(`/projects/${projectId}/ai/recommendations`)])
      .then(([a, r]) => { setAnalysis(a); setRec(r); })
      .catch((e) => setError(e.message));
  }, [projectId, refreshKey]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!analysis || !rec) return <p className="muted">Working out the numbers…</p>;
  const { duration, late, forecast } = analysis;

  const getSummary = async () => {
    setBusy('summary');
    try { setSummary(await api(`/projects/${projectId}/ai/summary`)); } catch (e) { setSummary({ summary: e.message, source: 'error' }); }
    setBusy('');
  };
  const ask = async (e) => {
    e.preventDefault();
    setBusy('ask');
    try { setAnswer({ text: (await api(`/projects/${projectId}/ai/ask`, { method: 'POST', body: { question } })).answer }); }
    catch (err) { setAnswer({ error: err.message }); }
    setBusy('');
  };
  const openTask = (id) => onOpen(id);

  return (
    <div>
      {analysis.isSynthetic && (
        <div className="alert alert-warn" role="note">
          This project holds <b>synthetic sample data</b> made to try the AI features. The accuracy figures below describe the
          sample generator, not how well Taskboard will predict your real work.
        </div>
      )}

      <div className="panel">
        <h3>Project summary</h3>
        <p className="muted small">Written from your project's numbers. Without an AI key it uses a fixed template; with one it is rephrased by Claude.</p>
        {!summary && <button className="btn" onClick={getSummary} disabled={busy === 'summary'}>{busy === 'summary' ? 'Writing…' : 'Write summary'}</button>}
        {summary && (
          <>
            <p>{summary.narrative || summary.summary}</p>
            <p className="muted small">Source: {summary.source === 'llm' ? 'AI-written from the facts' : summary.source === 'template' ? 'template (no AI key set)' : 'error'}{summary.notice ? ` · ${summary.notice}` : ''}</p>
          </>
        )}
      </div>

      <div className="two-col">
        <div className="panel">
          <h3>Finish forecast</h3>
          <p className="muted small">Statistics from recent weekly output. Not a trained model.</p>
          {forecast.available ? (
            <>
              <div className="stat-row small-stats">
                <div className="stat"><b>{d(forecast.finishBy.best)}</b><span>Best case</span></div>
                <div className="stat"><b>{d(forecast.finishBy.typical)}</b><span>Typical</span></div>
                <div className="stat"><b>{d(forecast.finishBy.worst)}</b><span>Slow case</span></div>
              </div>
              <p className="muted small">{forecast.remainingMinutes} min of predicted work left; the team typically finishes {forecast.weeklyMinutes.typical} min a week. {forecast.method}</p>
            </>
          ) : <p>{forecast.reason}</p>}
        </div>

        <div className="panel">
          <h3>Rework</h3>
          {rec.rework.rate == null ? <p className="muted">No finished tasks yet.</p> : (
            <>
              <p>{rec.rework.reopenedTasks} of {rec.rework.finishedTasks} finished tasks were reopened ({pct(rec.rework.rate)}).</p>
              {rec.rework.byPerson.length > 0 && (
                <table><thead><tr><th>Person</th><th>Finished</th><th>Reopened</th></tr></thead>
                  <tbody>{rec.rework.byPerson.map((p) => <tr key={p.name}><td>{p.name}</td><td>{p.finished}</td><td>{p.reopened} ({pct(p.rate)})</td></tr>)}</tbody></table>
              )}
              <p className="muted small">Counted when a task moves out of a done list.</p>
            </>
          )}
        </div>
      </div>

      <div className="two-col">
        <div className="panel">
          <h3>Task duration model</h3>
          <p className="muted small">Predicts how long a task really takes from its estimate, priority, who has it and how that person's past estimates turned out.</p>
          {!duration.available ? <p>{duration.reason}</p> : (
            <>
              <p><b>In use:</b> {duration.chosen === 'model' ? 'trained model' : duration.chosen === 'estimate' ? 'your estimate as-is' : 'estimate × average overrun'}. {duration.note}</p>
              <table>
                <thead><tr><th>Average error on {duration.metrics.testSize} newer tasks</th><th>Minutes</th></tr></thead>
                <tbody>
                  <tr><td>Trained model</td><td>{duration.metrics.maeMinutes.model}</td></tr>
                  <tr><td>Estimate × average overrun</td><td>{duration.metrics.maeMinutes.averageRatioBaseline}</td></tr>
                  <tr><td>Estimate as written</td><td>{duration.metrics.maeMinutes.rawEstimate}</td></tr>
                </tbody>
              </table>
              <p className="muted small">Trained on the older {duration.metrics.trainSize} tasks and tested on the newest ones. Biggest influences: {duration.drivers.map((x) => x.feature).join(', ')}.</p>
            </>
          )}
        </div>

        <div className="panel">
          <h3>Late-risk model</h3>
          <p className="muted small">Estimates the chance a task with a due date finishes after it.</p>
          {!late.available ? <p>{late.reason}</p> : (
            <>
              <p>{late.note}</p>
              <table>
                <tbody>
                  <tr><td>Ranking quality (AUC, 0.5 is a coin flip)</td><td>{late.metrics.auc}</td></tr>
                  <tr><td>Correct on newer tasks</td><td>{pct(late.metrics.accuracy)} (always guessing the common outcome: {pct(late.metrics.majorityClassAccuracy)})</td></tr>
                  <tr><td>Late tasks it caught (recall)</td><td>{pct(late.metrics.recall)}</td></tr>
                  <tr><td>Warnings that were right (precision)</td><td>{pct(late.metrics.precision)}</td></tr>
                </tbody>
              </table>
              <p className="muted small">Biggest influences: {late.drivers.map((x) => x.feature).join(', ')}.</p>
            </>
          )}
        </div>
      </div>

      <div className="panel">
        <h3>Open tasks: predictions</h3>
        {analysis.predictions.length === 0 ? <p className="muted">No open tasks.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Task</th><th>Likely actual (80% range)</th><th>Late risk</th></tr></thead>
            <tbody>
              {analysis.predictions.map((p) => (
                <tr key={p.taskId} className="clickable" onClick={() => openTask(p.taskId)}>
                  <td>TB-{p.number} {p.title}</td>
                  <td>{p.duration ? `${p.duration.minutes} min (${p.duration.low}–${p.duration.high})` : 'needs an estimate'}</td>
                  <td>{p.late ? <span className={`badge risk-${p.late.level}`}>{p.late.level} · {pct(p.late.probability)}</span> : p.dueDate ? 'not available' : 'no due date'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      <div className="two-col">
        <div className="panel">
          <h3>Suggested order of work</h3>
          <p className="muted small">{rec.method}</p>
          {rec.nextUp.length === 0 && <p className="muted">Nothing open and unblocked.</p>}
          <ol className="plain-ol">
            {rec.nextUp.map((t) => (
              <li key={t.taskId}><a href="#task" onClick={(e) => { e.preventDefault(); openTask(t.taskId); }}>TB-{t.number} {t.title}</a>
                <span className="muted small"> {t.reasons.join(' · ') || 'no urgent signals'}</span></li>
            ))}
          </ol>
        </div>
        <div className="panel">
          <h3>Workload</h3>
          <table><thead><tr><th>Person</th><th>Open</th><th>Hours of work</th></tr></thead>
            <tbody>{rec.workload.map((w) => <tr key={w.userId}><td>{w.name}</td><td>{w.openTasks}</td><td>{Math.round(w.minutes / 6) / 10}</td></tr>)}</tbody></table>
          {rec.rebalance.length === 0 ? <p className="muted small">No one is far above the team average.</p> : (
            <ul className="plain-list">{rec.rebalance.map((r) => <li key={r.taskId}><span>Consider moving “{r.title}” from {r.from} to {r.to}. <span className="muted small">{r.reason}</span></span></li>)}</ul>
          )}
        </div>
      </div>

      <div className="panel">
        <h3>Ask about this project</h3>
        <form className="inline-form" onSubmit={ask}>
          <input required value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What should we worry about this week?" />
          <button className="btn" disabled={busy === 'ask'}>{busy === 'ask' ? 'Thinking…' : 'Ask'}</button>
        </form>
        {answer?.error && <div className="alert alert-error">{answer.error}</div>}
        {answer?.text && <p>{answer.text}</p>}
      </div>
    </div>
  );
}
