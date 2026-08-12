import {
  Activity,
  Boxes,
  FileCheck2,
  LayoutDashboard,
  LogOut,
  RadioTower,
  Settings,
  ShieldCheck,
  FlaskConical,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { supabase } from '../lib/auth';
import { useWorkspace } from '../lib/workspace';

const baseNavigation = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Supply chain', to: '/supply-chain', icon: Boxes },
  { label: 'Review', to: '/review', icon: FileCheck2 },
  { label: 'Settings', to: '/settings', icon: Settings },
];

export function AppShell() {
  const { customerId, workspaces, setCustomerId, user } = useWorkspace();
  const navigation =
    user.role === 'ADMIN' || user.role === 'REVIEWER'
      ? [
          ...baseNavigation.slice(0, 2),
          { label: 'Sources', to: '/sources', icon: RadioTower },
          { label: 'Articles', to: '/source-articles', icon: FileCheck2 },
          { label: 'Claims', to: '/claims', icon: FileCheck2 },
          { label: 'Extraction POC', to: '/poc/extraction', icon: FlaskConical },
          ...baseNavigation.slice(2),
        ]
      : baseNavigation;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="border-b bg-ink text-white lg:min-h-screen lg:border-b-0 lg:border-r lg:border-white/10">
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-400/15">
            <Activity className="h-4 w-4 text-emerald-300" />
          </span>
          <div>
            <div className="text-sm font-semibold tracking-tight">
              SupplySignal
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">
              Operations intelligence
            </div>
          </div>
        </div>
        <nav
          className="flex gap-1 overflow-x-auto p-3 lg:block lg:space-y-1"
          aria-label="Primary navigation"
        >
          {navigation.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `focus-ring flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'}`
              }
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden px-3 lg:absolute lg:bottom-4 lg:block lg:w-[248px]">
          <button
            className="focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/60 hover:bg-white/5 hover:text-white"
            onClick={() => void supabase?.auth.signOut()}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0">
        <header className="flex h-16 items-center justify-between border-b bg-white px-5 sm:px-8">
          <div>
            <label
              className="text-xs font-medium uppercase tracking-wider text-muted"
              htmlFor="workspace"
            >
              Customer workspace
            </label>
            <select
              id="workspace"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              className="block bg-transparent text-sm font-semibold focus:outline-none"
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 rounded-full border bg-canvas px-3 py-1.5 text-xs font-medium text-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-signal" /> Secure session
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
