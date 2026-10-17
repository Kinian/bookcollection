import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp, formatDate, today } from '../lib/store';
import { removeBook, updateBook } from '../lib/books';
import { lookupIsbn } from '../lib/lookup';
import Cover from '../components/Cover';
import BookForm from '../components/BookForm';
import { STATUS_LABEL } from '../lib/types';

export default function BookDetail() {
  const { id } = useParams();
  const { books, user, booksLoading, online } = useApp();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const book = books.find((b) => b.id === id);

  if (booksLoading) return <div className="page muted">Chargement…</div>;
  if (!book) return <div className="page muted">Livre introuvable.</div>;

  const uid = user!.uid;

  if (editing) {
    return (
      <section className="page">
        <h2>Modifier</h2>
        <BookForm
          initial={book}
          submitLabel="Enregistrer"
          onCancel={() => setEditing(false)}
          onSubmit={(data) => {
            updateBook(uid, book.id, data);
            setEditing(false);
          }}
        />
      </section>
    );
  }

  const refresh = async () => {
    if (!book.isbn) return;
    const r = await lookupIsbn(book.isbn);
    if (r) {
      updateBook(uid, book.id, {
        description: book.description || r.description,
        coverUrl: book.coverUrl || r.coverUrl,
        pageCount: book.pageCount || r.pageCount,
        categories: book.categories.length ? book.categories : r.categories,
        authors: book.authors.length ? book.authors : r.authors,
        publisher: book.publisher || r.publisher,
        publishedDate: book.publishedDate || r.publishedDate,
      });
    }
  };

  const incomplete = book.isbn && (!book.description || !book.coverUrl || !book.pageCount);

  return (
    <section className="page">
      <div className="detail-head">
        <Cover book={book} size="lg" />
        <div>
          <h2 className="detail-title">{book.title}</h2>
          {book.subtitle && <div className="muted">{book.subtitle}</div>}
          <div>{book.authors.join(', ')}</div>
          <div className="muted small">
            {[book.publisher, book.publishedDate?.slice(0, 4), book.pageCount && `${book.pageCount} p.`].filter(Boolean).join(' · ')}
          </div>
          <div className="chips">
            <span className={`pill pill-${book.status}`}>{STATUS_LABEL[book.status]}</span>
            {book.categories.map((c) => (
              <span key={c} className="pill">
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="card dates">
        {book.startDate && <div>Début : {formatDate(book.startDate)}</div>}
        {book.endDate && <div>Fin : {formatDate(book.endDate)}</div>}
        {book.rating ? <div className="stars">{'★'.repeat(book.rating)}{'☆'.repeat(5 - book.rating)}</div> : null}
      </div>

      <div className="row">
        {book.status === 'toread' && (
          <button className="btn btn-primary grow" onClick={() => updateBook(uid, book.id, { status: 'reading', startDate: today() })}>
            Commencer
          </button>
        )}
        {book.status === 'reading' && (
          <button className="btn btn-primary grow" onClick={() => updateBook(uid, book.id, { status: 'read', endDate: today() })}>
            Terminé aujourd’hui
          </button>
        )}
        <button className="btn grow" onClick={() => setEditing(true)}>
          Modifier
        </button>
      </div>

      {book.notes && (
        <>
          <h3>Mes notes</h3>
          <p className="prewrap">{book.notes}</p>
        </>
      )}

      {book.description && (
        <>
          <h3>Résumé</h3>
          <p className={`description ${expanded ? '' : 'clamp'}`} onClick={() => setExpanded(!expanded)}>
            {book.description.replace(/<[^>]+>/g, '')}
          </p>
        </>
      )}

      {incomplete && online && (
        <button className="btn btn-link" onClick={refresh}>
          Compléter les infos depuis internet
        </button>
      )}

      {book.isbn && <p className="muted small">ISBN {book.isbn}</p>}

      <button
        className="btn btn-danger-outline"
        onClick={() => {
          if (confirm(`Supprimer « ${book.title} » ?`)) {
            removeBook(uid, book.id);
            nav('/bibliotheque', { replace: true });
          }
        }}
      >
        Supprimer
      </button>
    </section>
  );
}
