import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ExternalLink, RefreshCw } from 'lucide-react';
import { apiRequest, ApiRequestError } from '../lib/api';
import { useWorkspace } from '../lib/workspace';

type BriefItem = {
  id: string;
  section: 'TOP_DEVELOPMENTS' | 'POTENTIAL_EXPOSURES' | 'WATCHLIST';
  exposure: {
    id: string; topic: string; entityType: string; reason: string; confidence: string;
    sourceArticle: { title: string; excerpt?: string | null; originalUrl: string; publishedAt?: string | null; source: { name: string } };
  };
};
type Brief = {
  id: string; briefDate: string; generatedAt: string; graphRevision: string;
  supplyChainSnapshot: Record<string, number>;
  customer: { name: string };
  items: BriefItem[];
};
type Preference = { enabled: boolean; deliveryTime: string; timezone: string; email: string };

const errorText = (error: unknown) => error instanceof ApiRequestError ? `${error.code}: ${error.message}` : 'The request could not be completed.';

export function DailyBriefPage() {
  const { customerId } = useWorkspace();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = () => {
    setLoading(true); setError('');
    void apiRequest<Brief | null>(`/customers/${customerId}/daily-brief`).then(setBrief).catch((reason) => setError(errorText(reason))).finally(() => setLoading(false));
  };
  useEffect(load, [customerId]);
  async function generate() {
    try {
      const value = await apiRequest<Brief>(`/customers/${customerId}/daily-brief/generate`, { method: 'POST', body: '{}' });
      setBrief(value); setError('');
    } catch (reason) { setError(errorText(reason)); }
  }
  const sections = [
    ['TOP_DEVELOPMENTS', 'Top developments'],
    ['POTENTIAL_EXPOSURES', 'Potential exposures'],
    ['WATCHLIST', 'Watchlist'],
  ] as const;
  return <div className="p-5 sm:p-8">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-signal">Daily intelligence</p><h1 className="mt-1 text-2xl font-semibold">Supply Chain Brief</h1><p className="mt-2 max-w-2xl text-sm text-muted">Evidence-linked developments matched to explicit customer assets. No recommendation, risk score, or automated decision is generated.</p></div><button onClick={() => void generate()} className="focus-ring flex items-center gap-2 rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-white"><RefreshCw className="h-4 w-4" /> Generate latest brief</button></div>
    {error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {loading ? <p className="mt-6 text-sm text-muted">Loading daily brief…</p> : !brief ? <div className="mt-6 rounded-xl border border-dashed bg-white p-8 text-center"><CalendarDays className="mx-auto h-6 w-6 text-signal" /><h2 className="mt-3 font-semibold">No brief generated yet</h2><p className="mt-2 text-sm text-muted">Generate the first brief after the radar has matched relevant articles.</p></div> : <>
      <div className="mt-6 rounded-xl border bg-ink p-5 text-white"><div className="text-xs uppercase tracking-wider text-white/60">{brief.customer.name} · {new Date(brief.briefDate).toLocaleDateString()}</div><div className="mt-2 text-xl font-semibold">{brief.items.length} evidence-linked developments</div><div className="mt-2 text-xs text-white/60">Generated {new Date(brief.generatedAt).toLocaleString()} · graph revision {brief.graphRevision}</div></div>
      {sections.map(([key, label]) => { const items = brief.items.filter((item) => item.section === key); return <section className="mt-7" key={key}><h2 className="font-semibold">{label}</h2>{items.length ? <div className="mt-3 space-y-3">{items.map((item) => <article key={item.id} className="rounded-xl border bg-white p-5"><div className="text-[11px] font-medium uppercase tracking-wide text-muted">{item.exposure.topic} · {item.exposure.entityType} · match {item.exposure.confidence}</div><Link to={`/news-radar/exposures/${item.exposure.id}`} className="mt-2 block font-semibold text-signal hover:underline">{item.exposure.sourceArticle.title}</Link><p className="mt-2 text-sm">{item.exposure.reason}</p><div className="mt-3 flex items-center gap-3 text-xs text-muted"><span>{item.exposure.sourceArticle.source.name}</span><a className="inline-flex items-center gap-1 hover:text-signal" href={item.exposure.sourceArticle.originalUrl} target="_blank" rel="noreferrer">Original source <ExternalLink className="h-3 w-3" /></a></div></article>)}</div> : <p className="mt-3 rounded-xl border bg-white p-5 text-sm text-muted">No items in this section.</p>}</section>; })}
      <section className="mt-7 rounded-xl border bg-white p-5"><h2 className="font-semibold">Supply chain snapshot</h2><p className="mt-1 text-xs text-muted">Current factual graph captured when this brief was generated; change history is not inferred.</p><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-6">{Object.entries(brief.supplyChainSnapshot).map(([label, value]) => <div key={label}><div className="text-xl font-semibold">{value}</div><div className="text-xs capitalize text-muted">{label}</div></div>)}</div></section>
    </>}
  </div>;
}

export function NewsletterSettingsPage() {
  const { customerId } = useWorkspace();
  const [preference, setPreference] = useState<Preference | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { setPreference(null); void apiRequest<Preference>(`/customers/${customerId}/newsletter-preference`).then(setPreference).catch((reason) => setError(errorText(reason))); }, [customerId]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const payload = { enabled: data.get('enabled') === 'on', deliveryTime: String(data.get('deliveryTime')), timezone: String(data.get('timezone')), email: String(data.get('email')) };
    try { setPreference(await apiRequest<Preference>(`/customers/${customerId}/newsletter-preference`, { method: 'PUT', body: JSON.stringify(payload) })); setMessage('Preferences saved.'); setError(''); } catch (reason) { setError(errorText(reason)); setMessage(''); }
  }
  return <div className="p-5 sm:p-8"><p className="text-sm font-medium text-signal">Settings</p><h1 className="mt-1 text-2xl font-semibold">Daily brief preferences</h1><p className="mt-2 max-w-2xl text-sm text-muted">Automatic brief generation is optional and disabled by default. The POC stores the delivery address and schedule; outbound email delivery requires a separately configured mail provider.</p>{error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}{message && <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p>}{preference ? <form onSubmit={save} className="mt-6 max-w-xl space-y-4 rounded-xl border bg-white p-5"><label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" name="enabled" defaultChecked={preference.enabled} /> Generate a scheduled daily brief</label><label className="block text-xs font-semibold">Delivery time<input required type="time" name="deliveryTime" defaultValue={preference.deliveryTime} className="focus-ring mt-1 block w-full rounded-lg border px-3 py-2 text-sm font-normal" /></label><label className="block text-xs font-semibold">IANA timezone<input required name="timezone" defaultValue={preference.timezone} className="focus-ring mt-1 block w-full rounded-lg border px-3 py-2 text-sm font-normal" /></label><label className="block text-xs font-semibold">Email<input required type="email" name="email" defaultValue={preference.email} className="focus-ring mt-1 block w-full rounded-lg border px-3 py-2 text-sm font-normal" /></label><button className="focus-ring rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-white">Save preferences</button></form> : <p className="mt-6 text-sm text-muted">Loading preferences…</p>}</div>;
}
