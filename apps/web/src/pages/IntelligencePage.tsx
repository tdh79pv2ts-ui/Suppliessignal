import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, RefreshCw } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useWorkspace } from '../lib/workspace';
import { WatchTopicsPanel } from './PocPages';

type Level = 'DIRECT' | 'POTENTIAL' | 'BROADER';
type Development = {
  id: string; level: Level; title: string; summary: string | null; topic: string; category: string;
  country: string | null; region: string | null; publishedAt: string | null; explanation: string; sourceCount: number;
  relatedSuppliers: string[]; relatedFactories: string[]; relatedProducts: string[]; relatedMaterials: string[];
  relatedCountries: string[]; relatedLocations: string[];
  evidence: Array<{ id: string; title: string; originalTitle: string; translated: boolean; url: string; source: string; language: string | null; publishedAt: string | null }>;
};
type Intelligence = { developments: Development[]; counts: { direct: number; potential: number; broader: number } };

const tabs: Array<{ value: Level | 'ALL'; label: string; description: string }> = [
  { value: 'ALL', label: 'All', description: 'Every qualifying development' },
  { value: 'DIRECT', label: 'Direct impact', description: 'Explicit BSK entity or route match' },
  { value: 'POTENTIAL', label: 'Potential impact', description: 'Strong contextual BSK dependency' },
  { value: 'BROADER', label: 'Broader developments', description: 'Material supply-chain pathway; no direct exposure confirmed' },
];

