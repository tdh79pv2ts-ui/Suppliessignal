import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiRequest, ApiRequestError } from '../lib/api';
type EventEntity = {
  id: string;
  entityType: string;
  name: string;
  role?: string | null;
};
type EventLocation = {
  id: string;
  name: string;
  country?: string | null;
  region?: string | null;
  city?: string | null;
};
type EventItem = {
  id: string;
  title: string;
  summary: string;
  eventType: string;
  status: string;
  severity: string;
  confidence: string;
  assertionMode: string;
  startDate?: string | null;
  endDate?: string | null;
  occurredAt?: string | null;
  observedAt?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  conflictState: string;
  conflictReason?: string | null;
  supportingClaimCount: number;
  supportingArticleCount: number;
  supportingSourceCount: number;
  entities: EventEntity[];
  locations: EventLocation[];
};
type EventDetail = EventItem & {
  claimLinks: {
    attachedAt: string;
    matchDecision: string;
    matchReason: string;
    claim: {
      id: string;
      claimType: string;
      statement: string;
      confidence: string;
      evidenceText: string;
      assertionMode: string;
      occurredAt?: string | null;
      entities: { id: string; entityType: string; name: string }[];
      locations: { id: string; name: string; country?: string | null }[];
      sourceArticle: {
        id: string;
        title: string;
        originalUrl: string;
        publishedAt?: string | null;
        source: { id: string; name: string; reliability: string };
      };
      extractionRun: {
        id: string;
        provider: string;
        model: string;
        promptVersion: string;
        schemaVersion: string;
      };
    };
  }[];
};
const eventTypes = [
  '',
  'FACTORY_DISRUPTION',
  'FACTORY_CLOSURE',
  'FACTORY_EXPANSION',
  'PRODUCTION_REDUCTION',
  'PRODUCTION_INCREASE',
  'PORT_DISRUPTION',
  'PORT_CLOSURE',
  'PORT_CONGESTION',
  'SHIPPING_DISRUPTION',
  'LOGISTICS_DISRUPTION',
  'STRIKE',
  'LABOR_DISRUPTION',
  'NATURAL_HAZARD',
  'WEATHER_DISRUPTION',
  'FIRE',
  'EXPLOSION',
  'ACCIDENT',
  'POWER_OUTAGE',
  'CYBER_INCIDENT',
  'REGULATORY_CHANGE',
  'TRADE_RESTRICTION',
  'SANCTION',
  'TARIFF_CHANGE',
  'EXPORT_RESTRICTION',
  'IMPORT_RESTRICTION',
  'SUPPLIER_DISRUPTION',
  'MATERIAL_SHORTAGE',
  'CAPACITY_CHANGE',
  'OTHER',
];
const message = (error: unknown) =>
  error instanceof ApiRequestError
    ? `${error.code}: ${error.message}`
    : 'Unexpected error';
