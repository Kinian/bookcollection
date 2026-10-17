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

/** ISBN-13 (978…) → ISBN-10, pour les bases qui n'indexent que l'ancien format. */
function toIsbn10(isbn13: string): string | null {
  if (!/^978\d{10}$/.test(isbn13)) return null;
  const core = isbn13.slice(3, 12);
  const sum = [...core].reduce((s, c, i) => s + Number(c) * (10 - i), 0);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? 'X' : String(check));
}

function toIsbn13(isbn10: string): string {
  const core = '978' + isbn10.slice(0, 9);
  const sum = [...core].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0);
  return core + String((10 - (sum % 10)) % 10);
}

/** Toutes les écritures équivalentes d'un ISBN (13 puis 10). */
function isbnVariants(isbn: string): string[] {
  if (isbn.length === 10) return [toIsbn13(isbn), isbn];
  const ten = toIsbn10(isbn);
  return ten ? [isbn, ten] : [isbn];
}

const googleKey = () => {
  const key = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY;
  return key ? `&key=${key}` : '';
};

function googleToResult(v: any, fallbackIsbn?: string): LookupResult {
  const img = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail;
  const ids: any[] = v.industryIdentifiers ?? [];
  const isbn =
    ids.find((i) => i.type === 'ISBN_13')?.identifier ?? ids.find((i) => i.type === 'ISBN_10')?.identifier ?? fallbackIsbn;
  return {
    isbn: isbn ? normalizeIsbn(isbn) : undefined,
    title: v.title ?? '',
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

async function googleQuery(q: string, max = 1): Promise<any[]> {
  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${max}&printType=books${googleKey()}`,
  );
  if (!res.ok) return [];
  const json = await res.json();
  return (json.items ?? []).map((i: any) => i.volumeInfo).filter(Boolean);
}

async function fromGoogle(isbn: string): Promise<LookupResult | null> {
  for (const variant of isbnVariants(isbn)) {
    const [v] = await googleQuery(`isbn:${variant}`);
    if (v) return googleToResult(v, isbn);
  }
  // Certaines éditions ne sont trouvées qu'en recherche libre.
  const [v] = await googleQuery(isbn);
  return v ? googleToResult(v, isbn) : null;
}

async function fromOpenLibrary(isbn: string): Promise<LookupResult | null> {
  const variants = isbnVariants(isbn);
  const keys = variants.map((v) => `ISBN:${v}`).join(',');
  const res = await fetch(`https://openlibrary.org/api/books?bibkeys=${keys}&format=json&jscmd=data`);
  if (res.ok) {
    const json = await res.json();
    const b = json[Object.keys(json)[0]];
    if (b) {
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
  }
  // Repli : l'index de recherche couvre des éditions absentes de l'API « books ».
  const [hit] = await openLibrarySearch(`isbn=${isbn}`, 1);
  return hit ? { ...hit, isbn } : null;
}

const OL_FIELDS = 'key,title,subtitle,author_name,first_publish_year,isbn,cover_i,number_of_pages_median,publisher,language,subject';

function olDocToResult(d: any): LookupResult {
  const isbns: string[] = d.isbn ?? [];
  const isbn = isbns.find((i) => i.length === 13) ?? isbns[0];
  return {
    isbn: isbn ? normalizeIsbn(isbn) : undefined,
    title: d.title ?? '',
    subtitle: d.subtitle,
    authors: d.author_name ?? [],
    pageCount: d.number_of_pages_median,
    categories: (d.subject ?? []).slice(0, 3),
    publisher: d.publisher?.[0],
    publishedDate: d.first_publish_year ? String(d.first_publish_year) : undefined,
    language: d.language?.[0] === 'fre' ? 'fr' : d.language?.[0],
    coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : undefined,
  };
}

async function openLibrarySearch(params: string, limit: number): Promise<LookupResult[]> {
  const res = await fetch(`https://openlibrary.org/search.json?${params}&fields=${OL_FIELDS}&limit=${limit}`);
  if (!res.ok) return [];
  const json = await res.json();
  return (json.docs ?? []).map(olDocToResult).filter((r: LookupResult) => r.title);
}


// --- BnF (catalogue général, SRU / Dublin Core) -------------------------------------------------

const dcAll = (rec: Element, tag: string) =>
  [...rec.getElementsByTagName(`dc:${tag}`)].map((n) => n.textContent?.trim() ?? '').filter(Boolean);

function bnfRecordToResult(rec: Element): LookupResult | null {
  const title = dcAll(rec, 'title')[0]?.split(/\s+\/\s+/)[0].trim();
  if (!title) return null;
  const authors = [
    ...new Set(
      dcAll(rec, 'creator').map((c) => {
        const name = c.replace(/\.\s+[A-ZÉ][^.]*$/, '').replace(/\s*\([^)]*\)/g, '').trim(); // retire rôle et dates
        const [last, first] = name.split(/,\s*/);
        return first ? `${first} ${last}` : last;
      }),
    ),
  ];
  const isbnRaw = dcAll(rec, 'identifier').find((i) => /^ISBN/i.test(i));
  const isbn = isbnRaw ? normalizeIsbn(isbnRaw.replace(/^ISBN\s*/i, '').split(/\s/)[0]) : undefined;
  const lang = dcAll(rec, 'language')[0];
  return {
    isbn: isbn && isValidIsbn(isbn) ? isbn : undefined,
    title,
    authors,
    publisher: dcAll(rec, 'publisher')[0]?.split(/\s*:\s*/).pop()?.replace(/,?\s*\d{4}.*$/, '').trim() || undefined,
    publishedDate: dcAll(rec, 'date')[0]?.match(/\d{4}/)?.[0],
    pageCount: Number(dcAll(rec, 'format').join(' ').match(/(\d+)\s*p\./)?.[1]) || undefined,
    language: lang === 'fre' ? 'fr' : lang === 'eng' ? 'en' : lang,
    description: dcAll(rec, 'description')[0],
    categories: [],
  };
}

async function bnfQuery(cql: string, max = 1): Promise<LookupResult[]> {
  const url =
    `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&recordSchema=dublincore` +
    `&maximumRecords=${max}&query=${encodeURIComponent(cql)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const xml = new DOMParser().parseFromString(await res.text(), 'application/xml');
  return [...xml.getElementsByTagName('oai_dc:dc')]
    .map(bnfRecordToResult)
    .filter((r): r is LookupResult => !!r);
}

async function fromBnf(isbn: string): Promise<LookupResult | null> {
  for (const variant of isbnVariants(isbn)) {
    const [hit] = await bnfQuery(`bib.isbn adj "${variant}"`);
    if (hit) return { ...hit, isbn };
  }
  return null;
}

const cqlQuote = (t: string) => t.replace(/["\\]/g, ' ');

/** Interroge Google Books, la BnF et Open Library, puis comble les trous dans cet ordre de priorité. */
export async function lookupIsbn(raw: string): Promise<LookupResult | null> {
  const isbn = normalizeIsbn(raw);
  const settled = await Promise.allSettled([fromGoogle(isbn), fromBnf(isbn), fromOpenLibrary(isbn)]);
  const found = settled.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []));
  if (!found.length) return null;
  const pick = <T,>(f: (r: LookupResult) => T | undefined | '') => found.map(f).find(Boolean) || undefined;
  return {
    ...found[0],
    isbn,
    title: pick((r) => r.title) ?? '',
    subtitle: pick((r) => r.subtitle),
    authors: found.find((r) => r.authors.length)?.authors ?? [],
    description: pick((r) => r.description),
    pageCount: pick((r) => r.pageCount),
    categories: found.find((r) => r.categories.length)?.categories ?? [],
    publisher: pick((r) => r.publisher),
    publishedDate: pick((r) => r.publishedDate),
    language: pick((r) => r.language),
    coverUrl: pick((r) => r.coverUrl) ?? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`,
  };
}

/** « titre - auteur » ou « titre, auteur » → { title, author } (auteur optionnel). */
function splitQuery(text: string): { title: string; author?: string } {
  const m = text.match(/^(.+?)(?:\s+[-–—]\s+|\s*,\s*)(.+)$/);
  return m ? { title: m[1].trim(), author: m[2].trim() } : { title: text.trim() };
}

const fold = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Recherche libre par titre et/ou auteur ; renvoie des résultats dédoublonnés, éditions avec ISBN d'abord. */
export async function searchBooks(text: string): Promise<LookupResult[]> {
  const { title, author } = splitQuery(text);
  const googleQs = author
    ? [`intitle:${title} inauthor:${author}`, `${title} ${author}`]
    : [title];
  const olParams = author
    ? `title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}`
    : `q=${encodeURIComponent(title)}`;

  const bnfCql = author
    ? `bib.title all "${cqlQuote(title)}" and bib.author all "${cqlQuote(author)}"`
    : `bib.anywhere all "${cqlQuote(title)}"`;

  const settled = await Promise.allSettled([
    ...googleQs.map((q) => googleQuery(q, 10).then((vs) => vs.map((v) => googleToResult(v)))),
    openLibrarySearch(olParams, 10),
    bnfQuery(bnfCql, 10), // en dernier : sans couverture, il ne doit pas supplanter les doublons de Google
  ]);
  const all = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));

  const seen = new Set<string>();
  const out: LookupResult[] = [];
  for (const r of all) {
    if (!r.title) continue;
    const key = r.isbn ?? `${fold(r.title)}|${fold(r.authors[0] ?? '')}`;
    const loose = `${fold(r.title)}|${fold(r.authors[0] ?? '')}`;
    if (seen.has(key) || seen.has(loose)) continue;
    seen.add(key);
    seen.add(loose);
    out.push(r);
  }
  const score = (r: LookupResult) => (r.isbn ? 2 : 0) + (r.coverUrl ? 1 : 0) + (fold(r.title).includes(fold(title)) ? 2 : 0);
  return out.sort((a, b) => score(b) - score(a)).slice(0, 15);
}
