import { useState } from 'react';
import type { Book } from '../lib/types';

export default function Cover({ book, size = 'md' }: { book: Pick<Book, 'title' | 'coverUrl'>; size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  if (!book.coverUrl || failed) {
    return (
      <div className={`cover cover-${size} cover-empty`}>
        <span>{book.title}</span>
      </div>
    );
  }
  return (
    <img
      className={`cover cover-${size}`}
      src={book.coverUrl}
      alt={book.title}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
