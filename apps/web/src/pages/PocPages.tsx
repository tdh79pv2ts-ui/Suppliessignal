import { useEffect, useState, type FormEvent } from 'react';
import { Factory, Globe2, Languages, Mail, PackageSearch, RefreshCw, Tags } from 'lucide-react';
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
  intelligence: { counts: { direct: number; potential: number; broader: number }; developments: Array<{ id: string; level: 'DIRECT' | 'POTENTIAL' | 'BROADER'; title: string; explanation: string; sourceCount: number; publishedAt: string | null }> };
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

function validMonitoringProfile(value: MonitoringProfile) {
  return Boolean(value?.counts && value?.tags && Array.isArray(value.tags.auto) && Array.isArray(value.tags.suggested) && Array.isArray(value.tags.custom) && Array.isArray(value.sources));
}

function compatibleDashboard(value: Dashboard): Dashboard {
  if (!value?.counts || !value?.customer) throw new Error('Incompatible dashboard response');
  return {
    ...value,
    articles: value.articles ?? [],
    sources: value.sources ?? [],
    recentUpdates: value.recentUpdates ?? [],
    intelligence: value.intelligence ?? { counts: { direct: 0, potential: 0, broader: 0 }, developments: [] },
    monitoringProfile: {
      countries: value.monitoringProfile?.countries ?? [],
      regions: value.monitoringProfile?.regions ?? [],
      industries: value.monitoringProfile?.industries ?? [],
      suppliers: value.monitoringProfile?.suppliers ?? [],
      factories: value.monitoringProfile?.factories ?? [],
      products: value.monitoringProfile?.products ?? [],
      materials: value.monitoringProfile?.materials ?? [],
      locations: value.monitoringProfile?.locations ?? [],
      monitoringKeywords: value.monitoringProfile?.monitoringKeywords ?? [],
      searchLanguages: value.monitoringProfile?.searchLanguages ?? [],
    },
  };
}

function useMonitoringProfile() {
  const { customerId } = useWorkspace();
  const [data, setData] = useState<MonitoringProfile | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    setData(null); setError('');
    void apiRequest<MonitoringProfile>(`/customers/${customerId}/news-radar/monitoring-profile`)
      .then((result) => {
        if (!validMonitoringProfile(result)) throw new Error('Incompatible monitoring-profile response');
        setData(result);
      }).catch(() => setError('The monitoring profile could not be loaded. The API may still be deploying.'));
  }, [customerId, version]);
  return { customerId, data, error, reload: () => setVersion((value) => value + 1) };
}

function usePocDashboard() {
  const { customerId } = useWorkspace();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => { setData(null); setError(''); void apiRequest<Dashboard>(`/customers/${customerId}/news-radar`).then((result) => setData(compatibleDashboard(result))).catch(() => setError('The BSK intelligence dashboard could not be loaded.')); }, [customerId, version]);
  return { data, error, reload: () => setVersion((value) => value + 1) };
}

export function PocDashboardPage() {
  const { data, error } = usePocDashboard();
  const metrics = data ? [
    ['Factories', data.counts.factories, Factory], ['Countries', data.counts.countries, Globe2],
    ['Products & materials', data.counts.products + data.counts.materials, PackageSearch],
  ] as const : [];
  return <Page title={data ? `${data.customer.name} Intelligence` : 'BSK Supply Chain Intelligence'} subtitle="What needs attention now, why it matters, and where the supply chain may be affected.">
    {error && <ErrorBox text={error} />}{!data && !error && <Loading />}
    {data && <>
      <DashboardSection title="Top intelligence" description="Confirmed direct links to known BSK supply-chain data." items={data.intelligence.developments.filter((item) => item.level === 'DIRECT').slice(0, 5)} />
      <DashboardSection title="Potential / emerging impact" description="Relevant context with a plausible BSK dependency, but impact is not confirmed." items={data.intelligence.developments.filter((item) => item.level === 'POTENTIAL').slice(0, 4)} />
      <DashboardSection title="Broader developments" description="Material supply-chain developments without confirmed direct BSK exposure." items={data.intelligence.developments.filter((item) => item.level === 'BROADER').slice(0, 4)} />
      <div className="mt-7 grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Supply-chain snapshot</h2><p className="mt-1 text-xs text-muted">Compact verified graph coverage.</p></div><Link className="text-sm font-semibold text-signal" to="/supply-chain">Explore</Link></div><div className="mt-4 grid grid-cols-3 gap-3">{metrics.map(([label, value, Icon]) => <div className="rounded-lg bg-canvas p-3" key={label}><Icon className="h-4 w-4 text-signal" /><div className="mt-2 text-xl font-semibold">{value}</div><div className="mt-1 text-xs text-muted">{label}</div></div>)}</div></section>
        <section className="rounded-xl border bg-white p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Information coverage</h2><p className="mt-1 text-xs text-muted">Automatically derived from your supply chain.</p></div><Link className="text-sm font-semibold text-signal" to="/sources">View sources</Link></div><div className="mt-4 space-y-2">{data.monitoringProfile.countries.map((country) => { const count = data.sources.filter((source) => source.country === country && source.status !== 'DISABLED').length; return <div className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2 text-sm" key={country}><span>{country}</span><span className="font-semibold">{count >= 3 ? 'Strong' : count >= 1 ? 'Moderate' : 'Needs coverage'}</span></div>; })}</div></section>
      </div>
    </>}
  </Page>;
}

