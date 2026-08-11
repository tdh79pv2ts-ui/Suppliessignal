export const userRoles = ['ADMIN', 'REVIEWER', 'CUSTOMER'] as const;
export type UserRole = (typeof userRoles)[number];

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  customerIds: string[];
};

export type ApiError = {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
};

export type HealthResponse = {
  status: 'ok';
  service: 'suppliesignal-api';
  timestamp: string;
};

export type DashboardMetric = {
  label: 'Critical' | 'High' | 'Medium' | 'Early signals' | 'Resolved';
  value: number | null;
  state: 'unconfigured' | 'ready';
};
