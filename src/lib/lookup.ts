import type { BookInput } from './types';

export type LookupResult = Omit<BookInput, 'status'>;

export function normalizeIsbn(raw: string): string {
  return raw.replace(/[^0-9Xx]/g, '').toUpperCase();
}

export function isValidIsbn(isbn: string): boolean {
  if (/^\d{13}$/.test(isbn)) {
    const sum = [...isbn].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0);
    return sum % 10 === 0;
  }
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce((s, c, i) => s + (c === 'X' ? 10 : Number(c)) * (10 - i), 0);
    return sum % 11 === 0;
  }
  return false;
}

const https = (u?: string) => u?.replace(/^http:/, 'https:');

async function fromGoogle(isbn: string): Promise<LookupResult | null> {
  const key = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY;
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}${key ? `&key=${key}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const v = json.items?.[0]?.volumeInfo;
  if (!v) return null;
  const img = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail;
  return {
    isbn,
    title: v.title,
    subtitle: v.subtitle,
    authors: v.authors ?? [],
    description: v.description,
    pageCount: v.pageCount || undefined,
    categories: v.categories ?? [],
    publisher: v.publisher,
    publishedDate: v.publishedDate,
    language: v.language,
    coverUrl: https(img?.replace('&edge=curl', '').replace('zoom=1', 'zoom=2')),
  };
}

async function fromOpenLibrary(isbn: string): Promise<LookupResult | null> {
  const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
  if (!res.ok) return null;
  const json = await res.json();
  const b = json[`ISBN:${isbn}`];
  if (!b) return null;
  return {
    isbn,
    title: b.title,
    subtitle: b.subtitle,
    authors: (b.authors ?? []).map((a: any) => a.name),
    pageCount: b.number_of_pages,
    categories: (b.subjects ?? []).slice(0, 3).map((s: any) => s.name),
    publisher: b.publishers?.[0]?.name,
    publishedDate: b.publish_date,
    coverUrl: b.cover?.large || b.cover?.medium,
    description: typeof b.notes === 'string' ? b.notes : b.notes?.value,
  };
}

/** Interroge Google Books puis complète les trous avec Open Library. */
export async function lookupIsbn(raw: string): Promise<LookupResult | null> {
  const isbn = normalizeIsbn(raw);
  const [g, o] = await Promise.allSettled([fromGoogle(isbn), fromOpenLibrary(isbn)]);
  const google = g.status === 'fulfilled' ? g.value : null;
  const ol = o.status === 'fulfilled' ? o.value : null;
  if (!google && !ol) return null;
  const base = google ?? ol!;
  const extra = google ? ol : null;
  return {
    ...base,
    title: base.title || extra?.title || '',
    authors: base.authors.length ? base.authors : extra?.authors ?? [],
    description: base.description || extra?.description,
    pageCount: base.pageCount || extra?.pageCount,
    categories: base.categories.length ? base.categories : extra?.categories ?? [],
    coverUrl:
      base.coverUrl || extra?.coverUrl || `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`,
  };
}