export function IntelligencePage() {
  const { customerId } = useWorkspace();
  const [data, setData] = useState<Intelligence | null>(null);
  const [error, setError] = useState('');
  const [level, setLevel] = useState<Level | 'ALL'>('ALL');
  const [category, setCategory] = useState('');
  const [country, setCountry] = useState('');
  const [entity, setEntity] = useState('');
  useEffect(() => {
    setData(null); setError('');
    void apiRequest<Intelligence>(`/customers/${customerId}/intelligence`).then(setData).catch(() => setError('Intelligence could not be loaded.'));
  }, [customerId]);
  const options = useMemo(() => {
    const items = data?.developments ?? [];
    return {
      categories: [...new Set(items.map((item) => item.category))].sort(),
      countries: [...new Set(items.flatMap((item) => [item.country, item.region, ...item.relatedCountries].filter(Boolean) as string[]))].sort(),
      entities: [...new Set(items.flatMap((item) => [...item.relatedSuppliers, ...item.relatedFactories, ...item.relatedProducts, ...item.relatedMaterials]))].sort(),
    };
  }, [data]);
  const filtered = (data?.developments ?? []).filter((item) =>
    (level === 'ALL' || item.level === level) &&
    (!category || item.category === category) &&
    (!country || item.country === country || item.region === country || item.relatedCountries.includes(country)) &&
    (!entity || [...item.relatedSuppliers, ...item.relatedFactories, ...item.relatedProducts, ...item.relatedMaterials].includes(entity)),
  );
  return <div className="p-5 sm:p-8">
    <p className="text-sm font-medium text-signal">BSK Supply Chain Intelligence POC</p>
    <h1 className="mt-1 text-2xl font-semibold tracking-tight">Intelligence</h1>
    <p className="mt-2 max-w-3xl text-sm text-muted">What is happening, why it matters, and which evidence supports it.</p>
    {error && <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {!data && !error && <div className="mt-6 flex items-center gap-2 rounded-xl border bg-white p-6 text-sm text-muted"><RefreshCw className="h-4 w-4 animate-spin" /> Loading intelligence…</div>}
    {data && <>
      <section className="mt-7 grid gap-3 sm:grid-cols-3" aria-label="Intelligence hierarchy">
        <HierarchyCount label="Direct impact" value={data.counts.direct} tone="emerald" />
        <HierarchyCount label="Potential impact" value={data.counts.potential} tone="amber" />
        <HierarchyCount label="Broader developments" value={data.counts.broader} tone="slate" />
      </section>
      <div className="mt-6 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Intelligence level">
        {tabs.map((tab) => <button key={tab.value} role="tab" aria-selected={level === tab.value} title={tab.description} onClick={() => setLevel(tab.value)} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${level === tab.value ? 'border-signal bg-signal text-white' : 'bg-white'}`}>{tab.label}</button>)}
      </div>
      <section className="mt-4 grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-3" aria-label="Intelligence filters">
        <Filter label="Category" value={category} setValue={setCategory} options={options.categories} />
        <Filter label="Country or region" value={country} setValue={setCountry} options={options.countries} />
        <Filter label="Supply-chain entity" value={entity} setValue={setEntity} options={options.entities} />
      </section>
      <section className="mt-6 space-y-4" aria-live="polite">
        {filtered.map((item) => <DevelopmentCard key={item.id} item={item} />)}
        {filtered.length === 0 && <p className="rounded-xl border border-dashed p-5 text-sm text-muted">No developments match this view. Evidence appears here after enabled sources collect and qualify it.</p>}
      </section>
      <section className="mt-10 border-t pt-8">
        <div className="mb-5"><h2 className="text-lg font-semibold">Additional topics</h2><p className="mt-1 text-sm text-muted">SupplySignal monitors your supply chain automatically. Add only exceptional topics you also want considered.</p></div>
        <WatchTopicsPanel />
      </section>
    </>}
  </div>;
}

function HierarchyCount({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'amber' | 'slate' }) {
  const colors = { emerald: 'border-emerald-200 bg-emerald-50', amber: 'border-amber-200 bg-amber-50', slate: 'border-slate-200 bg-slate-50' };
  return <div className={`rounded-xl border p-4 ${colors[tone]}`}><div className="text-2xl font-semibold">{value}</div><div className="mt-1 text-sm font-medium">{label}</div></div>;
}

function Filter({ label, value, setValue, options }: { label: string; value: string; setValue(value: string): void; options: string[] }) {
  return <label className="text-xs font-medium text-muted">{label}<select value={value} onChange={(event) => setValue(event.target.value)} className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm text-ink"><option value="">All</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

export function DevelopmentCard({ item, compact = false }: { item: Development; compact?: boolean }) {
  const levelLabels = { DIRECT: 'Direct impact', POTENTIAL: 'Potential impact', BROADER: 'Broader development' };
  const levelColors = { DIRECT: 'text-emerald-800 bg-emerald-50 border-emerald-200', POTENTIAL: 'text-amber-800 bg-amber-50 border-amber-200', BROADER: 'text-slate-700 bg-slate-50 border-slate-200' };
  const related = [...item.relatedSuppliers, ...item.relatedFactories, ...item.relatedProducts, ...item.relatedMaterials, ...item.relatedCountries, ...item.relatedLocations];
  return <article className="rounded-xl border bg-white p-5 shadow-panel">
    <div className="flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full border px-2.5 py-1 font-semibold ${levelColors[item.level]}`}>{levelLabels[item.level]}</span><span className="text-muted">{item.topic.replaceAll('_', ' ')}</span>{item.publishedAt && <span className="text-muted">· {new Date(item.publishedAt).toLocaleDateString()}</span>}</div>
    <h2 className="mt-3 text-lg font-semibold">{item.title}</h2>
    {!compact && item.summary && <p className="mt-2 line-clamp-3 text-sm text-muted">{item.summary}</p>}
    <div className="mt-4 rounded-lg bg-canvas p-3"><div className="text-xs font-semibold uppercase tracking-wide text-ink">Why this appears</div><p className="mt-1 text-sm text-muted">{item.explanation}</p>{related.length > 0 && <p className="mt-2 text-xs text-muted"><span className="font-semibold text-ink">Related BSK data:</span> {related.join(', ')}</p>}</div>
    <details className="mt-4"><summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-signal"><ChevronDown className="h-4 w-4" />{item.sourceCount} source{item.sourceCount === 1 ? '' : 's'} reporting</summary><div className="mt-3 space-y-2">{item.evidence.map((evidence) => <a key={evidence.id} href={evidence.url} target="_blank" rel="noreferrer" className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm hover:border-signal"><span><span className="font-medium">{evidence.source}</span><span className="mt-1 block text-xs text-muted">{evidence.title}{evidence.language ? ` · ${evidence.language}` : ''}</span></span><ExternalLink className="h-4 w-4 shrink-0 text-signal" /></a>)}</div></details>
  </article>;
}

export type { Development, Intelligence };