export function EventsPage() {
  const [items, setItems] = useState<EventItem[]>([]);
  const [filters, setFilters] = useState({
    eventType: '',
    status: '',
    severity: '',
    entity: '',
    country: '',
  });
  const [error, setError] = useState('');
  useEffect(() => {
    const query = new URLSearchParams(
      Object.entries(filters).filter(([, value]) => value),
    );
    void apiRequest<{ items: EventItem[] }>(`/events?${query}`)
      .then((result) => setItems(result.items))
      .catch((error) => setError(message(error)));
  }, [filters]);
  return (
    <Page title="Event intelligence">
      <p className="mb-5 text-sm text-muted">
        Global, deterministic Events with auditable Claim provenance. Customer
        exposure is not calculated in this phase.
      </p>
      {error && <Error text={error} />}
      <div className="mb-5 grid gap-2 rounded-xl border bg-white p-4 sm:grid-cols-5">
        <select
          className="rounded border px-2 py-2"
          value={filters.eventType}
          onChange={(e) =>
            setFilters({ ...filters, eventType: e.target.value })
          }
        >
          {eventTypes.map((value) => (
            <option key={value} value={value}>
              {value || 'All event types'}
            </option>
          ))}
        </select>
        <select
          className="rounded border px-2"
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="">All statuses</option>
          {['DETECTED', 'ACTIVE', 'RESOLVED', 'CANCELLED'].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          className="rounded border px-2"
          value={filters.severity}
          onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
        >
          <option value="">All severities</option>
          {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <input
          className="rounded border px-3"
          placeholder="Entity"
          value={filters.entity}
          onChange={(e) => setFilters({ ...filters, entity: e.target.value })}
        />
        <input
          className="rounded border px-3"
          placeholder="Country"
          value={filters.country}
          onChange={(e) => setFilters({ ...filters, country: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        {items.map((event) => (
          <Link
            className="block rounded-xl border bg-white p-4"
            to={`/events/${event.id}`}
            key={event.id}
          >
            <div className="flex flex-wrap justify-between gap-2">
              <b>{event.title}</b>
              <span className="text-sm">
                {event.severity} · {event.status}
              </span>
            </div>
            <p className="mt-1 text-sm">
              {event.eventType} · confidence {event.confidence}
            </p>
            <p className="text-sm text-muted">
              {event.locations[0]?.name ?? 'Location unspecified'} · first seen{' '}
              {new Date(event.firstSeenAt).toLocaleDateString()} ·{' '}
              {event.supportingSourceCount} source(s)
            </p>
          </Link>
        ))}
      </div>
    </Page>
  );
}
export function EventDetailPage() {
  const { eventId = '' } = useParams();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void apiRequest<EventDetail>(`/events/${eventId}`)
      .then(setEvent)
      .catch((error) => setError(message(error)));
  }, [eventId]);
  return (
    <Page title={event?.title ?? 'Event detail'}>
      {error && <Error text={error} />}{' '}
      {event && (
        <div className="space-y-5">
          <section className="rounded-xl border bg-white p-5">
            <p>{event.summary}</p>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <span>{event.eventType}</span>
              <span>
                {event.status} · {event.severity}
              </span>
              <span>confidence {event.confidence}</span>
              <span>{event.assertionMode}</span>
              <span>start {event.startDate ?? 'unknown'}</span>
              <span>end {event.endDate ?? 'unknown'}</span>
            </div>
          </section>
          <section className="grid gap-4 sm:grid-cols-3">
            <Card title="Corroboration">
              <p>{event.supportingClaimCount} claims</p>
              <p>{event.supportingArticleCount} articles</p>
              <p>{event.supportingSourceCount} sources</p>
            </Card>
            <Card title="Entities">
              {event.entities.map((entity) => (
                <p key={entity.id}>
                  {entity.entityType}: {entity.name}
                </p>
              ))}
            </Card>
            <Card title="Locations">
              {event.locations.map((location) => (
                <p key={location.id}>
                  {[location.name, location.region, location.country]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              ))}
            </Card>
          </section>
          {event.conflictState === 'DETECTED' && (
            <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
              <b>Conflicting evidence detected</b>
              <p>{event.conflictReason}</p>
            </section>
          )}
          <section>
            <h2 className="mb-3 text-lg font-semibold">
              Supporting evidence and provenance
            </h2>
            <div className="space-y-3">
              {event.claimLinks.map((link) => (
                <article
                  className="rounded-xl border bg-white p-5"
                  key={`${event.id}-${link.claim.id}`}
                >
                  <p className="text-xs text-muted">
                    {link.matchDecision}: {link.matchReason}
                  </p>
                  <p className="mt-2 font-medium">{link.claim.statement}</p>
                  <blockquote className="my-3 border-l-4 pl-4">
                    {link.claim.evidenceText}
                  </blockquote>
                  <p className="text-sm">
                    Claim confidence {link.claim.confidence} ·{' '}
                    {link.claim.assertionMode}
                  </p>
                  <a
                    className="mt-2 block text-signal underline"
                    href={link.claim.sourceArticle.originalUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.claim.sourceArticle.title} —{' '}
                    {link.claim.sourceArticle.source.name}
                  </a>
                  <p className="mt-2 text-xs text-muted">
                    Extraction {link.claim.extractionRun.provider}/
                    {link.claim.extractionRun.model} · prompt{' '}
                    {link.claim.extractionRun.promptVersion} · schema{' '}
                    {link.claim.extractionRun.schemaVersion}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </Page>
  );
}
function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <h2 className="mb-2 font-semibold">{title}</h2>
      {children}
    </div>
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
