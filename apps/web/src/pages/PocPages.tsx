import { useEffect, useState, type FormEvent } from 'react';
import { Boxes, Factory, Globe2, Languages, Mail, Newspaper, PackageSearch, RadioTower, RefreshCw, Tags } from 'lucide-react';
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
type MonitoringTag = {
  id: string; type: 'AUTO' | 'SUGGESTED' | 'CUSTOM'; label: string; category: string;
  status: 'PENDING' | 'ACTIVE' | 'DISABLED' | 'IGNORED'; reason: string;
};
type MonitoringSource = {
  id: string; name: string; type: string; url: string; country: string | null; region: string | null;
  category: string; language: string | null; reliability: string; collectible: boolean;
  enabled: boolean; recommended: boolean; recommendation: { priority: number; reason: string; scope: string } | null;
};
type MonitoringProfile = {
  countries: string[]; regions: string[]; industries: string[]; searchLanguages: string[];
  counts: { suppliers: number; factories: number; countries: number; products: number; materials: number; routes: number; ports: number; logisticsRegions: number };
  tags: { auto: MonitoringTag[]; suggested: MonitoringTag[]; custom: MonitoringTag[] };
  sources: MonitoringSource[];
  coverage: Array<{ region: string; total: number; enabled: number; categories: Record<string, number>; languages: string[] }>;
};

function useMonitoringProfile() {
  const { customerId } = useWorkspace();
  const [data, setData] = useState<MonitoringProfile | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    setData(null); setError('');
    void apiRequest<MonitoringProfile>(`/customers/${customerId}/news-radar/monitoring-profile`)
      .then(setData).catch(() => setError('The monitoring profile could not be loaded.'));
  }, [customerId, version]);
  return { customerId, data, error, reload: () => setVersion((value) => value + 1) };
}

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
      <section className="mt-5 rounded-xl border bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">BSK monitoring profile</h2><p className="mt-1 text-xs text-muted">Generated only from verified customer graph data.</p></div><Link className="text-sm font-semibold text-signal" to="/monitoring-profile">Manage monitoring profile</Link></div><div className="mt-3 flex flex-wrap gap-2">{[...data.monitoringProfile.countries, ...data.monitoringProfile.regions, ...data.monitoringProfile.industries, ...data.monitoringProfile.searchLanguages.map((language) => `Language: ${language}`)].map((value) => <span className="rounded-full border bg-canvas px-3 py-1 text-xs" key={value}>{value}</span>)}</div></section>
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

