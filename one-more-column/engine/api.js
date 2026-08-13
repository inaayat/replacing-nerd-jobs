export async function apiFetch(path, { method = 'GET', body, token, _retried = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const authToken = token || _authBridge?.getToken?.();
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !_retried && _authBridge?.refresh) {
      const next = await _authBridge.refresh();
      if (next && next !== authToken) {
        return apiFetch(path, { method, body, token: next, _retried: true });
      }
    }
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    // 409s carry the rows that moved underneath us, which the caller needs to
    // tell the user what changed rather than just that something did.
    err.data = data;
    throw err;
  }
  return data;
}

let _authBridge = null;

/** Lets the SPA refresh a short-lived Neon JWT and retry the request once. */
export function configureApiAuth({ getToken, refresh }) {
  _authBridge = { getToken, refresh };
}

function workspaceQs(workspaceId) {
  return `workspace=${encodeURIComponent(workspaceId)}`;
}

export const meApi = {
  get: (token) => apiFetch('/api/omc-me', { token }),
};

export const workspacesApi = {
  list: (token) => apiFetch('/api/omc-workspaces', { token }),
  create: (token, body) => apiFetch('/api/omc-workspaces', { method: 'POST', body, token }),
  patch: (token, body) => apiFetch('/api/omc-workspaces', { method: 'PATCH', body, token }),
  delete: (token, id) =>
    apiFetch(`/api/omc-workspaces?id=${encodeURIComponent(id)}`, { method: 'DELETE', token }),
};

export const cyclesApi = {
  list: (token, workspaceId) =>
    apiFetch(`/api/omc-cycles?${workspaceQs(workspaceId)}`, { token }),
  create: (token, workspaceId, body) =>
    apiFetch(`/api/omc-cycles?${workspaceQs(workspaceId)}`, {
      method: 'POST',
      body: { ...body, workspace_id: workspaceId },
      token,
    }),
  patch: (token, workspaceId, body) =>
    apiFetch(`/api/omc-cycles?${workspaceQs(workspaceId)}`, {
      method: 'PATCH',
      body: { ...body, workspace_id: workspaceId },
      token,
    }),
  delete: (token, workspaceId, id) =>
    apiFetch(`/api/omc-cycles?${workspaceQs(workspaceId)}&id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      token,
    }),
};

export const scenariosApi = {
  list: (token, cycleId) =>
    apiFetch(`/api/omc-scenarios?cycle=${encodeURIComponent(cycleId)}`, { token }),
  create: (token, body) =>
    apiFetch('/api/omc-scenarios', { method: 'POST', body, token }),
  patch: (token, body) =>
    apiFetch('/api/omc-scenarios', { method: 'PATCH', body, token }),
  delete: (token, id) =>
    apiFetch(`/api/omc-scenarios?id=${encodeURIComponent(id)}`, { method: 'DELETE', token }),
};

export const policyApi = {
  get: (token, cycleId) => apiFetch(`/api/omc-policy?cycle=${encodeURIComponent(cycleId)}`, { token }),
  update: (token, cycleId, config) =>
    apiFetch(`/api/omc-policy?cycle=${encodeURIComponent(cycleId)}`, {
      method: 'PUT',
      body: { config },
      token,
    }),
};

export const resourcesApi = {
  list: (token, workspaceId, { team, active } = {}) => {
    const params = new URLSearchParams({ workspace: workspaceId });
    if (team) params.set('team', team);
    if (active === false) params.set('active', 'false');
    return apiFetch(`/api/omc-resources?${params}`, { token });
  },
  create: (token, workspaceId, body) =>
    apiFetch(`/api/omc-resources?${workspaceQs(workspaceId)}`, {
      method: 'POST',
      body: { ...body, workspace_id: workspaceId },
      token,
    }),
  patch: (token, workspaceId, resources) =>
    apiFetch(`/api/omc-resources?${workspaceQs(workspaceId)}`, {
      method: 'PATCH',
      body: { resources },
      token,
    }),
  patchOne: (token, workspaceId, resource) =>
    apiFetch(`/api/omc-resources?${workspaceQs(workspaceId)}`, {
      method: 'PATCH',
      body: { resources: [resource] },
      token,
    }),
  delete: (token, workspaceId, id) =>
    apiFetch(`/api/omc-resources?${workspaceQs(workspaceId)}&id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      token,
    }),
};

