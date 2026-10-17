import { logout } from '../lib/firebase';
import { useApp } from '../lib/store';

export default function Profile() {
  const { user, books } = useApp();

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(books, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bookcollection-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="page">
      <h2>Profil</h2>
      <div className="card profile">
        {user?.photoURL && <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />}
        <div>
          <strong>{user?.displayName}</strong>
          <div className="muted">{user?.email}</div>
        </div>
      </div>
      <p className="muted">{books.length} livres enregistrés.</p>
      <div className="stack">
        <button className="btn" onClick={exportJson}>
          Exporter mes données (JSON)
        </button>
        <button className="btn btn-danger-outline" onClick={logout}>
          Se déconnecter
        </button>
      </div>
    </section>
  );
}
