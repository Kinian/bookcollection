import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './lib/store';
import Login from './pages/Login';
import Timeline from './pages/Timeline';
import Library from './pages/Library';
import AddBook from './pages/AddBook';
import BookDetail from './pages/BookDetail';
import Stats from './pages/Stats';
import Profile from './pages/Profile';

export default function App() {
  const { user, authReady, online, pending } = useApp();

  if (!authReady) return <div className="splash">Chargement…</div>;
  if (!user) return <Login />;

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          Bookcollection
        </NavLink>
        <div className="topbar-right">
          {!online && <span className="badge badge-warn">Hors ligne</span>}
          {online && pending && <span className="badge">Synchro…</span>}
          <NavLink to="/profil" className="avatar" aria-label="Profil">
            {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : user.displayName?.[0]}
          </NavLink>
        </div>
      </header>

      <main className="content">
        <Routes>
          <Route path="/" element={<Timeline />} />
          <Route path="/bibliotheque" element={<Library />} />
          <Route path="/ajouter" element={<AddBook />} />
          <Route path="/livre/:id" element={<BookDetail />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/profil" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav className="tabbar">
        <NavLink to="/" end>
          <Icon d="M4 6h16M4 12h10M4 18h6" />
          Lecture
        </NavLink>
        <NavLink to="/bibliotheque">
          <Icon d="M5 4v16M10 4v16M15 5l4 15" />
          Livres
        </NavLink>
        <NavLink to="/ajouter" className="tab-add">
          <Icon d="M12 5v14M5 12h14" />
          Ajouter
        </NavLink>
        <NavLink to="/stats">
          <Icon d="M5 20V10M12 20V4M19 20v-7" />
          Stats
        </NavLink>
      </nav>
    </div>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d={d} />
    </svg>
  );
}
