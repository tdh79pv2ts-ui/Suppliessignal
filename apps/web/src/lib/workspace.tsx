import { createContext, useContext } from 'react';
import type { AuthenticatedUser } from '@suppliesignal/shared';
export type Workspace = { user: AuthenticatedUser; customerId: string; workspaces: { id: string; name: string }[]; setCustomerId: (id: string) => void };
export const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspace() { const value = useContext(WorkspaceContext); if (!value) throw new Error('Workspace is unavailable'); return value; }
