import { useEffect, useState, type FormEvent } from 'react';
import { Boxes, Factory, Globe2, Languages, Mail, Newspaper, PackageSearch, RadioTower, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { useWorkspace } from '../lib/workspace';

type RelevantArticle = {
  id: string; title: string; summary: string | null; originalTitle: string; originalSummary: string | null; translated: boolean; relevance: 'HIGH' | 'MEDIUM'; url: string; publishedAt: string | null;
  discoveredAt: string; category: string; country: string | null; region: string | null; language: string | null; source: { name: string; status: string };
  relatedSuppliers: string[]; relatedFactories: string[]; relatedProducts: string[];
  relatedMaterials: string[]; relatedCountries: string[]; relatedLocations: string[]; reasons: string[];
};
type PocSource = {
  id: string; name: string; type: string; url: string; category: string;
  country: string | null; region: string | null; industry: string | null; language: string | null;
  lastChecked: string | null; lastSuccessfulSync: string | null; status: string; articleCount: number;
  health: string;
  recommendation: { priority: number; reason: string; scope: string };
  lastRun: { status: string; itemsCreated: number; itemsFailed: number; startedAt: string; errorMessage?: string | null } | null;
};
type Dashboard = {
  customer: { id: string; name: string };
  counts: { suppliers: number; factories: number; countries: number; products: number; materials: number; relevantArticlesToday: number; relevantArticles: number };
  latestCollection: { status: string; startedAt: string; itemsCreated: number; itemsFailed: number; source: { name: string } } | null;
  sources: PocSource[];
  recentUpdates: Array<{ id: string; status: string; startedAt: string; itemsCreated: number; itemsFailed: number; source: { name: string } }>;
  articles: RelevantArticle[];
  monitoringProfile: { countries: string[]; regions: string[]; industries: string[]; suppliers: string[]; factories: string[]; products: string[]; materials: string[]; locations: string[]; monitoringKeywords: string[]; searchLanguages: string[] };
};

function usePocDashboard() {
  const { customerId } = useWorkspace();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => { setData(null); setError(''); void apiRequest<Dashboard>(`/customers/${customerId}/news-radar`).then(setData).catch(() => setError('The BSK intelligence dashboard could not be loaded.')); }, [customerId, version]);
  return { data, error, reload: () => setVersion((value) => value + 1) };
}

export function PocDashboardPage() {
  const { data, error } = usePocDashboard();
  const metrics = data ? [
    ['Suppliers', data.counts.suppliers, Boxes], ['Factories', data.counts.factories, Factory],
    ['Countries', data.counts.countries, Globe2], ['Products & materials', data.counts.products + data.counts.materials, PackageSearch],
    ['Relevant today', data.counts.relevantArticlesToday, Newspaper], ['Sources online', data.sources.filter((source) => source.status === 'ACTIVE').length, RadioTower],
  ] as const : [];
  return <Page title={data ? `${data.customer.name} Supply Chain Dashboard` : 'BSK Supply Chain Dashboard'} subtitle="What is our supply chain, and what relevant things are happening in the world?">
    {error && <ErrorBox text={error} />}{!data && !error && <Loading />}
    {data && <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">{metrics.map(([label, value, Icon]) => <div className="rounded-xl border bg-white p-4 shadow-panel" key={label}><Icon className="h-4 w-4 text-signal" /><div className="mt-3 text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-muted">{label}</div></div>)}</section>
      <section className="mt-5 rounded-xl border bg-white p-5"><h2 className="font-semibold">BSK monitoring profile</h2><p className="mt-1 text-xs text-muted">Generated only from verified customer graph data.</p><div className="mt-3 flex flex-wrap gap-2">{[...data.monitoringProfile.countries, ...data.monitoringProfile.regions, ...data.monitoringProfile.industries, ...data.monitoringProfile.searchLanguages.map((language) => `Language: ${language}`)].map((value) => <span className="rounded-full border bg-canvas px-3 py-1 text-xs" key={value}>{value}</span>)}</div></section>
      <div className="mt-7 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-xl border bg-white p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Latest relevant articles</h2><p className="mt-1 text-xs text-muted">Deterministically matched to explicit BSK assets and locations.</p></div><Link className="text-sm font-semibold text-signal" to="/articles">View all</Link></div><div className="mt-4 space-y-3">{data.articles.slice(0, 6).map((article) => <ArticleCard article={article} key={article.id} />)}{data.articles.length === 0 && <Empty text="No collected article currently matches the verified BSK graph." />}</div></section>
        <div className="space-y-5">
          <section className="rounded-xl border bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Source status</h2><Link className="text-sm font-semibold text-signal" to="/sources">Details</Link></div><div className="mt-4 space-y-2">{data.sources.map((source) => <div className="flex items-center justify-between rounded-lg bg-canvas p-3 text-sm" key={source.id}><span>{source.name}</span><Status value={source.status} /></div>)}</div></section>
          <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Recent updates</h2><div className="mt-3 space-y-2 text-sm">{data.recentUpdates.map((run) => <div className="border-b pb-2 last:border-0" key={run.id}><div className="font-medium">{run.source.name}</div><div className="text-xs text-muted">{new Date(run.startedAt).toLocaleString()} · {run.itemsCreated} new · {run.itemsFailed} failed</div></div>)}{data.recentUpdates.length === 0 && <Empty text="No collection run recorded yet." />}</div></section>
        </div>
      </div>
    </>}
  </Page>;
}

