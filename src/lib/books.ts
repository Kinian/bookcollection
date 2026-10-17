import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from './firebase';
import type { Book, BookInput } from './types';

const booksCol = (uid: string) => collection(db, 'users', uid, 'books');

// Les écritures sont appliquées immédiatement au cache local (hors ligne compris)
// puis synchronisées. On n'attend pas l'ack serveur, sinon l'UI bloquerait hors ligne.
export function addBook(uid: string, data: BookInput): string {
  const now = Date.now();
  const ref = doc(booksCol(uid));
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  setDoc(ref, { ...clean, createdAt: now, updatedAt: now }).catch(console.error);
  return ref.id;
}

export function updateBook(uid: string, id: string, data: Partial<BookInput>) {
  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  for (const [k, v] of Object.entries(data)) patch[k] = v === undefined || v === '' ? deleteField() : v;
  updateDoc(doc(booksCol(uid), id), patch).catch(console.error);
}

export function removeBook(uid: string, id: string) {
  deleteDoc(doc(booksCol(uid), id)).catch(console.error);
}

export function useBooks(uid: string | undefined) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const q = query(booksCol(uid), orderBy('createdAt', 'desc'));
    return onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      setBooks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Book, 'id'>) })));
      setPending(snap.metadata.hasPendingWrites);
      setLoading(false);
    });
  }, [uid]);

  return { books, loading, pending };
}
