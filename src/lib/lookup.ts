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


// --- Genres : nettoyage et traduction ------------------------------------------------------------

const CATEGORY_FR: Record<string, string> = {
  fiction: 'Fiction',
  'juvenile fiction': 'Jeunesse',
  'juvenile nonfiction': 'Jeunesse',
  'young adult fiction': 'Young adult',
  'biography & autobiography': 'Biographie',
  biography: 'Biographie',
  history: 'Histoire',
  'science fiction': 'Science-fiction',
  fantasy: 'Fantasy',
  mystery: 'Policier',
  'detective and mystery stories': 'Policier',
  'mystery & detective': 'Policier',
  thrillers: 'Thriller',
  thriller: 'Thriller',
  romance: 'Romance',
  'literary criticism': 'Critique littéraire',
  'literary collections': 'Littérature',
  poetry: 'Poésie',
  drama: 'Théâtre',
  philosophy: 'Philosophie',
  psychology: 'Psychologie',
  religion: 'Religion',
  'comics & graphic novels': 'BD',
  'graphic novels': 'BD',
  classics: 'Classiques',
  'business & economics': 'Économie',
  cooking: 'Cuisine',
  science: 'Sciences',
  humor: 'Humour',
  travel: 'Voyage',
  'self-help': 'Développement personnel',
  'social science': 'Sciences sociales',
  'political science': 'Politique',
  'true crime': 'Faits divers',
  horror: 'Horreur',
  'french fiction': 'Roman français',
  'french literature': 'Littérature française',
};

const CATEGORY_NOISE = /accessible book|protected daisy|large type|staff picks|in library|lending library|nyt:|^reading level|^open library|^overdrive|^internet archive|\d{3}\.\d|^[a-z]{2}\d/i;

/** « Fiction / Classics », « Romans -- 19e siècle »… → genres courts, dédoublonnés, en français quand c'est connu. */
function cleanCategories(raw: string[] | undefined, max = 4): string[] {
  const out: string[] = [];
  for (const entry of raw ?? []) {
    for (const part of String(entry).split(/\s*(?:\/|--|;)\s*/)) {
      const t = part.trim();
      if (!t || t.length > 40 || CATEGORY_NOISE.test(t)) continue;
      const label = CATEGORY_FR[t.toLowerCase()] ?? t.charAt(0).toUpperCase() + t.slice(1);
      if (!out.some((o) => o.toLowerCase() === label.toLowerCase())) out.push(label);
    }
  }
  return out.slice(0, max);
}

// --- Couvertures : on ne garde qu'une image qui se charge vraiment -------------------------------

function imageLoads(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(false), 6000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img.naturalWidth > 30 && img.naturalHeight > 30); // écarte les pixels « pas de couverture »
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}

async function findCover(isbn: string, known?: string): Promise<string | undefined> {
  const variants = isbnVariants(isbn);
  const ten = variants.find((v) => v.length === 10);
  const candidates = [
    known,
    known?.replace('zoom=2', 'zoom=1'),
    ...variants.map((v) => `https://covers.openlibrary.org/b/isbn/${v}-L.jpg?default=false`),
    ten && `https://images-na.ssl-images-amazon.com/images/P/${ten}.01.LZZZZZZZ.jpg`,
  ].filter((u, i, a): u is string => !!u && a.indexOf(u) === i);
  for (const url of candidates) if (await imageLoads(url)) return url;
  return undefined;
}