export function PocSourcesPage() {
  const { data, error, reload } = usePocDashboard();
  const { user } = useWorkspace();
  const [actionError, setActionError] = useState('');
  async function setEnabled(source: PocSource, enabled: boolean) {
    setActionError('');
    try {
      await apiRequest(`/sources/${source.id}`, { method: 'PATCH', body: JSON.stringify({ active: enabled, collectionEnabled: enabled }) });
      reload();
    } catch { setActionError('The source status could not be updated.'); }
  }
  return <Page title="Sources" subtitle="Regional sources recommended from the verified BSK country and industry profile.">
    {error && <ErrorBox text={error} />}{actionError && <ErrorBox text={actionError} />}{!data && !error && <Loading />}
    {data && <div className="space-y-3">{data.sources.map((source) => <article className="rounded-xl border bg-white p-5" key={source.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold">{source.name}</div><div className="mt-1 text-xs text-muted">{source.type} · {source.category} · Priority {source.recommendation.priority}</div></div><Status value={source.status} /></div><div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-4"><div><span className="font-semibold text-ink">Country/region:</span> {source.country ?? source.region ?? 'Global fallback'}</div><div><span className="font-semibold text-ink">Language:</span> {source.language ?? 'Multiple/unknown'}</div><div><span className="font-semibold text-ink">Articles:</span> {source.articleCount}</div><div><span className="font-semibold text-ink">Last checked:</span> {source.lastChecked ? new Date(source.lastChecked).toLocaleString() : 'Not checked yet'}</div></div><p className="mt-3 text-xs text-muted">{source.recommendation.reason}</p><a className="mt-3 block break-all text-sm text-signal hover:underline" href={source.url} target="_blank" rel="noreferrer">{source.url}</a><div className="mt-3 text-xs text-muted">Last success: {source.lastSuccessfulSync ? new Date(source.lastSuccessfulSync).toLocaleString() : 'Not synced yet'}{source.lastRun ? ` · Last run ${source.lastRun.status} · ${source.lastRun.itemsCreated} new · ${source.lastRun.itemsFailed} failed` : ''}</div>{source.lastRun?.errorMessage && <p className="mt-2 text-xs text-red-700">{source.lastRun.errorMessage}</p>}{user.role === 'ADMIN' && <div className="mt-4"><button className="rounded-lg border px-3 py-1.5 text-sm font-semibold disabled:opacity-40" disabled={source.status === 'DISABLED' && !['RSS', 'ATOM'].includes(source.type)} onClick={() => void setEnabled(source, source.status === 'DISABLED')}>{source.status === 'DISABLED' ? 'Enable' : 'Disable'}</button>{source.status === 'DISABLED' && !['RSS', 'ATOM'].includes(source.type) && <span className="ml-3 text-xs text-muted">Public reference only; no supported feed.</span>}</div>}</article>)}{user.role === 'ADMIN' && <Link className="inline-block rounded-lg border px-4 py-2 text-sm font-semibold" to="/source-admin">Advanced source configuration</Link>}</div>}
  </Page>;
}

export function PocArticlesPage() {
  const { customerId } = useWorkspace();
  const [items, setItems] = useState<RelevantArticle[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { setItems([]); void apiRequest<{ items: RelevantArticle[] }>(`/customers/${customerId}/relevant-articles`).then((result) => setItems(result.items)).catch(() => setError('Relevant articles could not be loaded.')); }, [customerId]);
  return <Page title="Relevant articles" subtitle="Only collected articles with a deterministic match to the current BSK supply-chain graph are shown.">{error && <ErrorBox text={error} />}<div className="space-y-3">{items.map((article) => <ArticleCard article={article} key={article.id} />)}{!error && items.length === 0 && <Empty text="No relevant articles have been collected yet. The scheduler will check enabled sources every five minutes." />}</div></Page>;
}

function ArticleCard({ article }: { article: RelevantArticle }) {
  const [original, setOriginal] = useState(false);
  const related = [...article.relatedSuppliers, ...article.relatedFactories, ...article.relatedProducts, ...article.relatedMaterials, ...article.relatedCountries, ...article.relatedLocations];
  const title = original ? article.originalTitle : article.title;
  const summary = original ? article.originalSummary : article.summary;
  return <article className="rounded-lg border p-4"><div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-wide text-muted"><span className={article.relevance === 'HIGH' ? 'font-bold text-emerald-700' : 'font-bold text-amber-700'}>{article.relevance}</span><span>·</span><span>{article.category}</span><span>·</span><span>{article.source.name}</span>{article.country || article.region ? <><span>·</span><span>{article.country ?? article.region}</span></> : null}<span>·</span><span>{article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : 'Date unavailable'}</span></div><a className="mt-2 block font-semibold text-signal hover:underline" href={article.url} target="_blank" rel="noreferrer">{title}</a>{summary && <p className="mt-2 line-clamp-3 text-sm text-muted">{summary}</p>}{article.translated && <button className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-signal" onClick={() => setOriginal((value) => !value)}><Languages className="h-3 w-3" />{original ? 'Show translation' : 'View original'}</button>}<div className="mt-3 text-xs"><span className="font-semibold">Related BSK data:</span> <span className="text-muted">{related.join(', ') || 'Location match'}</span></div><p className="mt-1 text-xs text-muted">{article.reasons[0]}</p></article>;
}
export function PocDailyBriefPage() {
  const { customerId } = useWorkspace();
  const [preference, setPreference] = useState<{ enabled: boolean; deliveryTime: string; timezone: string; email: string; language: string; emailConfigured: boolean } | null>(null);
  const [brief, setBrief] = useState<{ generatedAt: string; items: Array<{ id: string; exposure: { reason: string; sourceArticle: { title: string; originalUrl: string; translations: Array<{ targetLanguage: string; translatedTitle: string | null }>; source: { name: string } } } }> } | null>(null);
  const [message, setMessage] = useState('');
  const load = () => void Promise.all([apiRequest<typeof preference>(`/customers/${customerId}/daily-brief-preference`), apiRequest<typeof brief>(`/customers/${customerId}/daily-brief`)]).then(([nextPreference, nextBrief]) => { setPreference(nextPreference); setBrief(nextBrief); }).catch(() => setMessage('Daily Brief settings could not be loaded.'));
  useEffect(load, [customerId]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await apiRequest(`/customers/${customerId}/daily-brief-preference`, { method: 'PUT', body: JSON.stringify({ enabled: data.get('enabled') === 'on', deliveryTime: data.get('deliveryTime'), timezone: data.get('timezone'), email: data.get('email'), language: data.get('language') }) });
      setMessage('Daily Brief preference saved.'); load();
    } catch { setMessage('Daily Brief preference could not be saved.'); }
  }
  return <Page title="Daily Brief" subtitle="Optional morning email containing only HIGH and MEDIUM intelligence linked to this customer workspace.">{message && <p className="mb-4 rounded-lg border bg-white p-3 text-sm">{message}</p>}{!preference ? <Loading /> : <form onSubmit={save} className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2"><label className="text-sm">Email<input name="email" type="email" required defaultValue={preference.email} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">Delivery time<input name="deliveryTime" type="time" required defaultValue={preference.deliveryTime} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">Timezone<input name="timezone" required defaultValue={preference.timezone} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">Language<select name="language" defaultValue={preference.language} className="mt-1 w-full rounded-lg border px-3 py-2">{['en','nl','de','fr','es','zh','ja','ko','vi'].map((language) => <option key={language}>{language}</option>)}</select></label><label className="flex items-center gap-2 text-sm"><input name="enabled" type="checkbox" defaultChecked={preference.enabled} disabled={!preference.emailConfigured} /> Enable daily email</label><button className="rounded-lg bg-signal px-4 py-2 text-white">Save preference</button>{!preference.emailConfigured && <p className="sm:col-span-2 text-xs text-muted">Email delivery is unavailable until the server-side provider is configured. Preferences remain disabled by default.</p>}</form>}<section className="mt-6 rounded-xl border bg-white p-5"><h2 className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4" /> Latest generated brief</h2>{brief ? <><p className="mt-1 text-xs text-muted">Generated {new Date(brief.generatedAt).toLocaleString()}</p><div className="mt-4 space-y-3">{brief.items.map((item) => { const translation = item.exposure.sourceArticle.translations.find((value) => value.targetLanguage === preference?.language); return <article key={item.id} className="rounded-lg border p-3"><a href={item.exposure.sourceArticle.originalUrl} target="_blank" rel="noreferrer" className="font-semibold text-signal">{translation?.translatedTitle ?? item.exposure.sourceArticle.title}</a><p className="mt-1 text-sm text-muted">{item.exposure.reason}</p><p className="mt-1 text-xs text-muted">{item.exposure.sourceArticle.source.name} · View original article</p></article>; })}</div></> : <Empty text="No Daily Brief has been generated yet." />}</section></Page>;
}
function Status({ value }: { value: string }) { return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${value === 'ACTIVE' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : value === 'ERROR' ? 'border-red-200 bg-red-50 text-red-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>{value}</span>; }
function Page({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <div className="p-5 sm:p-8"><p className="text-sm font-medium text-signal">BSK Supply Chain Intelligence POC</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1><p className="mb-7 mt-2 max-w-3xl text-sm text-muted">{subtitle}</p>{children}</div>; }
function Loading() { return <div className="flex items-center gap-2 rounded-xl border bg-white p-6 text-sm text-muted"><RefreshCw className="h-4 w-4 animate-spin" /> Loading…</div>; }
function ErrorBox({ text }: { text: string }) { return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{text}</p>; }
function Empty({ text }: { text: string }) { return <p className="rounded-lg border border-dashed p-4 text-sm text-muted">{text}</p>; }
