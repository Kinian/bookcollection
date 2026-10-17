import { useState, type FormEvent } from 'react';
import { STATUS_LABEL, type BookInput, type BookStatus } from '../lib/types';
import { today } from '../lib/store';
import Cover from './Cover';

interface Props {
  initial: Partial<BookInput>;
  submitLabel: string;
  onSubmit: (data: BookInput) => void;
  onCancel?: () => void;
}

const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

export default function BookForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [f, setF] = useState({
    title: initial.title ?? '',
    subtitle: initial.subtitle ?? '',
    authors: (initial.authors ?? []).join(', '),
    pageCount: initial.pageCount ? String(initial.pageCount) : '',
    categories: (initial.categories ?? []).join(', '),
    coverUrl: initial.coverUrl ?? '',
    status: (initial.status ?? 'toread') as BookStatus,
    startDate: initial.startDate ?? '',
    endDate: initial.endDate ?? '',
    rating: initial.rating ?? 0,
    notes: initial.notes ?? '',
    description: initial.description ?? '',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const setStatus = (status: BookStatus) => {
    const next = { ...f, status };
    if (status === 'reading' && !next.startDate) next.startDate = today();
    if (status === 'read' && !next.endDate) next.endDate = today();
    setF(next);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.title.trim()) return;
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = initial as Partial<BookInput> & {
      id?: string;
      createdAt?: number;
      updatedAt?: number;
    };
    onSubmit({
      ...rest,
      title: f.title.trim(),
      subtitle: f.subtitle.trim() || undefined,
      authors: split(f.authors),
      pageCount: f.pageCount ? Number(f.pageCount) : undefined,
      categories: split(f.categories),
      coverUrl: f.coverUrl.trim() || undefined,
      status: f.status,
      startDate: f.startDate || undefined,
      endDate: f.status === 'read' || f.status === 'abandoned' ? f.endDate || undefined : undefined,
      rating: f.rating || undefined,
      notes: f.notes.trim() || undefined,
      description: f.description.trim() || undefined,
    });
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-head">
        <Cover book={{ title: f.title, coverUrl: f.coverUrl }} size="md" />
        <div className="stack grow">
          <label>
            Titre*
            <input className="input" value={f.title} onChange={set('title')} required />
          </label>
          <label>
            Auteur(s)
            <input className="input" value={f.authors} onChange={set('authors')} placeholder="Séparés par des virgules" />
          </label>
        </div>
      </div>

      <div className="row">
        <label>
          Pages
          <input className="input" type="number" inputMode="numeric" min={0} value={f.pageCount} onChange={set('pageCount')} />
        </label>
        <label className="grow">
          Genre(s)
          <input className="input" value={f.categories} onChange={set('categories')} placeholder="Roman, SF…" />
        </label>
      </div>

      <label>
        Statut
        <div className="segmented">
          {(Object.keys(STATUS_LABEL) as BookStatus[]).map((s) => (
            <button type="button" key={s} className={f.status === s ? 'active' : ''} onClick={() => setStatus(s)}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </label>

      {f.status !== 'toread' && (
        <div className="row">
          <label className="grow">
            Début
            <input className="input" type="date" value={f.startDate} onChange={set('startDate')} />
          </label>
          {(f.status === 'read' || f.status === 'abandoned') && (
            <label className="grow">
              Fin
              <input className="input" type="date" value={f.endDate} onChange={set('endDate')} />
            </label>
          )}
        </div>
      )}

      {f.status === 'read' && (
        <label>
          Note
          <div className="rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button type="button" key={n} onClick={() => setF({ ...f, rating: f.rating === n ? 0 : n })}>
                {n <= f.rating ? '★' : '☆'}
              </button>
            ))}
          </div>
        </label>
      )}

      <label>
        Résumé
        <textarea className="input" rows={4} value={f.description} onChange={set('description')} placeholder="Résumé du livre" />
      </label>

      <label>
        Notes personnelles
        <textarea className="input" rows={3} value={f.notes} onChange={set('notes')} />
      </label>

      <details>
        <summary className="muted small">Plus</summary>
        <label>
          Sous-titre
          <input className="input" value={f.subtitle} onChange={set('subtitle')} />
        </label>
        <label>
          URL de couverture
          <input className="input" value={f.coverUrl} onChange={set('coverUrl')} />
        </label>
      </details>

      <div className="row">
        {onCancel && (
          <button type="button" className="btn grow" onClick={onCancel}>
            Annuler
          </button>
        )}
        <button className="btn btn-primary grow" type="submit">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