/** Sujets Open Library d'une édition, puis de son œuvre, quand les autres sources n'ont pas de genre. */
async function olSubjects(isbn: string): Promise<string[]> {
  for (const v of isbnVariants(isbn)) {
    const res = await fetch(`https://openlibrary.org/isbn/${v}.json`);
    if (!res.ok) continue;
    const ed = await res.json();
    if (ed.subjects?.length) return ed.subjects;
    const work = ed.works?.[0]?.key;
    if (work) {
      const w = await fetch(`https://openlibrary.org${work}.json`);
      if (w.ok) {
        const wj = await w.json();
        if (wj.subjects?.length) return wj.subjects;
      }
    }
  }
  return [];
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
    categories: cleanCategories(v.categories),
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
  const variants = isbnVariants(isbn);
  const hit = (await googleQuery(isbn, 5)).find((v) =>
    (v.industryIdentifiers ?? []).some((i: any) => variants.includes(normalizeIsbn(i.identifier))),
  );
  return hit ? googleToResult(hit, isbn) : null;
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
        categories: cleanCategories((b.subjects ?? []).map((s: any) => s.name)),
        publisher: b.publishers?.[0]?.name,
        publishedDate: b.publish_date,
        coverUrl: b.cover?.large || b.cover?.medium,
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
    categories: cleanCategories(d.subject),
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


/** Raison sociale des catalogues → nom sous lequel l'éditeur est connu. */
function prettyPublisher(p?: string): string | undefined {
  if (!p) return undefined;
  if (/librairie g[ée]n[ée]rale fran[çc]aise|^l\.?\s?g\.?\s?f\b/i.test(p)) return 'Le Livre de Poche';
  return p.replace(/\s*\((?:[^()]|\([^()]*\))*\)$/, '').trim() || undefined; // retire la ville : « Presses pocket (Paris) »
}

// --- BnF (catalogue général, SRU / Dublin Core) -------------------------------------------------

/** « Collection : Le livre de poche : thriller ; 35805 » → « thriller ». Sans genre explicite → undefined. */
function genreFromCollection(notes: string[]): string | undefined {
  const known = new Set(Object.values(CATEGORY_FR).map((v) => v.toLowerCase()).concat(['roman', 'policier', 'thriller']));
  for (const note of notes) {
    const m = note.match(/^Collection\s*:\s*([^;]+)/i);
    if (!m) continue;
    const segs = m[1].split(/\s*:\s*/).map((x) => x.trim());
    if (segs.length > 1) return segs[segs.length - 1];
    const tail = m[1].split(/\.\s+/).pop()?.trim();
    if (tail && known.has(tail.toLowerCase())) return tail;
  }
  return undefined;
}

const dcAll = (rec: Element, tag: string) =>
  [...rec.getElementsByTagName(`dc:${tag}`)].map((n) => n.textContent?.trim() ?? '').filter(Boolean);

function bnfRecordToResult(rec: Element): LookupResult | null {
  // « Salem : roman (Éd. complétée et illustrée) Stephen King ; traduction… » → « Salem : roman »
  const title = dcAll(rec, 'title')[0]
    ?.split(/\s+\/\s+|\s+;\s+/)[0]
    .replace(/\s*\((?:[ÉE]d\.|[ée]dition)[^)]*\).*$/i, '')
    .trim();
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
    publisher: prettyPublisher(dcAll(rec, 'publisher')[0]?.split(/\s*:\s*/).pop()?.replace(/,?\s*\d{4}.*$/, '').trim()),
    publishedDate: dcAll(rec, 'date')[0]?.match(/\d{4}/)?.[0],
    pageCount: Number(dcAll(rec, 'format').join(' ').match(/(\d+)\s*p\./)?.[1]) || undefined,
    language: lang === 'fre' ? 'fr' : lang === 'eng' ? 'en' : lang,
    // dc:description de la BnF ne contient que des notes bibliographiques (collection, traduction…), jamais le résumé.
    categories: cleanCategories([genreFromCollection(dcAll(rec, 'description')) ?? '', ...dcAll(rec, 'subject')]),
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


// --- Sudoc (catalogue des bibliothèques universitaires, UNIMARC) ---------------------------------
// Couvre beaucoup de poches et rééditions françaises absentes de Google, de la BnF et d'Open Library.

/** « Roman d'épouvante américain » (forme Rameau) → genre court. */
function genreFromRameau(form: string): string {
  const known: [RegExp, string][] = [
    [/épouvante|horreur/i, 'Horreur'],
    [/science-fiction/i, 'Science-fiction'],
    [/fantastique/i, 'Fantastique'],
    [/fantasy/i, 'Fantasy'],
    [/policier/i, 'Policier'],
    [/espionnage/i, 'Espionnage'],
    [/historique/i, 'Roman historique'],
    [/bandes? dessinées?/i, 'BD'],
  ];
  return known.find(([re]) => re.test(form))?.[1] ?? form;
}

function sudocRecordToResult(rec: Document, isbn: string): LookupResult | null {
  const fields = (tag: string) => [...rec.querySelectorAll(`datafield[tag="${tag}"]`)];
  const sub = (field: Element | undefined, code: string) =>
    field?.querySelector(`subfield[code="${code}"]`)?.textContent?.trim() || undefined;

  const t200 = fields('200')[0];
  const title = sub(t200, 'a');
  if (!title) return null;
  const imprint = [...fields('210'), ...fields('214')].filter((f) => sub(f, 'c') || sub(f, 'd'));
  const authors = [...fields('700'), ...fields('701')].map((f) => [sub(f, 'b'), sub(f, 'a')].filter(Boolean).join(' '));
  const summary = sub(fields('330')[0], 'a')
    ?.replace(/^La 4e de couv(?:erture|\.)? (?:indique|porte)\s*:\s*/i, '')
    .replace(/^«\s*|\s*»$/g, '');
  const lang = fields('101')[0] && sub(fields('101')[0], 'a');
  return {
    isbn,
    title,
    subtitle: sub(t200, 'e'),
    authors: authors.length ? authors : sub(t200, 'f') ? [sub(t200, 'f')!] : [],
    description: summary,
    pageCount: Number(sub(fields('215')[0], 'a')?.match(/(\d+)\s*(?:p\.|pages)/)?.[1]) || undefined,
    categories: cleanCategories(fields('608').map((f) => genreFromRameau(sub(f, 'a') ?? ''))),
    publisher: prettyPublisher(imprint.map((f) => sub(f, 'c')).find(Boolean)),
    publishedDate: imprint.map((f) => sub(f, 'd')?.match(/\d{4}/)?.[0]).find(Boolean),
    language: lang === 'fre' ? 'fr' : lang === 'eng' ? 'en' : lang,
  };
}

async function fromSudoc(isbn: string): Promise<LookupResult | null> {
  const res = await fetch(`https://www.sudoc.fr/services/isbn2ppn/${isbn}`);
  if (!res.ok) return null;
  const ppns = [...new DOMParser().parseFromString(await res.text(), 'application/xml').getElementsByTagName('ppn')]
    .map((n) => n.textContent?.trim())
    .filter(Boolean);
  for (const ppn of ppns.slice(0, 3)) {
    const r = await fetch(`https://www.sudoc.fr/${ppn}.xml`);
    if (!r.ok) continue;
    const hit = sudocRecordToResult(new DOMParser().parseFromString(await r.text(), 'application/xml'), isbn);
    if (hit) return hit;
  }
  return null;
}

/** Interroge Google Books, la BnF, le Sudoc et Open Library, puis comble les trous dans cet ordre de priorité. */
export async function lookupIsbn(raw: string): Promise<LookupResult | null> {
  const isbn = normalizeIsbn(raw);
  const settled = await Promise.allSettled([fromGoogle(isbn), fromBnf(isbn), fromSudoc(isbn), fromOpenLibrary(isbn)]);
  const found = settled.flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []));
  if (!found.length) return null;
  const pick = <T,>(f: (r: LookupResult) => T | undefined | '') => found.map(f).find(Boolean) || undefined;

  let categories = cleanCategories(found.flatMap((r) => r.categories));
  const [cover, subjects] = await Promise.all([
    findCover(isbn, pick((r) => r.coverUrl)),
    categories.length ? Promise.resolve([]) : olSubjects(isbn).catch(() => []),
  ]);
  if (!categories.length) categories = cleanCategories(subjects);

  return {
    ...found[0],
    isbn,
    title: pick((r) => r.title) ?? '',
    subtitle: pick((r) => r.subtitle),
    authors: found.find((r) => r.authors.length)?.authors ?? [],
    description: pick((r) => r.description),
    pageCount: pick((r) => r.pageCount),
    categories,
    publisher: pick((r) => r.publisher),
    publishedDate: pick((r) => r.publishedDate),
    language: pick((r) => r.language),
    coverUrl: cover,
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

/** Recherche libre par titre et/ou auteur ; renvoie toutes les éditions trouvées (une par ISBN), éditions avec ISBN d'abord. */
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
    bnfQuery(bnfCql, 20), // en dernier : sans couverture, il ne doit pas supplanter les doublons de Google
  ]);
  const all = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));

  // Chaque ISBN est une édition distincte : on les garde toutes pour pouvoir choisir la bonne.
  // Les résultats sans ISBN ne sont gardés que si l'œuvre n'apparaît pas déjà.
  const loose = (r: LookupResult) => `${fold(r.title)}|${fold(r.authors[0] ?? '')}`;
  const isbn13 = (r: LookupResult) => (r.isbn?.length === 10 ? toIsbn13(r.isbn) : r.isbn);
  const seenIsbn = new Set<string>();
  const seenWork = new Set<string>();
  const out: LookupResult[] = [];
  for (const r of all.filter((r) => r.title && r.isbn)) {
    const key = isbn13(r)!;
    if (seenIsbn.has(key)) continue;
    seenIsbn.add(key);
    seenWork.add(loose(r));
    out.push({ ...r, isbn: key });
  }
  for (const r of all.filter((r) => r.title && !r.isbn)) {
    if (seenWork.has(loose(r))) continue;
    seenWork.add(loose(r));
    out.push(r);
  }
  const score = (r: LookupResult) => (r.isbn ? 2 : 0) + (r.coverUrl ? 1 : 0) + (fold(r.title).includes(fold(title)) ? 2 : 0);
  return out.sort((a, b) => score(b) - score(a)).slice(0, 40);
}
