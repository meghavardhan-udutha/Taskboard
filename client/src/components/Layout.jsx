import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { closeSocket } from '../socket.js';
import Avatar from './Avatar.jsx';

export default function Layout({ children }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const logout = () => {
    closeSocket();
    signOut();
    navigate('/');
  };

  return (
    <div className="app-shell">
      <aside className="topbar">
        <Link to="/" className="brand"><span className="lp-logo" aria-hidden="true" />Taskboard</Link>
        <nav className="topnav" aria-label="Main">
          <NavLink to="/" end>Projects</NavLink>
          <NavLink to="/profile">My dashboard</NavLink>
        </nav>
        <div className="topbar-right">
          <Link to="/profile" className="me">
            <Avatar user={user} size={34} />
            <span><b>{user.name}</b><small>{user.jobTitle || user.email}</small></span>
          </Link>
          <button className="btn btn-ghost" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="page">{children}</main>
    </div>
  );
}
