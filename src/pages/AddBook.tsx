import { lazy, Suspense, useCallback, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import BookForm from '../components/BookForm';
import Cover from '../components/Cover';
import { lookupIsbn, normalizeIsbn, isValidIsbn, searchBooks, type LookupResult } from '../lib/lookup';
import { addBook } from '../lib/books';
import { useApp } from '../lib/store';
import type { BookInput } from '../lib/types';

const Scanner = lazy(() => import('../components/Scanner'));

type Step =
  | { kind: 'search' }
  | { kind: 'results'; query: string; items: LookupResult[] }
  | { kind: 'loading'; isbn: string } | { kind: 'form'; initial: Partial<BookInput>; note?: string };

export default function AddBook() {
  const { user, books, online } = useApp();
  const nav = useNavigate();
  const [isbn, setIsbn] = useState('');
  const [scanning, setScanning] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'search' });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [refine, setRefine] = useState('');

  const search = useCallback(
    async (raw: string) => {
      const code = normalizeIsbn(raw);
      setScanning(false);
      setError(undefined);
      if (!isValidIsbn(code)) {
        setError('ISBN/EAN invalide : vérifiez les chiffres.');
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

  const textSearch = useCallback(async (query: string) => {
    setError(undefined);
    if (!navigator.onLine) {
      setError('Hors ligne : la recherche par titre nécessite le réseau.');
      return;
    }
    setBusy(true);
    try {
      const items = await searchBooks(query);
      setRefine('');
      if (items.length) setStep({ kind: 'results', query, items });
      else setError('Aucun résultat. Essayez « titre auteur » ou saisissez le livre manuellement.');
    } catch {
      setError('Recherche impossible pour le moment.');
    } finally {
      setBusy(false);
    }
  }, []);

  const pick = async (r: LookupResult) => {
    const existing = r.isbn && books.find((b) => b.isbn === r.isbn);
    if (existing) {
      nav(`/livre/${existing.id}`);
      return;
    }
    setBusy(true);
    // Complète la fiche (résumé, pages, couverture) à partir de l'ISBN quand il est connu.
    const full = r.isbn ? await lookupIsbn(r.isbn).catch(() => null) : null;
    setBusy(false);
    setStep({ kind: 'form', initial: { ...r, ...(full ?? {}), coverUrl: full?.coverUrl || r.coverUrl } });
  };

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

  if (step.kind === 'results') {
    const editionLine = (r: LookupResult) =>
      [r.publisher, r.publishedDate?.slice(0, 4), r.pageCount && `${r.pageCount} p.`, r.isbn && `ISBN ${r.isbn}`]
        .filter(Boolean)
        .join(' · ');
    // Filtre local sur l'édition : éditeur, année, ISBN… (« poche 2009 » garde les éditions qui contiennent les deux).
    const terms = refine.toLowerCase().split(/\s+/).filter(Boolean);
    const items = step.items.filter((r) => {
      const text = `${r.title} ${r.subtitle ?? ''} ${r.authors.join(' ')} ${editionLine(r)}`.toLowerCase();
      return terms.every((t) => text.includes(t));
    });
    return (
      <section className="page">
        <h2>Résultats pour « {step.query} »</h2>
        <input
          className="input"
          placeholder="Préciser l’édition : éditeur, année, ISBN…"
          value={refine}
          onChange={(e) => setRefine(e.target.value)}
        />
        <p className="muted small">
          {items.length} édition{items.length > 1 ? 's' : ''}. Vous avez le livre en main ? Scannez ou tapez son ISBN pour
          l’édition exacte.
        </p>
        {busy && <p className="muted">Chargement de la fiche…</p>}
        {items.map((r, i) => (
          <button key={`${r.isbn ?? r.title}-${i}`} className="card result" onClick={() => pick(r)} disabled={busy}>
            <Cover book={r} size="sm" />
            <span className="result-text">
              <strong>{r.title}</strong>
              <span className="muted small">{r.authors.join(', ') || 'Auteur inconnu'}</span>
              <span className="muted small">{editionLine(r)}</span>
            </span>
          </button>
        ))}
        <button className="btn btn-link" onClick={() => setStep({ kind: 'search' })}>
          Nouvelle recherche
        </button>
        <button className="btn btn-link" onClick={() => setStep({ kind: 'form', initial: {} })}>
          Saisie manuelle
        </button>
      </section>
    );
  }

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
    const q = isbn.trim();
    if (!q) return;
    // Que des chiffres (tirets/espaces tolérés) de la longueur d'un ISBN → code ; sinon titre/auteur.
    if (/^[\d\s-]+[\dXx]?$/.test(q) && /^(\d{10}|\d{13}|\d{9}[\dXx])$/.test(normalizeIsbn(q))) search(q);
    else textSearch(q);
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
          placeholder="ISBN, EAN, titre ou auteur"
          value={isbn}
          onChange={(e) => setIsbn(e.target.value)}
        />
        <button className="btn" type="submit" disabled={busy}>
          {busy ? '…' : 'Chercher'}
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