function DashboardSection({ title, description, items }: { title: string; description: string; items: Dashboard['intelligence']['developments'] }) {
  return <section className="mt-7"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-xs text-muted">{description}</p></div><Link className="text-sm font-semibold text-signal" to="/intelligence">View intelligence</Link></div><div className="mt-3 grid gap-3 lg:grid-cols-2">{items.map((item) => <article key={item.id} className="rounded-xl border bg-white p-4"><div className="text-xs font-semibold uppercase tracking-wide text-signal">{item.level.replace('_', ' ')}</div><h3 className="mt-2 font-semibold">{item.title}</h3><p className="mt-2 text-sm text-muted">{item.explanation}</p><p className="mt-3 text-xs text-muted">{item.sourceCount} source{item.sourceCount === 1 ? '' : 's'} reporting</p></article>)}{items.length === 0 && <Empty text="No qualifying developments in this level yet." />}</div></section>;
}

export function WatchTopicsPanel() {
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
  return <div className="space-y-6" id="watch-topics">
    {error && <ErrorBox text={error} />}{message && <p className="mb-4 rounded-lg border bg-white p-3 text-sm">{message}</p>}{!data && !error && <Loading />}
    {data && <div className="space-y-6">
      <details className="rounded-xl border bg-white p-5"><summary className="cursor-pointer font-semibold">Monitored automatically <span className="ml-2 text-xs font-normal text-muted">{data.tags.auto.filter((tag) => tag.status === 'ACTIVE').length} active</span></summary><p className="mt-2 text-xs text-muted">Derived from your supply chain. These terms cannot be deleted.</p><div className="mt-4"><TagSection title="" description="" tags={data.tags.auto} actions={(tag) => <button className="rounded-md border px-2 py-1 text-xs font-semibold" onClick={() => void updateTag(tag, { status: tag.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })}>{tag.status === 'ACTIVE' ? 'Disable' : 'Enable'}</button>} /></div></details>
      <TagSection title="Suggested for you" description="Explainable topics based on your supply-chain geography. Add only the themes you want to follow." tags={data.tags.suggested.filter((tag) => tag.status !== 'IGNORED')} actions={(tag) => <div className="flex gap-2">{tag.status !== 'ACTIVE' && <button className="rounded-md bg-signal px-2 py-1 text-xs font-semibold text-white" onClick={() => void updateTag(tag, { status: 'ACTIVE' })}>Add</button>}{tag.status !== 'IGNORED' && <button className="rounded-md border px-2 py-1 text-xs font-semibold" onClick={() => void updateTag(tag, { status: 'IGNORED' })}>Dismiss</button>}</div>} />
      <section className="rounded-xl border bg-white p-5"><div className="flex items-center gap-2"><Tags className="h-4 w-4 text-signal" /><h2 className="font-semibold">Your watch topics</h2></div><p className="mt-1 text-xs text-muted">A topic alone never enters Direct or Potential intelligence; BSK supply-chain context is still required.</p><form onSubmit={addCustom} className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_auto]"><label className="text-sm">Topic<input name="label" required minLength={2} maxLength={100} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="e.g. EU due diligence" /></label><label className="text-sm">Type<select name="category" className="mt-1 w-full rounded-lg border px-3 py-2"><option value="THEME">Theme</option><option value="MATERIAL">Material</option><option value="INDUSTRY">Industry</option><option value="LOCATION">Location</option></select></label><button className="self-end rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-white">Add topic</button></form><div className="mt-4 space-y-2">{data.tags.custom.map((tag) => <CustomTagRow key={tag.id} tag={tag} update={updateTag} remove={removeCustom} />)}{data.tags.custom.length === 0 && <Empty text="No additional watch topics." />}</div></section>
    </div>}
  </div>;
}