export const planItemsApi = {
  list: (token, { cycle, scenario } = {}) => {
    const params = new URLSearchParams();
    if (cycle) params.set('cycle', cycle);
    if (scenario) params.set('scenario', scenario);
    return apiFetch(`/api/omc-plan-items?${params}`, { token });
  },
  create: (token, body) => apiFetch('/api/omc-plan-items', { method: 'POST', body, token }),
  patch: (token, plan_items) =>
    apiFetch('/api/omc-plan-items', { method: 'PATCH', body: { plan_items }, token }),
  /** Autosave path: one row, guarded by the updated_at it was loaded with. */
  patchOne: (token, item, { force = false } = {}) =>
    apiFetch('/api/omc-plan-items', {
      method: 'PATCH',
      body: { plan_items: [item], ...(force ? { force: true } : {}) },
      token,
    }),
  delete: (token, id) =>
    apiFetch(`/api/omc-plan-items?id=${encodeURIComponent(id)}`, { method: 'DELETE', token }),
};

export const dependenciesApi = {
  list: (token, { cycle, scenario } = {}) => {
    const params = new URLSearchParams({ cycle });
    if (scenario) params.set('scenario', scenario);
    return apiFetch(`/api/omc-dependencies?${params}`, { token });
  },
  create: (token, body) => apiFetch('/api/omc-dependencies', { method: 'POST', body, token }),
  patch: (token, dependencies) =>
    apiFetch('/api/omc-dependencies', { method: 'PATCH', body: { dependencies }, token }),
  patchOne: (token, dependency, { force = false } = {}) =>
    apiFetch('/api/omc-dependencies', {
      method: 'PATCH',
      body: { dependencies: [dependency], ...(force ? { force: true } : {}) },
      token,
    }),
  delete: (token, id) =>
    apiFetch(`/api/omc-dependencies?id=${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  applyGateTemplate: (token, body) =>
    apiFetch('/api/omc-dependencies', {
      method: 'POST',
      body: { action: 'apply-gate-template', ...body },
      token,
    }),
};

export const importApi = {
  preview: (token, body) => apiFetch('/api/omc-import', { method: 'POST', body, token }),
  commit: (token, body) =>
    apiFetch('/api/omc-import', { method: 'POST', body: { ...body, confirm: true }, token }),
};

export const capacityApi = {
  get: (token, { cycle, scenario, team, mode, granularity } = {}) => {
    const params = new URLSearchParams({ cycle });
    if (scenario) params.set('scenario', scenario);
    if (team) params.set('team', team);
    if (mode) params.set('mode', mode);
    if (granularity) params.set('granularity', granularity);
    return apiFetch(`/api/omc-capacity?${params}`, { token });
  },
};

export const changelogApi = {
  list: (token, cycleId, limit = 50) =>
    apiFetch(`/api/omc-changelog?cycle=${encodeURIComponent(cycleId)}&limit=${limit}`, { token }),
};

export const exportApi = {
  downloadUrl: ({ type, cycle, scenario, team, mode, format = 'csv' }) => {
    const params = new URLSearchParams({ type, cycle, format });
    if (scenario) params.set('scenario', scenario);
    if (team) params.set('team', team);
    if (mode) params.set('mode', mode);
    return `/api/omc-export?${params}`;
  },
  drift: (token, { cycle, scenario } = {}) => {
    const params = new URLSearchParams({ type: 'drift', cycle, format: 'json' });
    if (scenario) params.set('scenario', scenario);
    return apiFetch(`/api/omc-export?${params}`, { token });
  },
};

export const timeOffApi = {
  create: (token, workspaceId, body) =>
    apiFetch(`/api/omc-time-off?workspace=${encodeURIComponent(workspaceId)}`, {
      method: 'POST',
      body,
      token,
    }),
  delete: (token, id) =>
    apiFetch(`/api/omc-time-off?id=${encodeURIComponent(id)}`, { method: 'DELETE', token }),
};

export const taskTypesApi = {
  list: (token, workspaceId) =>
    apiFetch(`/api/omc-task-types?${workspaceQs(workspaceId)}`, { token }),
  create: (token, workspaceId, body) =>
    apiFetch(`/api/omc-task-types?${workspaceQs(workspaceId)}`, {
      method: 'POST',
      body: { ...body, workspace_id: workspaceId },
      token,
    }),
  patch: (token, workspaceId, body) =>
    apiFetch(`/api/omc-task-types?${workspaceQs(workspaceId)}`, {
      method: 'PATCH',
      body: { ...body, workspace_id: workspaceId },
      token,
    }),
  delete: (token, workspaceId, id) =>
    apiFetch(`/api/omc-task-types?${workspaceQs(workspaceId)}&id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      token,
    }),
};
