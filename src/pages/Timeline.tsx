import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useApp, formatDate } from '../lib/store';
import Cover from '../components/Cover';
import type { Book } from '../lib/types';

export default function Timeline() {
  const { books, booksLoading } = useApp();

  const reading = books.filter((b) => b.status === 'reading');

  // Livres lus groupés par année, triés par date de fin décroissante
  const years = useMemo(() => {
    const read = books
      .filter((b) => b.status === 'read')
      .sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? '') || b.updatedAt - a.updatedAt);
    const groups = new Map<string, Book[]>();
    for (const b of read) {
      const y = b.endDate?.slice(0, 4) ?? 'Sans date';
      if (!groups.has(y)) groups.set(y, []);
      groups.get(y)!.push(b);
    }
    return [...groups.entries()];
  }, [books]);

  if (booksLoading) return <div className="page muted">Chargement…</div>;

  if (!books.length) {
    return (
      <section className="page empty">
        <h2>Aucun livre pour l’instant</h2>
        <p className="muted">Scannez le code-barres d’un livre pour commencer votre timeline.</p>
        <Link to="/ajouter" className="btn btn-primary">
          Ajouter un livre
        </Link>
      </section>
    );
  }

  return (
    <section className="page">
      {reading.length > 0 && (
        <>
          <h2>En cours</h2>
          <div className="reading-list">
            {reading.map((b) => (
              <Link key={b.id} to={`/livre/${b.id}`} className="card reading-card">
                <Cover book={b} size="md" />
                <div>
                  <div className="title">{b.title}</div>
                  <div className="muted">{b.authors.join(', ')}</div>
                  {b.startDate && <div className="small">Commencé le {formatDate(b.startDate)}</div>}
                  <span className="pill pill-reading">En cours</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <h2>Timeline</h2>
      {years.length === 0 && <p className="muted">Les livres terminés apparaîtront ici.</p>}
      <ol className="timeline">
        {reading.length > 0 && (
          <li className="tl-now">
            <span className="tl-dot tl-dot-now" />
            <span className="tl-label">Aujourd’hui</span>
          </li>
        )}
        {years.map(([year, list]) => (
          <li key={year} className="tl-year">
            <div className="tl-year-head">
              <span className="tl-year-label">{year}</span>
              <span className="muted small">
                {list.length} livre{list.length > 1 ? 's' : ''} ·{' '}
                {list.reduce((s, b) => s + (b.pageCount ?? 0), 0).toLocaleString('fr-FR')} pages
              </span>
            </div>
            <ol>
              {list.map((b) => (
                <li key={b.id} className="tl-item">
                  <span className="tl-dot" />
                  <Link to={`/livre/${b.id}`} className="tl-card">
                    <Cover book={b} size="sm" />
                    <div>
                      <div className="small muted">{b.endDate ? formatDate(b.endDate, { day: 'numeric', month: 'long' }) : '—'}</div>
                      <div className="title">{b.title}</div>
                      <div className="muted small">{b.authors.join(', ')}</div>
                      {b.rating ? <div className="stars small">{'★'.repeat(b.rating)}{'☆'.repeat(5 - b.rating)}</div> : null}
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </section>
  );
}
