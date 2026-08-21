import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiRequest, ApiRequestError } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
type Source = {
  id: string;
  name: string;
  sourceType: string;
  baseUrl: string;
  feedUrl?: string | null;
  country?: string | null;
  region?: string | null;
  industry?: string | null;
  language?: string | null;
  category: string;
  reliability: string;
  active: boolean;
  collectionEnabled: boolean;
  collectionIntervalMinutes?: number | null;
  health: string;
  lastCollectedAt?: string | null;
  lastSuccessfulCollectionAt?: string | null;
  lastFailureAt?: string | null;
  consecutiveFailures: number;
  collectionRuns?: Run[];
  articles?: Article[];
};
type Run = {
  id: string;
  startedAt: string;
  completedAt?: string;
  status: string;
  itemsDiscovered: number;
  itemsCreated: number;
  itemsSkipped: number;
  itemsFailed: number;
};
type Article = {
  id: string;
  title: string;
  originalUrl: string;
  canonicalUrl?: string;
  author?: string;
  publishedAt?: string;
  discoveredAt: string;
  collectedAt: string;
  language?: string;
  normalizedText?: string;
  status: string;
  source: Source;
};
type ExtractionRun = { id:string;status:string;provider:string;model:string;promptVersion:string;schemaVersion:string;startedAt:string;completedAt?:string;inputTokens?:number;outputTokens?:number;claimsExtracted:number;errorCode?:string;claims:{id:string;claimType:string;statement:string;evidenceText:string}[] };
const err = (e: unknown) =>
  e instanceof ApiRequestError ? `${e.code}: ${e.message}` : 'Unexpected error';
