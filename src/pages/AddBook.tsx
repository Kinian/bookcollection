import { lazy, Suspense, useCallback, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import BookForm from '../components/BookForm';
import { lookupIsbn, normalizeIsbn, isValidIsbn } from '../lib/lookup';
import { addBook } from '../lib/books';
import { useApp } from '../lib/store';
import type { BookInput } from '../lib/types';

const Scanner = lazy(() => import('../components/Scanner'));

type Step = { kind: 'search' } | { kind: 'loading'; isbn: string } | { kind: 'form'; initial: Partial<BookInput>; note?: string };

export default function AddBook() {
  const { user, books, online } = useApp();
  const nav = useNavigate();
  const [isbn, setIsbn] = useState('');
  const [scanning, setScanning] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'search' });
  const [error, setError] = useState<string>();

  const search = useCallback(
    async (raw: string) => {
      const code = normalizeIsbn(raw);
      setScanning(false);
      setError(undefined);
      if (!isValidIsbn(code)) {
        setError('ISBN invalide (10 ou 13 chiffres).');
        return;
      }
      const existing = books.find((b) => b.isbn === code);
      if (existing) {
        nav(`/livre/${existing.id}`);
        return;
      }
      if (!navigator.onLine) {
        setStep({ kind: 'form', initial: { isbn: code }, note: 'Hors ligne : saisissez les infos, vous pourrez compléter plus tard.' });
        return;
      }
      setStep({ kind: 'loading', isbn: code });
      try {
        const found = await lookupIsbn(code);
        setStep(
          found
            ? { kind: 'form', initial: found }
            : { kind: 'form', initial: { isbn: code }, note: 'Livre introuvable : complétez manuellement.' },
        );
      } catch {
        setStep({ kind: 'form', initial: { isbn: code }, note: 'Recherche impossible : complétez manuellement.' });
      }
    },
    [books, nav],
  );

  const onDetected = useCallback((code: string) => search(code), [search]);

  const save = (data: BookInput) => {
    const id = addBook(user!.uid, data);
    nav(`/livre/${id}`, { replace: true });
  };

  if (scanning)
    return (
      <Suspense fallback={<div className="page muted">Ouverture de la caméra…</div>}>
        <Scanner onDetected={onDetected} onClose={() => setScanning(false)} />
      </Suspense>
    );

  if (step.kind === 'loading') return <div className="page muted">Recherche de l’ISBN {step.isbn}…</div>;

  if (step.kind === 'form') {
    return (
      <section className="page">
        <h2>Nouveau livre</h2>
        {step.note && <p className="notice">{step.note}</p>}
        {step.initial.isbn && <p className="muted small">ISBN {step.initial.isbn}</p>}
        <BookForm initial={step.initial} submitLabel="Ajouter" onSubmit={save} onCancel={() => setStep({ kind: 'search' })} />
      </section>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    search(isbn);
  };

  return (
    <section className="page">
      <h2>Ajouter un livre</h2>
      <button className="btn btn-primary btn-big" onClick={() => setScanning(true)}>
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M10 8v8M13 8v8M16 8v8" />
        </svg>
        Scanner le code-barres
      </button>

      <div className="divider">ou</div>

      <form onSubmit={submit} className="row">
        <input
          className="input grow"
          inputMode="numeric"
          placeholder="ISBN (978…)"
          value={isbn}
          onChange={(e) => setIsbn(e.target.value)}
        />
        <button className="btn" type="submit">
          Chercher
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {!online && <p className="notice">Hors ligne : la recherche automatique reprendra avec le réseau.</p>}

      <button className="btn btn-link" onClick={() => setStep({ kind: 'form', initial: {} })}>
        Saisie manuelle sans ISBN
      </button>
    </section>
  );
}
