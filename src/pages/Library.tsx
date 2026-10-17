import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/store';
import Cover from '../components/Cover';
import { STATUS_LABEL, type BookStatus } from '../lib/types';

const FILTERS: (BookStatus | 'all')[] = ['all', 'reading', 'toread', 'read', 'abandoned'];

export default function Library() {
  const { books } = useApp();
  const [filter, setFilter] = useState<BookStatus | 'all'>('all');
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return books.filter(
      (b) =>
        (filter === 'all' || b.status === filter) &&
        (!s || b.title.toLowerCase().includes(s) || b.authors.some((a) => a.toLowerCase().includes(s)) || b.isbn?.includes(s)),
    );
  }, [books, filter, q]);

  return (
    <section className="page">
      <h2>Mes livres</h2>
      <input className="input" placeholder="Rechercher titre, auteur, ISBN…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Tous' : STATUS_LABEL[f]}{' '}
            <span className="muted">{f === 'all' ? books.length : books.filter((b) => b.status === f).length}</span>
          </button>
        ))}
      </div>
      <div className="grid">
        {list.map((b) => (
          <Link key={b.id} to={`/livre/${b.id}`} className="grid-item">
            <Cover book={b} size="lg" />
            <div className="title small">{b.title}</div>
            <div className="muted small">{b.authors[0]}</div>
          </Link>
        ))}
      </div>
      {!list.length && <p className="muted">Aucun livre.</p>}
    </section>
  );
}