const fields = [
  'name',
  'baseUrl',
  'feedUrl',
  'country',
  'region',
  'industry',
  'language',
] as const;
function sourceBody(form: HTMLFormElement) {
  const d = new FormData(form);
  return {
    name: d.get('name'),
    sourceType: d.get('sourceType'),
    baseUrl: d.get('baseUrl'),
    feedUrl: d.get('feedUrl') || null,
    country: d.get('country') || null,
    region: d.get('region') || null,
    industry: d.get('industry') || null,
    language: d.get('language') || null,
    category: d.get('category'),
    reliability: d.get('reliability'),
    active: d.get('active') === 'on',
    collectionEnabled: d.get('collectionEnabled') === 'on',
    collectionIntervalMinutes: d.get('collectionIntervalMinutes')
      ? Number(d.get('collectionIntervalMinutes'))
      : null,
  };
}
function SourceForm({
  initial,
  onSubmit,
}: {
  initial?: Source;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      className="grid gap-3 rounded-xl border bg-white p-5 sm:grid-cols-2"
      onSubmit={onSubmit}
    >
      {fields.map((k) => (
        <label className="text-sm" key={k}>
          {k}
          <input
            required={['name', 'baseUrl'].includes(k)}
            name={k}
            defaultValue={String(initial?.[k] ?? '')}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
      ))}
      {[
        ['sourceType', ['RSS', 'ATOM', 'API', 'WEB', 'MANUAL']],
        [
          'category',
          [
            'NEWS',
            'LOCAL_NEWS',
            'GOVERNMENT',
            'REGULATOR',
            'INDUSTRY',
            'PORT',
            'LOGISTICS',
            'LABOUR',
            'TRADE',
            'WEATHER',
            'MARKET',
            'SUPPLIER',
            'OTHER',
          ],
        ],
        ['reliability', ['LOW', 'MEDIUM', 'HIGH', 'PRIMARY']],
      ].map(([k, opts]) => (
        <label className="text-sm" key={k as string}>
          {k as string}
          <select
            name={k as string}
            defaultValue={String(
              initial?.[k as keyof Source] ?? opts?.[0] ?? '',
            )}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            {(opts as string[]).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
      ))}
      <label>
        Interval minutes
        <input
          name="collectionIntervalMinutes"
          type="number"
          min="5"
          defaultValue={initial?.collectionIntervalMinutes ?? 15}
          className="mt-1 w-full rounded-lg border px-3 py-2"
        />
      </label>
      <label>
        <input
          name="active"
          type="checkbox"
          defaultChecked={initial?.active ?? true}
        />{' '}
        Active
      </label>
      <label>
        <input
          name="collectionEnabled"
          type="checkbox"
          defaultChecked={initial?.collectionEnabled ?? false}
        />{' '}
        Collection enabled
      </label>
      <button className="rounded-lg bg-signal px-4 py-2 text-white">
        Save source
      </button>
    </form>
  );
}
export function SourcesPage() {
  const { user } = useWorkspace();
  const [items, setItems] = useState<Source[]>([]);
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [health, setHealth] = useState('');
  const load = () =>
    void apiRequest<{ items: Source[] }>('/sources?pageSize=100')
      .then((r) => setItems(r.items))
      .catch((e) => setError(err(e)));
  useEffect(load, []);
  useEffect(() => {
    void apiRequest<Record<string, number>>('/source-metrics')
      .then(setMetrics)
      .catch((e) => setError(err(e)));
  }, []);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      await apiRequest('/sources', {
        method: 'POST',
        body: JSON.stringify(sourceBody(e.currentTarget)),
      });
      setShow(false);
      load();
    } catch (x) {
      setError(err(x));
    }
  }
  const visibleItems = items.filter(
    (source) =>
      source.name.toLowerCase().includes(search.toLowerCase()) &&
      (!type || source.sourceType === type) &&
      (!health || source.health === health),
  );
  return (
    <Page title="Intelligence sources">
      {error && <Error text={error} />}{' '}
      <div className="mb-5 grid gap-3 sm:grid-cols-5">
        {Object.entries(metrics).map(([label, value]) => (
          <div className="rounded-xl border bg-white p-3" key={label}>
            <div className="text-xs text-muted">{label}</div>
            <b>{value}</b>
          </div>
        ))}
      </div>
      {user.role === 'ADMIN' && (
        <button
          className="mb-4 rounded-lg bg-signal px-4 py-2 text-white"
          onClick={() => setShow(!show)}
        >
          Add source
        </button>
      )}
      {show && <SourceForm onSubmit={create} />}
      <div className="my-4 grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-3">
        <input
          aria-label="Search sources"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search source name"
          className="rounded-lg border px-3 py-2"
        />
        <select
          aria-label="Filter by source type"
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="rounded-lg border px-3 py-2"
        >
          <option value="">All source types</option>
          {['RSS', 'ATOM', 'API', 'WEB', 'MANUAL'].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          aria-label="Filter by health"
          value={health}
          onChange={(event) => setHealth(event.target.value)}
          className="rounded-lg border px-3 py-2"
        >
          <option value="">All health states</option>
          {['HEALTHY', 'DEGRADED', 'FAILING', 'DISABLED'].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Category</th>
              <th>Reliability</th>
              <th>Health</th>
              <th>Last success</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link className="text-signal" to={`/sources/${s.id}`}>
                    {s.name}
                  </Link>
                </td>
                <td>{s.sourceType}</td>
                <td>{s.category}</td>
                <td>{s.reliability}</td>
                <td>{s.health}</td>
                <td>{s.lastSuccessfulCollectionAt ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
export function SourceDetailPage() {
  const { id = '' } = useParams();
  const { user } = useWorkspace();
  const [s, setS] = useState<Source | null>(null);
  const [error, setError] = useState('');
  const load = () =>
    void apiRequest<Source>(`/sources/${id}`)
      .then(setS)
      .catch((e) => setError(err(e)));
  useEffect(load, [id]);
  async function update(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      await apiRequest(`/sources/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(sourceBody(e.currentTarget)),
      });
      load();
    } catch (x) {
      setError(err(x));
    }
  }
  async function collect() {
    try {
      await apiRequest(`/sources/${id}/collect`, { method: 'POST' });
      load();
    } catch (x) {
      setError(err(x));
    }
  }
  return (
    <Page title={s?.name ?? 'Source'}>
      {error && <Error text={error} />}{' '}
      {!s ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            {[
              ['Health', s.health],
              ['Last success', s.lastSuccessfulCollectionAt ?? '—'],
              ['Last failure', s.lastFailureAt ?? '—'],
              ['Failures', s.consecutiveFailures],
            ].map(([a, b]) => (
              <div className="rounded-xl border bg-white p-4" key={a}>
                {a}
                <div className="font-semibold">{b}</div>
              </div>
            ))}
          </div>
          <div className="mb-4 rounded-xl border bg-white p-4 text-sm">
            <div>
              {s.sourceType} · {s.category} · {s.reliability}
            </div>
            <div className="mt-1 break-all">Base URL: {s.baseUrl}</div>
            <div className="break-all">Feed URL: {s.feedUrl ?? '—'}</div>
            <div>
              Location: {[s.country, s.region].filter(Boolean).join(' / ') || '—'} ·
              Language: {s.language ?? '—'}
            </div>
            <div>
              Active: {s.active ? 'yes' : 'no'} · Collection enabled:{' '}
              {s.collectionEnabled ? 'yes' : 'no'} · Interval:{' '}
              {s.collectionIntervalMinutes ?? '—'} minutes
            </div>
          </div>
          {user.role === 'ADMIN' && (
            <>
              <SourceForm initial={s} onSubmit={update} />
              <button
                disabled={!s.collectionEnabled || !s.active}
                onClick={() => void collect()}
                className="my-4 rounded-lg border px-4 py-2 disabled:opacity-40"
              >
                Collect now
              </button>
            </>
          )}
          <h2 className="mt-6 font-semibold">Recent runs</h2>
          {s.collectionRuns?.map((r) => (
            <div
              className="mt-2 rounded-lg border bg-white p-3 text-sm"
              key={r.id}
            >
              {r.status} · discovered {r.itemsDiscovered} · created{' '}
              {r.itemsCreated} · skipped {r.itemsSkipped} · failed{' '}
              {r.itemsFailed}
            </div>
          ))}
          <h2 className="mt-6 font-semibold">Recent articles</h2>
          {s.articles?.map((a) => (
            <Link
              className="mt-2 block rounded-lg border bg-white p-3 text-signal"
              to={`/source-articles/${a.id}`}
              key={a.id}
            >
              {a.title}
            </Link>
          ))}
        </>
      )}
    </Page>
  );
}
export function ArticlesPage() {
  const { user } = useWorkspace();
  const [items, setItems] = useState<Article[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [status, setStatus] = useState('');
  const load = () =>
    void Promise.all([
      apiRequest<{ items: Article[] }>('/source-articles?pageSize=100'),
      apiRequest<{ items: Source[] }>('/sources?pageSize=100'),
    ])
      .then(([a, s]) => {
        setItems(a.items);
        setSources(s.items);
      })
      .catch((e) => setError(err(e)));
  useEffect(load, []);
  async function manual(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    try {
      await apiRequest('/source-articles/manual', {
        method: 'POST',
        body: JSON.stringify({
          sourceId: d.get('sourceId'),
          originalUrl: d.get('originalUrl'),
          title: d.get('title'),
          text: d.get('text') || null,
          publishedAt: new Date(String(d.get('publishedAt'))).toISOString(),
          author: d.get('author') || null,
          language: d.get('language') || null,
        }),
      });
      e.currentTarget.reset();
      load();
    } catch (x) {
      setError(err(x));
    }
  }
  const visibleItems = items.filter(
    (article) =>
      article.title.toLowerCase().includes(search.toLowerCase()) &&
      (!sourceId || article.source.id === sourceId) &&
      (!status || article.status === status),
  );
  return (
    <Page title="Source articles">
      {error && <Error text={error} />}{' '}
      {user.role === 'ADMIN' && (
        <form
          className="mb-5 grid gap-3 rounded-xl border bg-white p-4"
          onSubmit={manual}
        >
          <select name="sourceId" required>
            {sources.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            name="originalUrl"
            type="url"
            placeholder="Original URL"
            required
          />
          <input name="title" placeholder="Title" required />
          <input name="author" placeholder="Optional author" />
          <input name="language" placeholder="Optional language (for example en)" />
          <label className="text-sm">
            Publication date
            <input
              className="ml-2 rounded border px-2 py-1"
              name="publishedAt"
              type="datetime-local"
              required
            />
          </label>
          <textarea name="text" placeholder="Optional source text" />
          <button className="rounded bg-signal p-2 text-white">
            Ingest manual article
          </button>
        </form>
      )}
      <div className="mb-4 grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-3">
        <input
          aria-label="Search articles"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search article title"
          className="rounded-lg border px-3 py-2"
        />
        <select
          aria-label="Filter articles by source"
          value={sourceId}
          onChange={(event) => setSourceId(event.target.value)}
          className="rounded-lg border px-3 py-2"
        >
          <option value="">All sources</option>
          {sources.map((source) => (
            <option value={source.id} key={source.id}>
              {source.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter articles by status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded-lg border px-3 py-2"
        >
          <option value="">All statuses</option>
          {['COLLECTED', 'NORMALIZED', 'FAILED', 'IGNORED'].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        {visibleItems.map((a) => (
          <Link
            className="block rounded-xl border bg-white p-4"
            to={`/source-articles/${a.id}`}
            key={a.id}
          >
            <b>{a.title}</b>
            <div className="text-sm text-muted">
              {a.source.name} · {a.publishedAt ?? 'No publication date'} · collected{' '}
              {a.collectedAt} · {a.language ?? 'language unavailable'} · {a.status}
            </div>
          </Link>
        ))}
      </div>
    </Page>
  );
}
export function ArticleDetailPage() {
  const { id = '' } = useParams();
  const { user } = useWorkspace();
  const [a, setA] = useState<Article | null>(null);
  const [runs,setRuns]=useState<ExtractionRun[]>([]);
  const [error, setError] = useState('');
  const load=()=>void Promise.all([apiRequest<Article>(`/source-articles/${id}`),apiRequest<ExtractionRun[]>(`/source-articles/${id}/extractions`)])
      .then(([article,extractions])=>{setA(article);setRuns(extractions);})
      .catch((e) => setError(err(e)));
  useEffect(load, [id]);
  async function extract(reprocess=false){try{await apiRequest(`/source-articles/${id}/${reprocess?'reprocess':'extract'}`,{method:'POST'});load();}catch(e){setError(err(e));}}
  return (
    <Page title={a?.title ?? 'Article'}>
      {error && <Error text={error} />}{' '}
      {a && (
        <div className="rounded-xl border bg-white p-5">
          <p>
            {a.source.name} · {a.source.reliability} · {a.status}
          </p>
          <p className="mt-2 text-sm">
            Author: {a.author ?? 'Unavailable'} · Published:{' '}
            {a.publishedAt ?? 'Unavailable'} · Discovered: {a.discoveredAt} ·
            Collected: {a.collectedAt}
          </p>
          <a
            className="mt-4 block text-signal underline"
            href={a.originalUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open original source
          </a>
          <p className="mt-2 break-all text-xs">
            Canonical: {a.canonicalUrl ?? 'Unavailable'}
          </p>
          <div className="mt-6 whitespace-pre-wrap text-sm">
            {a.normalizedText ?? 'No normalized body available.'}
          </div>
          <section className="mt-8 border-t pt-5"><h2 className="font-semibold">AI extraction</h2>{user.role==='ADMIN'&&<div className="my-3 flex gap-2"><button className="rounded bg-signal px-3 py-2 text-white" onClick={()=>void extract(false)}>Extract</button><button className="rounded border px-3 py-2" onClick={()=>void extract(true)}>Reprocess</button></div>}{runs.length===0?<p className="text-sm text-muted">Not processed.</p>:runs.map((run)=><div className="mt-3 rounded-lg border p-3 text-sm" key={run.id}><b>{run.status}</b> · {run.provider}/{run.model} · prompt {run.promptVersion} · schema {run.schemaVersion}<div>{run.startedAt} → {run.completedAt??'running'} · tokens {run.inputTokens??'—'}/{run.outputTokens??'—'} · claims {run.claimsExtracted}</div>{run.errorCode&&<div className="text-red-700">{run.errorCode}</div>}{run.claims.map((claim)=><Link className="mt-2 block text-signal" to={`/claims/${claim.id}`} key={claim.id}>{claim.claimType}: {claim.statement}</Link>)}</div>)}</section>
        </div>
      )}
    </Page>
  );
}
function Page({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-5 sm:p-8">
      <h1 className="mb-6 text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}
function Error({ text }: { text: string }) {
  return (
    <div role="alert" className="mb-4 rounded bg-red-50 p-3 text-red-800">
      {text}
    </div>
  );
}
