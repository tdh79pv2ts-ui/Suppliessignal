import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Link2,
  Plus,
  RefreshCw,
  Save,
  Unlink,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { apiRequest, ApiRequestError } from '../lib/api';
import { useWorkspace } from '../lib/workspace';

type Row = {
  id: string;
  name: string;
  active: boolean;
  [key: string]: unknown;
};
type Graph = {
  suppliers: Row[];
  factories: Row[];
  products: Row[];
  materials: Row[];
  routes: Row[];
  ports: Row[];
  relationships: Record<string, Row[]>;
};
type Field = {
  key: string;
  label: string;
  required?: boolean;
  kind?: 'select' | 'supplier' | 'route' | 'boolean' | 'number';
  options?: string[];
};
const criticalities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const configs = {
  suppliers: {
    title: 'Suppliers',
    singular: 'Supplier',
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'legalName', label: 'Legal name' },
      { key: 'country', label: 'Country', required: true },
      { key: 'city', label: 'City' },
      { key: 'supplierType', label: 'Supplier type' },
      {
        key: 'tier',
        label: 'Tier',
        kind: 'select',
        options: ['TIER_1', 'TIER_2', 'TIER_3', 'OTHER'],
        required: true,
      },
      {
        key: 'criticality',
        label: 'Criticality',
        kind: 'select',
        options: criticalities,
        required: true,
      },
      { key: 'latitude', label: 'Latitude', kind: 'number' },
      { key: 'longitude', label: 'Longitude', kind: 'number' },
    ],
  },
  factories: {
    title: 'Factories',
    singular: 'Factory',
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'supplierId', label: 'Supplier', kind: 'supplier' },
      { key: 'country', label: 'Country', required: true },
      { key: 'city', label: 'City' },
      { key: 'address', label: 'Address' },
      { key: 'productionType', label: 'Production type' },
      {
        key: 'criticality',
        label: 'Criticality',
        kind: 'select',
        options: criticalities,
        required: true,
      },
      { key: 'latitude', label: 'Latitude', kind: 'number' },
      { key: 'longitude', label: 'Longitude', kind: 'number' },
    ],
  },
  products: {
    title: 'Products',
    singular: 'Product',
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'sku', label: 'SKU' },
      { key: 'category', label: 'Category' },
      { key: 'description', label: 'Description' },
      {
        key: 'criticality',
        label: 'Criticality',
        kind: 'select',
        options: criticalities,
        required: true,
      },
    ],
  },
  materials: {
    title: 'Materials',
    singular: 'Material',
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'category', label: 'Category' },
      { key: 'commodity', label: 'Commodity' },
      {
        key: 'criticality',
        label: 'Criticality',
        kind: 'select',
        options: criticalities,
        required: true,
      },
      { key: 'substitutable', label: 'Substitutable', kind: 'boolean' },
    ],
  },
  routes: {
    title: 'Routes',
    singular: 'Route',
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'originLabel', label: 'Origin', required: true },
      { key: 'destinationLabel', label: 'Destination', required: true },
      {
        key: 'transportMode',
        label: 'Transport mode',
        kind: 'select',
        options: ['ROAD', 'RAIL', 'SEA', 'AIR', 'MULTIMODAL', 'OTHER'],
        required: true,
      },
      {
        key: 'criticality',
        label: 'Criticality',
        kind: 'select',
        options: criticalities,
        required: true,
      },
    ],
  },
} satisfies Record<
  string,
  { title: string; singular: string; fields: Field[] }
>;
export type EntityKind = keyof typeof configs;

const errorText = (error: unknown) =>
  error instanceof ApiRequestError
    ? `${error.code}: ${error.message}`
    : 'An unexpected error occurred';
function payloadFromForm(form: HTMLFormElement, fields: Field[]) {
  const data = new FormData(form);
  return Object.fromEntries(
    fields.map((field) => {
      const value = data.get(field.key);
      if (field.kind === 'boolean') return [field.key, value === 'on'];
      if (field.kind === 'number')
        return [field.key, value === '' ? null : Number(value)];
      return [field.key, value === '' ? null : value];
    }),
  );
}

