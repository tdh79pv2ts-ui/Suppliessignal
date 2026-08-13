import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, Boxes, Factory, Globe2, Newspaper, PackageSearch, RadioTower } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useWorkspace } from '../lib/workspace';

type PathStep = { nodeType: string; id: string; label: string; relationship?: string };
type RadarExposure = {
  id: string;
  entityType: string;
  topic: string;
  matchMethod: string;
  confidence: string;
  reason: string;
  matchedTerms: string[];
  pathSnapshot: PathStep[];
  createdAt: string;
  sourceArticle: {
    id: string;
    title: string;
    excerpt?: string | null;
    originalUrl: string;
    publishedAt?: string | null;
    discoveredAt: string;
    source: { name: string; category: string; reliability: string };
  };
};

type Dashboard = {
  counts: {
    suppliers: number; factories: number; countries: number; products: number;
    materials: number; routes: number; relevantArticlesToday: number; potentialExposures: number;
  };
  latestCollection?: { status: string; startedAt: string; completedAt?: string | null; itemsCreated: number; itemsFailed: number; source: { name: string } } | null;
  exposures: RadarExposure[];
};

const metricIcons = [Boxes, Factory, Globe2, PackageSearch, Newspaper, AlertTriangle];

function ErrorMessage({ text }: { text: string }) {
  return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{text}</p>;
}

export function NewsRadarDashboard() {
  const { customerId } = useWorkspace();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setData(null); setError('');
    void apiRequest<Dashboard>(`/customers/${customerId}/news-radar`)
      .then(setData)
      .catch(() => setError('The news radar could not be loaded.'));
  }, [customerId]);
  const metrics = data ? [
    ['Suppliers', data.counts.suppliers], ['Factories', data.counts.factories],
    ['Countries', data.counts.countries], ['Products & materials', data.counts.products + data.counts.materials],
    ['Relevant articles today', data.counts.relevantArticlesToday], ['Potential exposures', data.counts.potentialExposures],
  ] as const : [];
  return <div className="p-5 sm:p-8">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="text-sm font-medium text-signal">News intelligence radar</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Supply-chain exposure overview</h1><p className="mt-2 max-w-3xl text-sm text-muted">Continuously collected RSS and Atom coverage matched deterministically against explicit customer assets. Results are potential relevance signals, not risk scores or decisions.</p></div>
      <div className="flex items-center gap-2 text-xs text-muted"><RadioTower className="h-4 w-4" /> Default source interval: 15 minutes</div>
    </div>
    {error && <div className="mt-6"><ErrorMessage text={error} /></div>}
    {!data && !error && <p className="mt-6 text-sm text-muted">Loading customer radar…</p>}
    {data && <>
      <section className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-6" aria-label="Radar summary">
        {metrics.map(([label, value], index) => { const Icon = metricIcons[index]!; return <div key={label} className="rounded-xl border bg-panel p-4 shadow-panel"><Icon className="h-4 w-4 text-signal" /><div className="mt-3 text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-muted">{label}</div></div>; })}
      </section>
      <section className="mt-8 rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Monitoring status</h2><p className="mt-1 text-xs text-muted">Source run state is stored in PostgreSQL.</p></div>{data.latestCollection ? <span className="rounded-full border px-3 py-1 text-xs">{data.latestCollection.status}</span> : null}</div>
        {data.latestCollection ? <p className="mt-3 text-sm">{data.latestCollection.source.name} · {new Date(data.latestCollection.startedAt).toLocaleString()} · {data.latestCollection.itemsCreated} new / {data.latestCollection.itemsFailed} failed</p> : <p className="mt-3 text-sm text-muted">No collection run has been recorded. An administrator must enable at least one verified RSS or Atom source.</p>}
      </section>
      <div className="mt-8 flex items-end justify-between"><div><h2 className="font-semibold">Latest potential exposures</h2><p className="mt-1 text-xs text-muted">Every result links to its original article and an explicit supply-chain path.</p></div></div>
      {data.exposures.length === 0 ? <div className="mt-4 rounded-xl border bg-white p-6"><h3 className="font-medium">No relevant coverage matched yet</h3><p className="mt-2 text-sm text-muted">Add explicit customer assets and enable verified RSS/Atom sources. Name-only ambiguous suppliers are intentionally not matched.</p></div> : <div className="mt-4 space-y-3">{data.exposures.map((exposure) => <article key={exposure.id} className="rounded-xl border bg-white p-5"><div className="flex flex-wrap gap-2 text-[11px] font-medium uppercase tracking-wide text-muted"><span>{exposure.topic}</span><span>·</span><span>{exposure.entityType}</span><span>·</span><span>match {exposure.confidence}</span></div><Link className="mt-2 block font-semibold text-signal hover:underline" to={`/news-radar/exposures/${exposure.id}`}>{exposure.sourceArticle.title}</Link><p className="mt-2 text-sm">{exposure.reason}</p><p className="mt-2 text-xs text-muted">{exposure.sourceArticle.source.name} · {exposure.pathSnapshot.map((step) => step.label).join(' → ')}</p></article>)}</div>}
    </>}
  </div>;
}