export function PocMonitoringProfilePage() {
  const { customerId, data, error, reload } = useMonitoringProfile();
  const [message, setMessage] = useState('');
  async function updateTag(tag: MonitoringTag, body: Record<string, unknown>) {
    setMessage('');
    try {
      await apiRequest(`/customers/${customerId}/news-radar/monitoring-tags/${tag.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      reload();
    } catch { setMessage('The monitoring tag could not be updated.'); }
  }
  async function addCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      await apiRequest(`/customers/${customerId}/news-radar/monitoring-tags`, { method: 'POST', body: JSON.stringify({ label: values.get('label'), category: values.get('category') }) });
      form.reset(); setMessage('Custom monitoring tag added.'); reload();
    } catch { setMessage('The custom monitoring tag could not be added.'); }
  }
  async function removeCustom(tag: MonitoringTag) {
    try {
      await apiRequest(`/customers/${customerId}/news-radar/monitoring-tags/${tag.id}`, { method: 'DELETE' });
      reload();
    } catch { setMessage('The custom monitoring tag could not be removed.'); }
  }
  const summary = data ? [
    ['Suppliers', data.counts.suppliers], ['Factories', data.counts.factories], ['Countries', data.counts.countries],
    ['Materials', data.counts.materials], ['Routes & ports', data.counts.routes + data.counts.ports], ['Logistics regions', data.counts.logisticsRegions],
  ] : [];
  return <Page title="Monitoring Profile" subtitle="What SupplySignal monitors, derived from the explicit customer supply-chain graph and customer-controlled watch terms.">
    {error && <ErrorBox text={error} />}{message && <p className="mb-4 rounded-lg border bg-white p-3 text-sm">{message}</p>}{!data && !error && <Loading />}
    {data && <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" aria-label="Supply-chain monitoring coverage">{summary.map(([label, value]) => <div key={label} className="rounded-xl border bg-white p-4"><div className="text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-muted">{label}</div></div>)}</section>
      <TagSection title="Automatically monitored" description="Derived from active graph entities. These terms cannot be deleted; individual items can be disabled." tags={data.tags.auto} actions={(tag) => <button className="rounded-md border px-2 py-1 text-xs font-semibold" onClick={() => void updateTag(tag, { status: tag.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })}>{tag.status === 'ACTIVE' ? 'Disable' : 'Enable'}</button>} />
      <TagSection title="Suggested monitoring" description="Deterministic recommendations with an explanation. Adding a suggestion activates it; ignoring it keeps it out of matching." tags={data.tags.suggested} actions={(tag) => <div className="flex gap-2">{tag.status !== 'ACTIVE' && <button className="rounded-md bg-signal px-2 py-1 text-xs font-semibold text-white" onClick={() => void updateTag(tag, { status: 'ACTIVE' })}>Add</button>}{tag.status !== 'IGNORED' && <button className="rounded-md border px-2 py-1 text-xs font-semibold" onClick={() => void updateTag(tag, { status: 'IGNORED' })}>Ignore</button>}</div>} />
      <section className="rounded-xl border bg-white p-5"><div className="flex items-center gap-2"><Tags className="h-4 w-4 text-signal" /><h2 className="font-semibold">Custom watch tags</h2></div><p className="mt-1 text-xs text-muted">A custom term alone never enters the main feed; explicit BSK graph context is still required.</p><form onSubmit={addCustom} className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_auto]"><label className="text-sm">Watch term<input name="label" required minLength={2} maxLength={100} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="e.g. EU due diligence" /></label><label className="text-sm">Category<select name="category" className="mt-1 w-full rounded-lg border px-3 py-2"><option value="THEME">Theme</option><option value="MATERIAL">Material</option><option value="INDUSTRY">Industry</option><option value="LOCATION">Location</option></select></label><button className="self-end rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-white">Add tag</button></form><div className="mt-4 space-y-2">{data.tags.custom.map((tag) => <CustomTagRow key={tag.id} tag={tag} update={updateTag} remove={removeCustom} />)}{data.tags.custom.length === 0 && <Empty text="No custom watch tags configured." />}</div></section>
    </div>}
  </Page>;
}

function TagSection({ title, description, tags, actions }: { title: string; description: string; tags: MonitoringTag[]; actions(tag: MonitoringTag): React.ReactNode }) {
  return <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-xs text-muted">{description}</p><div className="mt-4 grid gap-3 md:grid-cols-2">{tags.map((tag) => <article key={tag.id} className="flex items-start justify-between gap-3 rounded-lg border p-3"><div><div className="font-medium">{tag.label}</div><div className="mt-1 text-xs text-muted">{tag.category} · {tag.status}</div><p className="mt-2 text-xs text-muted">{tag.reason}</p></div>{actions(tag)}</article>)}</div></section>;
}

function CustomTagRow({ tag, update, remove }: { tag: MonitoringTag; update(tag: MonitoringTag, body: Record<string, unknown>): Promise<void>; remove(tag: MonitoringTag): Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(tag.label);
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div>{editing ? <label className="text-xs text-muted">Watch term<input aria-label="Edit watch term" value={label} onChange={(event) => setLabel(event.target.value)} className="mt-1 block rounded-md border px-2 py-1 text-sm text-ink" /></label> : <div className="font-medium">{tag.label}</div>}<div className="text-xs text-muted">{tag.category} · {tag.status}</div></div><div className="flex gap-2">{editing ? <><button className="rounded-md bg-signal px-2 py-1 text-xs font-semibold text-white" onClick={() => void update(tag, { label }).then(() => setEditing(false))}>Save</button><button className="rounded-md border px-2 py-1 text-xs font-semibold" onClick={() => { setLabel(tag.label); setEditing(false); }}>Cancel</button></> : <button className="rounded-md border px-2 py-1 text-xs font-semibold" onClick={() => setEditing(true)}>Edit</button>}<button className="rounded-md border px-2 py-1 text-xs font-semibold" onClick={() => void update(tag, { status: tag.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })}>{tag.status === 'ACTIVE' ? 'Disable' : 'Enable'}</button><button className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700" onClick={() => void remove(tag)}>Remove</button></div></div>;
}

export function PocSourcesPage() {
  const { customerId, data, error, reload } = useMonitoringProfile();
  const [actionError, setActionError] = useState('');
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('');
  const [category, setCategory] = useState('');
  const [language, setLanguage] = useState('');
  const [recommendedOnly, setRecommendedOnly] = useState(true);
  async function setEnabled(source: MonitoringSource, enabled: boolean) {
    setActionError('');
    try {
      await apiRequest(`/customers/${customerId}/news-radar/source-preferences/${source.id}`, { method: 'PUT', body: JSON.stringify({ enabled }) });
      reload();
    } catch { setActionError('The source status could not be updated.'); }
  }
  async function enableRecommended() {
    try {
      await apiRequest(`/customers/${customerId}/news-radar/source-preferences/enable-recommended`, { method: 'POST', body: JSON.stringify(country ? { country } : {}) });
      reload();
    } catch { setActionError('Recommended sources could not be enabled.'); }
  }
  const filtered = (data?.sources ?? []).filter((source) =>
    (!recommendedOnly || source.recommended) &&
    (!search || source.name.toLowerCase().includes(search.toLowerCase())) &&
    (!country || source.country === country || source.region === country) &&
    (!category || source.category === category) &&
    (!language || source.language === language),
  );
  const grouped = Object.entries(filtered.reduce<Record<string, MonitoringSource[]>>((groups, source) => {
    const key = source.country ?? source.region ?? 'Global';
    (groups[key] ??= []).push(source);
    return groups;
  }, {})).sort(([a], [b]) => a.localeCompare(b));
  const countries = [...new Set((data?.sources ?? []).flatMap((source) => [source.country ?? source.region].filter(Boolean) as string[]))].sort();
  const categories = [...new Set((data?.sources ?? []).map((source) => source.category))].sort();
  const languages = [...new Set((data?.sources ?? []).map((source) => source.language).filter(Boolean) as string[])].sort();
  return <Page title="Sources" subtitle="What SupplySignal monitors for this workspace, grouped by customer geography and coverage category.">
    {error && <ErrorBox text={error} />}{actionError && <ErrorBox text={actionError} />}{!data && !error && <Loading />}
    {data && <div className="space-y-6"><section className="rounded-xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Recommended for this supply chain</h2><p className="mt-1 text-xs text-muted">{data.sources.filter((source) => source.recommended).length} verified sources map to the current profile; {data.sources.filter((source) => source.enabled).length} are enabled for this workspace.</p></div><button className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-white" onClick={() => void enableRecommended()}>Enable recommended{country ? ` for ${country}` : ''}</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><input aria-label="Search sources" placeholder="Search sources" value={search} onChange={(event) => setSearch(event.target.value)} className="rounded-lg border px-3 py-2 text-sm" /><select aria-label="Filter by country or region" value={country} onChange={(event) => setCountry(event.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option value="">All regions</option>{countries.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Filter by language" value={language} onChange={(event) => setLanguage(event.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option value="">All languages</option>{languages.map((value) => <option key={value}>{value}</option>)}</select><label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={recommendedOnly} onChange={(event) => setRecommendedOnly(event.target.checked)} /> Recommended only</label></div></section>{grouped.map(([region, sources]) => <section key={region} className="rounded-xl border bg-white p-5"><div className="flex items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">{region} — {sources.filter((source) => source.enabled).length} enabled sources</h2><p className="mt-1 text-xs text-muted">{Object.entries(sources.reduce<Record<string, number>>((counts, source) => ({ ...counts, [source.category]: (counts[source.category] ?? 0) + 1 }), {})).map(([name, count]) => `${name.replaceAll('_', ' ')} ${count}`).join(' · ')}</p></div></div><div className="mt-4 divide-y">{sources.map((source) => <article key={source.id} className="py-4 first:pt-0 last:pb-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold">{source.name}</div><div className="mt-1 text-xs text-muted">{source.category} · {source.language ?? 'Multiple'} · {source.reliability}</div></div><button className={`rounded-full border px-3 py-1 text-xs font-semibold ${source.enabled ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : ''}`} disabled={!source.collectible && !source.enabled} onClick={() => void setEnabled(source, !source.enabled)}>{source.enabled ? 'ON' : 'OFF'}</button></div><p className="mt-2 text-xs text-muted">{source.recommendation?.reason ?? 'Available in the verified public source universe.'}</p><a className="mt-2 block break-all text-xs text-signal hover:underline" href={source.url} target="_blank" rel="noreferrer">Open source</a>{!source.collectible && <p className="mt-1 text-xs text-muted">Coverage reference; automatic collection is unavailable until a supported public feed or API is verified.</p>}</article>)}</div></section>)}{grouped.length === 0 && <Empty text="No sources match the selected filters." />}</div>}
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
  const [brief, setBrief] = useState<{ generatedAt: string; items: Array<{ id: string; section: string; exposure: { reason: string; sourceArticle: { title: string; originalUrl: string; publishedAt: string | null; translations: Array<{ targetLanguage: string; translatedTitle: string | null }>; source: { name: string } } } }> } | null>(null);
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
  async function preview() {
    const windowEnd = new Date(); windowEnd.setUTCDate(windowEnd.getUTCDate() + 1);
    try {
      const next = await apiRequest<typeof brief>(`/customers/${customerId}/daily-brief/generate`, { method: 'POST', body: JSON.stringify({ date: windowEnd.toISOString().slice(0, 10) }) });
      setBrief(next); setMessage('Daily Brief preview generated.');
    } catch { setMessage('Daily Brief preview could not be generated.'); }
  }
  const sections = [['TOP_DEVELOPMENTS', 'Top Developments'], ['SUPPLIERS_FACTORIES', 'Suppliers / Factories'], ['PRODUCTS_MATERIALS', 'Products / Materials'], ['LOGISTICS_TRADE', 'Logistics / Trade'], ['WATCHLIST', 'Watchlist']] as const;
  return <Page title="Daily Brief" subtitle="Optional morning email containing only HIGH and MEDIUM intelligence linked to this customer workspace.">{message && <p className="mb-4 rounded-lg border bg-white p-3 text-sm">{message}</p>}{!preference ? <Loading /> : <form onSubmit={save} className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2"><label className="text-sm">Email<input name="email" type="email" required defaultValue={preference.email} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">Delivery time<input name="deliveryTime" type="time" required defaultValue={preference.deliveryTime} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">Timezone<input name="timezone" required defaultValue={preference.timezone} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">Language<select name="language" defaultValue={preference.language} className="mt-1 w-full rounded-lg border px-3 py-2">{['en','nl','de','fr','es','zh','ja','ko','vi'].map((language) => <option key={language}>{language}</option>)}</select></label><label className="flex items-center gap-2 text-sm"><input name="enabled" type="checkbox" defaultChecked={preference.enabled} disabled={!preference.emailConfigured} /> Enable daily email</label><button className="rounded-lg bg-signal px-4 py-2 text-white">Save preference</button>{!preference.emailConfigured && <p className="sm:col-span-2 text-xs text-muted">Email delivery is unavailable until the server-side provider is configured. Preferences remain disabled by default.</p>}</form>}<section className="mt-6 rounded-xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4" /> Latest generated brief</h2><button type="button" onClick={() => void preview()} className="rounded-lg border px-3 py-2 text-sm font-semibold">Generate preview</button></div>{brief ? <><p className="mt-1 text-xs text-muted">Generated {new Date(brief.generatedAt).toLocaleString()}</p><div className="mt-5 space-y-6">{sections.map(([key, label]) => { const items = brief.items.filter((item) => item.section === key); return <section key={key}><h3 className="text-sm font-semibold">{label}</h3>{items.length ? <div className="mt-2 space-y-3">{items.map((item) => { const article = item.exposure.sourceArticle; const translation = article.translations.find((value) => value.targetLanguage === preference?.language); return <article key={item.id} className="rounded-lg border p-3"><a href={article.originalUrl} target="_blank" rel="noreferrer" className="font-semibold text-signal">{translation?.translatedTitle ?? article.title}</a><p className="mt-1 text-sm text-muted">{item.exposure.reason}</p><p className="mt-1 text-xs text-muted">{article.source.name} · {article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : 'Date unavailable'} · View original article</p></article>; })}</div> : <p className="mt-2 text-xs text-muted">No qualifying items.</p>}</section>; })}</div></> : <Empty text="No Daily Brief has been generated yet." />}</section></Page>;
}
function Status({ value }: { value: string }) { return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${value === 'ACTIVE' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : value === 'ERROR' ? 'border-red-200 bg-red-50 text-red-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>{value}</span>; }
function Page({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <div className="p-5 sm:p-8"><p className="text-sm font-medium text-signal">BSK Supply Chain Intelligence POC</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1><p className="mb-7 mt-2 max-w-3xl text-sm text-muted">{subtitle}</p>{children}</div>; }
function Loading() { return <div className="flex items-center gap-2 rounded-xl border bg-white p-6 text-sm text-muted"><RefreshCw className="h-4 w-4 animate-spin" /> Loading…</div>; }
function ErrorBox({ text }: { text: string }) { return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{text}</p>; }
function Empty({ text }: { text: string }) { return <p className="rounded-lg border border-dashed p-4 text-sm text-muted">{text}</p>; }
