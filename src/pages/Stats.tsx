import { useMemo, useState } from 'react';
import { useApp } from '../lib/store';

function countBy<T>(items: T[], keys: (t: T) => string[], weight: (t: T) => number = () => 1) {
  const m = new Map<string, number>();
  for (const it of items) for (const k of keys(it)) m.set(k, (m.get(k) ?? 0) + weight(it));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export default function Stats() {
  const { books } = useApp();
  const read = useMemo(() => books.filter((b) => b.status === 'read'), [books]);
  const years = useMemo(
    () => [...new Set(read.map((b) => b.endDate?.slice(0, 4)).filter(Boolean) as string[])].sort(),
    [read],
  );
  const [year, setYear] = useState<string>('all');

  const scope = year === 'all' ? read : read.filter((b) => b.endDate?.startsWith(year));
  const pages = scope.reduce((s, b) => s + (b.pageCount ?? 0), 0);
  const withPages = scope.filter((b) => b.pageCount).length;

  // Séries par année (continues, sans trou)
  const yearRange = useMemo(() => {
    if (!years.length) return [];
    const out: string[] = [];
    for (let y = +years[0]; y <= +years[years.length - 1]; y++) out.push(String(y));
    return out;
  }, [years]);
  const perYear = yearRange.map((y) => {
    const list = read.filter((b) => b.endDate?.startsWith(y));
    return { label: y, books: list.length, pages: list.reduce((s, b) => s + (b.pageCount ?? 0), 0) };
  });

  // Par mois si une année est sélectionnée
  const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const perMonth = months.map((label, i) => {
    const mm = `${year}-${String(i + 1).padStart(2, '0')}`;
    const list = scope.filter((b) => b.endDate?.startsWith(mm));
    return { label, books: list.length, pages: list.reduce((s, b) => s + (b.pageCount ?? 0), 0) };
  });

  const series = year === 'all' ? perYear : perMonth;
  const authors = countBy(scope, (b) => b.authors).slice(0, 10);
  const genres = countBy(scope, (b) => (b.categories.length ? b.categories : ['Non classé'])).slice(0, 10);

  if (!read.length) {
    return (
      <section className="page empty">
        <h2>Statistiques</h2>
        <p className="muted">Terminez un premier livre pour voir vos statistiques.</p>
      </section>
    );
  }

  return (
    <section className="page">
      <h2>Statistiques</h2>
      <div className="chips">
        <button className={`chip ${year === 'all' ? 'active' : ''}`} onClick={() => setYear('all')}>
          Toutes
        </button>
        {[...years].reverse().map((y) => (
          <button key={y} className={`chip ${year === y ? 'active' : ''}`} onClick={() => setYear(y)}>
            {y}
          </button>
        ))}
      </div>

      <div className="kpis">
        <Kpi label="Livres lus" value={scope.length} />
        <Kpi label="Pages lues" value={pages.toLocaleString('fr-FR')} />
        <Kpi label="Pages / livre" value={withPages ? Math.round(pages / withPages) : '—'} />
        <Kpi label="En cours" value={books.filter((b) => b.status === 'reading').length} />
      </div>

      <div className="card">
        <h3>Livres {year === 'all' ? 'par an' : 'par mois'}</h3>
        <Columns data={series.map((s) => ({ label: s.label, value: s.books }))} />
      </div>
      <div className="card">
        <h3>Pages {year === 'all' ? 'par an' : 'par mois'}</h3>
        <Columns data={series.map((s) => ({ label: s.label, value: s.pages }))} accent />
      </div>
      <div className="card">
        <h3>Par auteur</h3>
        <Bars data={authors} />
      </div>
      <div className="card">
        <h3>Par genre</h3>
        <Bars data={genres} />
      </div>
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="kpi">
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

function Columns({ data, accent }: { data: { label: string; value: number }[]; accent?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="columns" role="img">
      {data.map((d, i) => (
        <div key={i} className="col" title={`${d.label} : ${d.value.toLocaleString('fr-FR')}`}>
          <span className="col-val">{d.value ? d.value.toLocaleString('fr-FR') : ''}</span>
          <div className={`col-bar ${accent ? 'accent' : ''}`} style={{ height: `${(d.value / max) * 100}%` }} />
          <span className="col-label">{d.label.length === 4 ? `’${d.label.slice(2)}` : d.label}</span>
        </div>
      ))}
    </div>
  );
}

function Bars({ data }: { data: [string, number][] }) {
  const max = Math.max(1, ...data.map((d) => d[1]));
  return (
    <ul className="bars">
      {data.map(([label, v]) => (
        <li key={label}>
          <span className="bar-label">{label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(v / max) * 100}%` }} />
          </span>
          <span className="bar-val">{v}</span>
        </li>
      ))}
    </ul>
  );
}
