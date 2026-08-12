import { ArrowDown, Boxes, Clock3, DatabaseZap } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DashboardMetric } from '@suppliesignal/shared';
import { EmptyState } from '../components/EmptyState';

const metrics: DashboardMetric[] = ['Critical', 'High', 'Medium', 'Early signals', 'Resolved'].map((label) => ({ label: label as DashboardMetric['label'], value: null, state: 'unconfigured' }));

export function DashboardPage() {
  return (
    <div className="p-5 sm:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm font-medium text-signal">Intelligence overview</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Supply-chain signals</h1><p className="mt-2 text-sm text-muted">Prioritized by customer exposure, evidence, and actionability.</p></div>
        <div className="flex items-center gap-2 text-xs text-muted"><Clock3 className="h-4 w-4" /> Awaiting source configuration</div>
      </div>
      <section className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Intelligence summary">
        {metrics.map((metric) => <div key={metric.label} className="rounded-xl border bg-panel p-4 shadow-panel"><div className="text-xs font-medium text-muted">{metric.label}</div><div className="mt-3 text-2xl font-semibold">—</div><div className="mt-2 text-[11px] uppercase tracking-wide text-muted">Not configured</div></div>)}
      </section>
      <div className="mt-8 flex items-center justify-between"><div><h2 className="font-semibold">Priority feed</h2><p className="mt-1 text-xs text-muted">Customer-specific events will appear here after ingestion is configured.</p></div><button disabled className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs text-muted disabled:cursor-not-allowed"><ArrowDown className="h-3.5 w-3.5" /> Priority</button></div>
      <div className="mt-4"><EmptyState title="Intelligence pipeline not configured" description="The secure foundation and supply-chain graph are available. Sources, events, scoring, and exposure matching require later approved phases." /></div>
      <Link to="/supply-chain" className="focus-ring mt-4 flex items-start gap-3 rounded-xl border bg-white p-4 text-sm hover:border-signal"><Boxes className="mt-0.5 h-4 w-4 shrink-0 text-signal" /><div><span className="font-medium">Supply Chain available.</span> Manage customer assets and explicit operational relationships.</div></Link>
      <div className="mt-4 flex items-start gap-3 rounded-xl border bg-emerald-50/50 p-4 text-sm"><DatabaseZap className="mt-0.5 h-4 w-4 shrink-0 text-signal" /><div><span className="font-medium">Foundation ready.</span> Connect PostgreSQL and Supabase using the documented environment variables before signing in.</div></div>
    </div>
  );
}