function TagSection({ title, description, tags, actions }: { title: string; description: string; tags: MonitoringTag[]; actions(tag: MonitoringTag): React.ReactNode }) {
  return <section className={title ? 'rounded-xl border bg-white p-5' : ''}>{title && <h2 className="font-semibold">{title}</h2>}{description && <p className="mt-1 text-xs text-muted">{description}</p>}<div className={`${title ? 'mt-4 ' : ''}grid gap-3 md:grid-cols-2`}>{tags.map((tag) => <article key={tag.id} className="flex items-start justify-between gap-3 rounded-lg border p-3"><div><div className="font-medium">{tag.label}</div><div className="mt-1 text-xs text-muted">{tag.status === 'ACTIVE' ? 'On' : tag.status === 'PENDING' ? 'Suggested' : 'Off'}</div><p className="mt-2 text-xs text-muted">{tag.reason}</p></div>{actions(tag)}</article>)}</div></section>;
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
    {data && <div className="space-y-6"><section><h2 className="font-semibold">Coverage overview</h2><p className="mt-1 text-xs text-muted">{data.sources.length} verified public sources across {data.coverage.length} regions; {data.sources.filter((source) => source.enabled).length} collectible sources are on.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.coverage.map((item) => <button key={item.region} onClick={() => setCountry(item.region)} className="rounded-xl border bg-white p-4 text-left hover:border-signal"><div className="flex items-center justify-between"><span className="font-semibold">{item.region}</span><span className="text-sm text-muted">{item.total} sources</span></div><p className="mt-2 text-xs text-muted">{Object.entries(item.categories).slice(0, 4).map(([name, count]) => `${name.replaceAll('_', ' ')} ${count}`).join(' · ')}</p><p className="mt-2 text-xs font-medium">{item.enabled} enabled · {item.languages.join(', ') || 'multiple languages'}</p></button>)}</div></section><section className="rounded-xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Source controls</h2><p className="mt-1 text-xs text-muted">Recommended sources are selected automatically; adjust individual collectible feeds only when needed.</p></div><button className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-white" onClick={() => void enableRecommended()}>Enable recommended{country ? ` for ${country}` : ''}</button></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><input aria-label="Search sources" placeholder="Search sources" value={search} onChange={(event) => setSearch(event.target.value)} className="rounded-lg border px-3 py-2 text-sm" /><select aria-label="Filter by country or region" value={country} onChange={(event) => setCountry(event.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option value="">All regions</option>{countries.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Filter by language" value={language} onChange={(event) => setLanguage(event.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option value="">All languages</option>{languages.map((value) => <option key={value}>{value}</option>)}</select><label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={recommendedOnly} onChange={(event) => setRecommendedOnly(event.target.checked)} /> Recommended only</label></div></section>{grouped.map(([region, sources]) => <section key={region} className="rounded-xl border bg-white p-5"><div className="flex items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">{region} — {sources.filter((source) => source.enabled).length} enabled sources</h2><p className="mt-1 text-xs text-muted">{Object.entries(sources.reduce<Record<string, number>>((counts, source) => ({ ...counts, [source.category]: (counts[source.category] ?? 0) + 1 }), {})).map(([name, count]) => `${name.replaceAll('_', ' ')} ${count}`).join(' · ')}</p></div></div><div className="mt-4 divide-y">{sources.map((source) => <article key={source.id} className="py-4 first:pt-0 last:pb-0"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold">{source.name}</div><div className="mt-1 text-xs text-muted">{source.category} · {source.language ?? 'Multiple'} · {source.reliability}</div></div><button className={`rounded-full border px-3 py-1 text-xs font-semibold ${source.enabled ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : ''}`} disabled={!source.collectible && !source.enabled} onClick={() => void setEnabled(source, !source.enabled)}>{source.enabled ? 'ON' : 'OFF'}</button></div><p className="mt-2 text-xs text-muted">{source.recommendation?.reason ?? 'Available in the verified public source universe.'}</p><a className="mt-2 block break-all text-xs text-signal hover:underline" href={source.url} target="_blank" rel="noreferrer">Open source</a>{!source.collectible && <p className="mt-1 text-xs text-muted">Coverage reference; automatic collection is unavailable until a supported public feed or API is verified.</p>}</article>)}</div></section>)}{grouped.length === 0 && <Empty text="No sources match the selected filters." />}</div>}
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
  return <Page title="Settings" subtitle="Language and optional Daily Brief preferences for this workspace."><section className="mb-4"><h2 className="text-lg font-semibold">Daily Brief</h2><p className="mt-1 text-sm text-muted">A concise morning summary of qualifying supply-chain intelligence.</p></section>{message && <p className="mb-4 rounded-lg border bg-white p-3 text-sm">{message}</p>}{!preference ? <Loading /> : <form onSubmit={save} className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2"><label className="text-sm">Email<input name="email" type="email" required defaultValue={preference.email} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">Delivery time<input name="deliveryTime" type="time" required defaultValue={preference.deliveryTime} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">Timezone<input name="timezone" required defaultValue={preference.timezone} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">Preferred language<select name="language" defaultValue={preference.language} className="mt-1 w-full rounded-lg border px-3 py-2">{['en','nl','de','fr','es','zh','ja','ko','vi'].map((language) => <option key={language}>{language}</option>)}</select></label><label className="flex items-center gap-2 text-sm"><input name="enabled" type="checkbox" defaultChecked={preference.enabled} disabled={!preference.emailConfigured} /> Enable Daily Brief email</label><button className="rounded-lg bg-signal px-4 py-2 text-white">Save preferences</button>{!preference.emailConfigured && <p className="sm:col-span-2 text-xs text-muted">Email delivery is unavailable until the server-side provider is configured. Preferences remain disabled by default.</p>}</form>}<section className="mt-6 rounded-xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4" /> Brief preview</h2><button type="button" onClick={() => void preview()} className="rounded-lg border px-3 py-2 text-sm font-semibold">Generate preview</button></div>{brief ? <><p className="mt-1 text-xs text-muted">Generated {new Date(brief.generatedAt).toLocaleString()}</p><div className="mt-5 space-y-6">{sections.map(([key, label]) => { const items = brief.items.filter((item) => item.section === key); return <section key={key}><h3 className="text-sm font-semibold">{label}</h3>{items.length ? <div className="mt-2 space-y-3">{items.map((item) => { const article = item.exposure.sourceArticle; const translation = article.translations.find((value) => value.targetLanguage === preference?.language); return <article key={item.id} className="rounded-lg border p-3"><a href={article.originalUrl} target="_blank" rel="noreferrer" className="font-semibold text-signal">{translation?.translatedTitle ?? article.title}</a><p className="mt-1 text-sm text-muted">{item.exposure.reason}</p><p className="mt-1 text-xs text-muted">{article.source.name} · {article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : 'Date unavailable'} · View original article</p></article>; })}</div> : <p className="mt-2 text-xs text-muted">No qualifying items.</p>}</section>; })}</div></> : <Empty text="No Daily Brief preview has been generated yet." />}</section></Page>;
}
function Page({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <div className="p-5 sm:p-8"><p className="text-sm font-medium text-signal">BSK Supply Chain Intelligence POC</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1><p className="mb-7 mt-2 max-w-3xl text-sm text-muted">{subtitle}</p>{children}</div>; }
function Loading() { return <div className="flex items-center gap-2 rounded-xl border bg-white p-6 text-sm text-muted"><RefreshCw className="h-4 w-4 animate-spin" /> Loading…</div>; }
function ErrorBox({ text }: { text: string }) { return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{text}</p>; }
function Empty({ text }: { text: string }) { return <p className="rounded-lg border border-dashed p-4 text-sm text-muted">{text}</p>; }