export function SupplyChainOverview() {
  const { customerId } = useWorkspace();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void apiRequest<Graph>(`/customers/${customerId}/supply-chain`)
      .then(setGraph)
      .catch((reason: unknown) => setError(errorText(reason)));
  }, [customerId]);
  const metrics = graph
    ? [
        ['Suppliers', graph.suppliers.length],
        ['Factories', graph.factories.length],
        ['Products', graph.products.length],
        ['Materials', graph.materials.length],
        ['Routes', graph.routes.length],
        ['Relevant ports', graph.ports.length],
      ]
    : [];
  return (
    <Page
      title="Supply chain"
      subtitle="Explicit customer master data and inspectable operational relationships."
    >
      {error ? (
        <ErrorBox text={error} />
      ) : !graph ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {metrics.map(([label, value]) => (
              <div
                className="rounded-xl border bg-white p-4 shadow-panel"
                key={label}
              >
                <div className="text-xs text-muted">{label}</div>
                <div className="mt-2 text-2xl font-semibold">{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-7 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(configs).map(([kind, config]) => (
              <Link
                className="focus-ring rounded-xl border bg-white p-5 hover:border-signal"
                to={`/supply-chain/${kind}`}
                key={kind}
              >
                <div className="font-semibold">{config.title}</div>
                <p className="mt-2 text-sm text-muted">
                  Manage records and explicit relationships.
                </p>
              </Link>
            ))}
            <Link
              className="focus-ring rounded-xl border bg-white p-5 hover:border-signal"
              to="/supply-chain/ports"
            >
              <div className="font-semibold">Ports</div>
              <p className="mt-2 text-sm text-muted">
                Global port reference data used by routes.
              </p>
            </Link>
          </div>
        </>
      )}
    </Page>
  );
}

export function EntityListPage({ kind }: { kind: EntityKind }) {
  const config = configs[kind];
  const { customerId } = useWorkspace();
  const [items, setItems] = useState<Row[]>([]);
  const [suppliers, setSuppliers] = useState<Row[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({
    active: 'true',
  });
  const load = (nextPage = page, nextFilters = filters) => {
    const query = new URLSearchParams({
      page: String(nextPage),
      pageSize: '50',
      ...Object.fromEntries(
        Object.entries(nextFilters).filter(([, value]) => value),
      ),
    });
    setLoading(true);
    void apiRequest<{ items: Row[]; pagination: { totalPages: number } }>(
      `/customers/${customerId}/${kind}?${query}`,
    )
      .then((result) => {
        setItems(result.items);
        setTotalPages(Math.max(1, result.pagination.totalPages));
        setError(null);
      })
      .catch((reason: unknown) => setError(errorText(reason)))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    setPage(1);
    load(1, { active: 'true' });
    if (kind === 'factories')
      void apiRequest<{ items: Row[] }>(
        `/customers/${customerId}/suppliers?active=all&pageSize=100`,
      )
        .then((result) => setSuppliers(result.items))
        .catch((reason: unknown) => setError(errorText(reason)));
  }, [customerId, kind]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await apiRequest(`/customers/${customerId}/${kind}`, {
        method: 'POST',
        body: JSON.stringify(
          payloadFromForm(event.currentTarget, config.fields),
        ),
      });
      event.currentTarget.reset();
      setShowForm(false);
      load();
    } catch (reason) {
      setError(errorText(reason));
    }
  }
  async function archive(id: string) {
    if (!window.confirm(`Archive this ${config.singular.toLowerCase()}?`))
      return;
    try {
      await apiRequest(`/customers/${customerId}/${kind}/${id}/archive`, {
        method: 'POST',
      });
      load();
    } catch (reason) {
      setError(errorText(reason));
    }
  }
  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = Object.fromEntries(
      [...data.entries()].map(([key, value]) => [key, String(value)]),
    );
    setFilters(next);
    setPage(1);
    load(1, next);
  }
  function changePage(next: number) {
    setPage(next);
    load(next);
  }
  const scopedFilter =
    kind === 'suppliers' || kind === 'factories'
      ? { key: 'country', label: 'Country' }
      : kind === 'products' || kind === 'materials'
        ? { key: 'category', label: 'Category' }
        : null;
  return (
    <Page
      title={config.title}
      subtitle={`Customer-scoped ${config.title.toLowerCase()} with active records shown by default.`}
      action={
        <button
          className="focus-ring flex items-center gap-2 rounded-lg bg-signal px-3 py-2 text-sm font-semibold text-white"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus className="h-4 w-4" /> Add {config.singular.toLowerCase()}
        </button>
      }
    >
      {error && <ErrorBox text={error} />}
      {showForm && (
        <EntityForm
          fields={config.fields}
          supplierOptions={suppliers}
          onSubmit={create}
          submitLabel={`Create ${config.singular.toLowerCase()}`}
        />
      )}
      <form
        className="mb-4 grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
        onSubmit={applyFilters}
      >
        <label className="text-xs font-semibold">
          Search
          <input
            className="focus-ring mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
            name="search"
            defaultValue={filters.search}
          />
        </label>
        <label className="text-xs font-semibold">
          Status
          <select
            className="focus-ring mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
            name="active"
            defaultValue={filters.active}
          >
            <option value="true">Active</option>
            <option value="false">Archived</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="text-xs font-semibold">
          Criticality
          <select
            className="focus-ring mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
            name="criticality"
            defaultValue={filters.criticality}
          >
            <option value="">All</option>
            {criticalities.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        {scopedFilter && (
          <label className="text-xs font-semibold">
            {scopedFilter.label}
            <input
              className="focus-ring mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
              name={scopedFilter.key}
              defaultValue={filters[scopedFilter.key]}
            />
          </label>
        )}
        {kind === 'suppliers' && (
          <label className="text-xs font-semibold">
            Tier
            <select
              className="focus-ring mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
              name="tier"
              defaultValue={filters.tier}
            >
              <option value="">All</option>
              {['TIER_1', 'TIER_2', 'TIER_3', 'OTHER'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        )}
        {kind === 'factories' && (
          <label className="text-xs font-semibold">
            Supplier
            <select
              className="focus-ring mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
              name="supplierId"
              defaultValue={filters.supplierId}
            >
              <option value="">All suppliers</option>
              {suppliers.map((supplier) => (
                <option value={supplier.id} key={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === 'routes' && (
          <label className="text-xs font-semibold">
            Transport mode
            <select
              className="focus-ring mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
              name="transportMode"
              defaultValue={filters.transportMode}
            >
              <option value="">All</option>
              {['ROAD', 'RAIL', 'SEA', 'AIR', 'MULTIMODAL', 'OTHER'].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </label>
        )}
        <button className="focus-ring self-end rounded-lg border px-3 py-2 text-sm font-semibold">
          Apply filters
        </button>
      </form>
      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center">
          <p>No {config.title.toLowerCase()} match these filters.</p>
          <button
            className="mt-4 text-sm font-semibold text-signal"
            onClick={() => setShowForm(true)}
          >
            Add {config.singular.toLowerCase()}
          </button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-canvas text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Criticality</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr className="border-t" key={item.id}>
                    <td className="px-4 py-3 font-medium">
                      <Link
                        className="text-signal hover:underline"
                        to={`/supply-chain/${kind}/${item.id}`}
                      >
                        {item.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {String(item.criticality ?? '—')}
                    </td>
                    <td className="px-4 py-3">
                      {item.active ? 'Active' : 'Archived'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        disabled={!item.active}
                        className="focus-ring inline-flex items-center gap-1 text-xs text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                        onClick={() => void archive(item.id)}
                      >
                        <Archive className="h-3.5 w-3.5" /> Archive
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              disabled={page === 1}
              className="rounded-lg border px-3 py-2 disabled:opacity-40"
              onClick={() => changePage(page - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              className="rounded-lg border px-3 py-2 disabled:opacity-40"
              onClick={() => changePage(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </Page>
  );
}

export function EntityDetailPage({ kind }: { kind: EntityKind }) {
  const { id = '' } = useParams();
  const { customerId } = useWorkspace();
  const config = configs[kind];
  const [item, setItem] = useState<Row | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    void Promise.all([
      apiRequest<Row>(`/customers/${customerId}/${kind}/${id}`),
      apiRequest<Graph>(`/customers/${customerId}/supply-chain`),
    ])
      .then(([record, graphData]) => {
        setItem(record);
        setGraph(graphData);
        setError(null);
      })
      .catch((reason: unknown) => setError(errorText(reason)));
  useEffect(load, [customerId, id, kind]);
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await apiRequest(`/customers/${customerId}/${kind}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(
          payloadFromForm(event.currentTarget, config.fields),
        ),
      });
      load();
    } catch (reason) {
      setError(errorText(reason));
    }
  }
  return (
    <Page
      title={item?.name ?? config.singular}
      subtitle="Database-backed details and explicit relationships."
    >
      <Link
        className="mb-5 inline-flex items-center gap-2 text-sm text-signal"
        to={`/supply-chain/${kind}`}
      >
        <ArrowLeft className="h-4 w-4" /> Back to {config.title.toLowerCase()}
      </Link>
      {error && <ErrorBox text={error} />}
      {!item || !graph ? (
        <Loading />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
          <EntityForm
            fields={config.fields}
            initial={item}
            supplierOptions={graph.suppliers}
            onSubmit={update}
            submitLabel="Save changes"
          />
          <RelationshipPanel
            kind={kind}
            item={item}
            graph={graph}
            customerId={customerId}
            reload={load}
            setError={setError}
          />
        </div>
      )}
    </Page>
  );
}

export function PortsPage() {
  const { user, customerId } = useWorkspace();
  const [items, setItems] = useState<Row[]>([]);
  const [routes, setRoutes] = useState<Row[]>([]);
  const [editing, setEditing] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fields: Field[] = [
    { key: 'name', label: 'Name', required: true },
    { key: 'portCode', label: 'Port code' },
    { key: 'country', label: 'Country', required: true },
    { key: 'city', label: 'City' },
    { key: 'latitude', label: 'Latitude', kind: 'number' },
    { key: 'longitude', label: 'Longitude', kind: 'number' },
  ];
  const createFields: Field[] = [...fields, { key: 'routeId', label: 'Customer route', kind: 'route', required: true }, { key: 'sequence', label: 'Route sequence', kind: 'number', required: true }];
  const load = () =>
    void Promise.all([
      apiRequest<{ items: Row[] }>(`/customers/${customerId}/ports?active=all&pageSize=100`),
      apiRequest<{ items: Row[] }>(`/customers/${customerId}/routes?active=true&pageSize=100`),
    ])
      .then(([data, routeData]) => {
        setItems(data.items);
        setRoutes(routeData.items);
        setError(null);
      })
      .catch((reason: unknown) => setError(errorText(reason)));
  useEffect(load, [customerId]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await apiRequest(editing ? `/ports/${editing.id}` : `/customers/${customerId}/ports`, {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payloadFromForm(event.currentTarget, editing ? fields : createFields)),
      });
      event.currentTarget.reset();
      setEditing(null);
      load();
    } catch (reason) {
      setError(errorText(reason));
    }
  }
  async function archive(id: string) {
    if (!window.confirm('Archive this port?')) return;
    try {
      await apiRequest(`/ports/${id}/archive`, { method: 'POST' });
      load();
    } catch (reason) {
      setError(errorText(reason));
    }
  }
  return (
    <Page
      title="Ports"
      subtitle="Route-linked port references. New ports are created with an explicit customer route relationship."
    >
      {error && <ErrorBox text={error} />}
      {routes.length > 0 && (
        <EntityForm
          key={editing?.id ?? 'new'}
          fields={editing ? fields : createFields}
          routeOptions={routes}
          {...(editing ? { initial: editing } : {})}
          onSubmit={save}
          submitLabel={editing ? 'Save port' : 'Create port'}
        />
      )}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {items.map((port) => {
          const routes = relationItems(port.routePorts, 'route');
          return (
            <div className="rounded-xl border bg-white p-4" key={port.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{port.name}</div>
                  <div className="mt-1 text-sm text-muted">
                    {String(port.portCode ?? 'No code')} ·{' '}
                    {String(port.city ?? '')}, {String(port.country)}
                  </div>
                  <div className="mt-2 text-xs text-muted">
                    {String(port.latitude ?? '—')},{' '}
                    {String(port.longitude ?? '—')} ·{' '}
                    {port.active ? 'Active' : 'Archived'}
                  </div>
                  <div className="mt-3 text-xs">
                    <span className="font-semibold">Accessible routes:</span>{' '}
                    <span className="text-muted">
                      {routes.length
                        ? routes.map((route) => route.name).join(', ')
                        : 'None'}
                    </span>
                  </div>
                </div>
                {user.role === 'ADMIN' && (
                  <div className="flex gap-2">
                    <button
                      className="text-xs font-semibold text-signal"
                      onClick={() => setEditing(port)}
                    >
                      Edit
                    </button>
                    <button
                      className="text-red-700"
                      aria-label={`Archive ${port.name}`}
                      onClick={() => void archive(port.id)}
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Page>
  );
}

function RelationshipPanel({
  kind,
  item,
  graph,
  customerId,
  reload,
  setError,
}: {
  kind: EntityKind;
  item: Row;
  graph: Graph;
  customerId: string;
  reload: () => void;
  setError: (value: string | null) => void;
}) {
  const relations = useMemo(
    () =>
      kind === 'suppliers'
        ? [
            {
              label: 'Products',
              targets: graph.products,
              path: 'products',
              current: relationItems(item.supplierProducts, 'product'),
            },
          ]
        : kind === 'factories'
          ? [
              {
                label: 'Products produced',
                targets: graph.products,
                path: 'products',
                current: relationItems(item.factoryProducts, 'product'),
              },
            ]
          : kind === 'products'
            ? [
                {
                  label: 'Materials',
                  targets: graph.materials,
                  path: 'materials',
                  current: relationItems(item.productMaterials, 'material'),
                },
              ]
            : kind === 'routes'
              ? [
                  {
                    label: 'Suppliers',
                    targets: graph.suppliers,
                    path: 'suppliers',
                    current: relationItems(item.routeSuppliers, 'supplier'),
                  },
                  {
                    label: 'Factories',
                    targets: graph.factories,
                    path: 'factories',
                    current: relationItems(item.routeFactories, 'factory'),
                  },
                  {
                    label: 'Ordered ports',
                    targets: graph.ports,
                    path: 'ports',
                    current: relationItems(item.routePorts, 'port'),
                  },
                ]
              : [],
    [graph, item, kind],
  );
  async function attach(path: string, targetId: string, count: number) {
    try {
      await apiRequest(`/customers/${customerId}/${kind}/${item.id}/${path}`, {
        method: 'POST',
        body: JSON.stringify(
          path === 'ports'
            ? { portId: targetId, sequence: count + 1 }
            : { targetId },
        ),
      });
      reload();
    } catch (reason) {
      setError(errorText(reason));
    }
  }
  async function detach(path: string, targetId: string) {
    try {
      await apiRequest(
        `/customers/${customerId}/${kind}/${item.id}/${path}/${targetId}`,
        { method: 'DELETE' },
      );
      reload();
    } catch (reason) {
      setError(errorText(reason));
    }
  }
  async function reorder(
    path: string,
    current: Row[],
    index: number,
    direction: -1 | 1,
  ) {
    const next = [...current];
    const destination = index + direction;
    if (destination < 0 || destination >= next.length) return;
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    try {
      await apiRequest(`/customers/${customerId}/${kind}/${item.id}/${path}`, {
        method: 'PUT',
        body: JSON.stringify({
          ports: next.map((port, portIndex) => ({
            portId: port.id,
            sequence: portIndex + 1,
          })),
        }),
      });
      reload();
    } catch (reason) {
      setError(errorText(reason));
    }
  }
  const readOnly =
    kind === 'products'
      ? [
          {
            label: 'Suppliers',
            items: relationItems(item.supplierProducts, 'supplier'),
          },
          {
            label: 'Factories',
            items: relationItems(item.factoryProducts, 'factory'),
          },
        ]
      : kind === 'materials'
        ? [
            {
              label: 'Products using this material',
              items: relationItems(item.productMaterials, 'product'),
            },
          ]
        : kind === 'suppliers'
          ? [
              {
                label: 'Factories',
                items: Array.isArray(item.factories)
                  ? (item.factories as Row[])
                  : [],
              },
              {
                label: 'Routes',
                items: relationItems(item.routeSuppliers, 'route'),
              },
            ]
          : kind === 'factories'
            ? [
                {
                  label: 'Supplier',
                  items:
                    item.supplier && typeof item.supplier === 'object'
                      ? [item.supplier as Row]
                      : [],
                },
                {
                  label: 'Routes',
                  items: relationItems(item.routeFactories, 'route'),
                },
              ]
            : [];
  return (
    <section className="rounded-xl border bg-white p-5">
      <h2 className="font-semibold">Relationships</h2>
      {relations.map((relation) => (
        <RelationEditor
          key={relation.label}
          {...relation}
          onAttach={(id) =>
            void attach(relation.path, id, relation.current.length)
          }
          onDetach={(id) => void detach(relation.path, id)}
          onMove={
            relation.path === 'ports'
              ? (index, direction) =>
                  void reorder(
                    relation.path,
                    relation.current,
                    index,
                    direction,
                  )
              : undefined
          }
        />
      ))}
      {readOnly.map((relation) => (
        <div className="mt-5 border-t pt-4" key={relation.label}>
          <h3 className="text-sm font-semibold">{relation.label}</h3>
          <div className="mt-2 text-sm text-muted">
            {relation.items.length
              ? relation.items.map((entry) => entry.name).join(', ')
              : 'None configured'}
          </div>
        </div>
      ))}
    </section>
  );
}
function relationItems(value: unknown, key: string): Row[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const target = (entry as Record<string, unknown>)[key];
    return typeof target === 'object' && target !== null ? [target as Row] : [];
  });
}
function RelationEditor({
  label,
  targets,
  current,
  onAttach,
  onDetach,
  onMove,
}: {
  label: string;
  targets: Row[];
  current: Row[];
  onAttach: (id: string) => void;
  onDetach: (id: string) => void;
  onMove?: ((index: number, direction: -1 | 1) => void) | undefined;
}) {
  const [selected, setSelected] = useState('');
  const available = targets.filter(
    (target) => !current.some((item) => item.id === target.id),
  );
  return (
    <div className="mt-5 border-t pt-4">
      <h3 className="text-sm font-semibold">{label}</h3>
      <div className="mt-2 flex gap-2">
        <select
          className="focus-ring min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">Select…</option>
          {available.map((target) => (
            <option value={target.id} key={target.id}>
              {target.name}
            </option>
          ))}
        </select>
        <button
          disabled={!selected}
          className="focus-ring rounded-lg border px-3 text-sm disabled:opacity-40"
          onClick={() => {
            onAttach(selected);
            setSelected('');
          }}
        >
          <Link2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {current.map((target, index) => (
          <div
            className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2 text-sm"
            key={target.id}
          >
            <span>
              {index + 1}. {target.name}
            </span>
            <div className="flex gap-2">
              {onMove && (
                <>
                  <button
                    disabled={index === 0}
                    aria-label={`Move ${target.name} up`}
                    onClick={() => onMove(index, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    disabled={index === current.length - 1}
                    aria-label={`Move ${target.name} down`}
                    onClick={() => onMove(index, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </>
              )}
              <button
                className="text-red-700"
                aria-label={`Detach ${target.name}`}
                onClick={() => onDetach(target.id)}
              >
                <Unlink className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function EntityForm({
  fields,
  initial,
  supplierOptions = [],
  routeOptions = [],
  onSubmit,
  submitLabel,
}: {
  fields: Field[];
  initial?: Row;
  supplierOptions?: Row[];
  routeOptions?: Row[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
}) {
  return (
    <form className="rounded-xl border bg-white p-5" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <label className="text-sm font-medium" key={field.key}>
            {field.label}
            {field.kind === 'supplier' || field.kind === 'route' ? (
              <select
                name={field.key}
                defaultValue={String(initial?.[field.key] ?? '')}
                required={field.required}
                className="focus-ring mt-2 w-full rounded-lg border px-3 py-2.5 font-normal"
              >
                <option value="">{field.kind === 'supplier' ? 'No supplier' : 'Select route'}</option>
                {(field.kind === 'supplier' ? supplierOptions : routeOptions).map((option) => (
                  <option value={option.id} key={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            ) : field.kind === 'select' ? (
              <select
                name={field.key}
                defaultValue={String(
                  initial?.[field.key] ?? field.options?.[0] ?? '',
                )}
                required={field.required}
                className="focus-ring mt-2 w-full rounded-lg border px-3 py-2.5 font-normal"
              >
                {field.options?.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ) : field.kind === 'boolean' ? (
              <input
                name={field.key}
                defaultChecked={Boolean(initial?.[field.key])}
                type="checkbox"
                className="ml-3"
              />
            ) : (
              <input
                name={field.key}
                defaultValue={
                  initial?.[field.key] == null ? '' : String(initial[field.key])
                }
                required={field.required}
                type={field.kind === 'number' ? 'number' : 'text'}
                step={field.kind === 'number' ? 'any' : undefined}
                className="focus-ring mt-2 w-full rounded-lg border px-3 py-2.5 font-normal"
              />
            )}
          </label>
        ))}
      </div>
      <button className="focus-ring mt-5 flex items-center gap-2 rounded-lg bg-signal px-4 py-2.5 text-sm font-semibold text-white">
        <Save className="h-4 w-4" />
        {submitLabel}
      </button>
    </form>
  );
}
function Page({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="p-5 sm:p-8">
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-signal">Supply chain</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {title}
          </h1>
          <p className="mt-2 text-sm text-muted">{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
function ErrorBox({ text }: { text: string }) {
  return (
    <div
      role="alert"
      className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
    >
      {text}
    </div>
  );
}
function Loading() {
  return (
    <div className="flex items-center gap-2 rounded-xl border bg-white p-8 text-sm text-muted">
      <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}
