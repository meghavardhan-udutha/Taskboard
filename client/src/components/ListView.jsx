import Avatar from './Avatar.jsx';

export default function ListView({ tasks, lists, onOpen }) {
  const listName = (id) => lists.find((l) => l._id === id)?.title || '';
  if (tasks.length === 0) return <div className="empty"><p>No tasks yet. Add one from the Board tab.</p></div>;
  return (
    <div className="panel table-wrap">
      <table>
        <thead>
          <tr><th>Task</th><th>List</th><th>Priority</th><th>Assigned</th><th>Due</th></tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t._id} onClick={() => onOpen(t)} className="clickable">
              <td>{t.title}</td>
              <td>{listName(t.list)}</td>
              <td><span className={`badge p-${t.priority}`}>{t.priority}</span></td>
              <td><div className="avatar-stack">{t.assignees.map((a) => <Avatar key={a._id} user={a} size={22} />)}</div></td>
              <td className={t.dueDate && new Date(t.dueDate) < new Date() ? 'text-danger' : ''}>
                {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