export function NewsRadarExposureDetailPage() {
  const { customerId } = useWorkspace();
  const { id = '' } = useParams();
  const [item, setItem] = useState<RadarExposure | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setItem(null); setError('');
    void apiRequest<RadarExposure>(`/customers/${customerId}/news-radar/exposures/${id}`)
      .then(setItem).catch(() => setError('The news radar exposure could not be loaded.'));
  }, [customerId, id]);
  return <div className="p-5 sm:p-8">
    <Link className="text-sm text-signal hover:underline" to="/news-radar">← Back to news radar</Link>
    {error && <div className="mt-5"><ErrorMessage text={error} /></div>}
    {!item && !error && <p className="mt-6 text-sm text-muted">Loading exposure evidence…</p>}
    {item && <div className="mt-6 space-y-5">
      <section className="rounded-xl border bg-white p-5"><p className="text-xs font-medium uppercase tracking-wider text-signal">What happened?</p><h1 className="mt-2 text-2xl font-semibold">{item.sourceArticle.title}</h1><p className="mt-3 text-sm text-muted">{item.sourceArticle.excerpt ?? 'The source supplied metadata without an excerpt. Open the original article for the authoritative content.'}</p><div className="mt-4 flex flex-wrap gap-3 text-xs text-muted"><span>{item.sourceArticle.source.name}</span><span>{item.sourceArticle.publishedAt ? new Date(item.sourceArticle.publishedAt).toLocaleString() : 'Publication time unavailable'}</span><span>{item.sourceArticle.source.category} · {item.sourceArticle.source.reliability}</span></div><a className="mt-4 inline-block rounded-lg bg-ink px-4 py-2 text-sm text-white" href={item.sourceArticle.originalUrl} target="_blank" rel="noreferrer">Open original source</a></section>
      <section className="rounded-xl border bg-white p-5"><p className="text-xs font-medium uppercase tracking-wider text-signal">Why is this relevant?</p><h2 className="mt-2 font-semibold">Potential {item.entityType.toLowerCase()} exposure</h2><p className="mt-2 text-sm">{item.reason}</p><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full border px-3 py-1">{item.matchMethod}</span><span className="rounded-full border px-3 py-1">confidence {item.confidence}</span><span className="rounded-full border px-3 py-1">{item.topic}</span></div><ol className="mt-5 space-y-2">{item.pathSnapshot.map((step, index) => <li key={`${step.nodeType}:${step.id}`} className="flex gap-3 rounded-lg bg-canvas p-3 text-sm"><span className="font-semibold text-signal">{index + 1}</span><div><div className="font-medium">{step.nodeType}: {step.label}</div>{step.relationship && <div className="text-xs text-muted">{step.relationship}</div>}</div></li>)}</ol><p className="mt-4 text-xs text-muted">Matched terms: {item.matchedTerms.join(', ')}. This deterministic signal does not recommend or automate an action.</p></section>
    </div>}
  </div>;
}
