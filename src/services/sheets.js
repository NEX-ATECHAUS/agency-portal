// Google Sheets API Service
// All data is stored in a Google Spreadsheet with one sheet per entity

// All reads and writes go through Vercel serverless API routes
// using the Google service account — no public API key needed.

// ──────────────────────────────────────────────
// Generic read/write helpers
// ──────────────────────────────────────────────

export async function readSheet(sheetName) {
  const res = await fetch(`/api/sheets/read?sheetName=${encodeURIComponent(sheetName)}`);
  if (!res.ok) throw new Error(`Failed to read sheet: ${sheetName}`);
  const data = await res.json();
  return rowsToObjects(data.values || []);
}

export async function appendRow(sheetName, rowData) {
  const res = await fetch('/api/sheets/append', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sheetName, rowData }),
  });
  if (!res.ok) throw new Error('Failed to append row');
  return res.json();
}

export async function updateRow(sheetName, rowIndex, rowData) {
  const res = await fetch('/api/sheets/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sheetName, rowIndex, rowData }),
  });
  if (!res.ok) throw new Error('Failed to update row');
  return res.json();
}

export async function deleteRow(sheetName, rowIndex) {
  const res = await fetch('/api/sheets/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sheetName, rowIndex }),
  });
  if (!res.ok) throw new Error('Failed to delete row');
  return res.json();
}

// ──────────────────────────────────────────────
// Row <-> Object conversion
// ──────────────────────────────────────────────

const SCHEMA = {
  clients: ['id', 'name', 'email', 'phone', 'company', 'address', 'notes', 'created_at'],
  projects: ['id', 'title', 'client_id', 'client_name', 'type', 'status', 'current_stage', 'stage_completion', 'payment_stages', 'total_fee', 'start_date', 'end_date', 'description', 'notes', 'created_at'],
  proposals: ['id', 'title', 'client_id', 'client_name', 'client_email', 'status', 'total_amount', 'payment_schedule', 'scope', 'deliverables', 'timeline', 'terms', 'valid_until', 'sent_at', 'responded_at', 'signed_by', 'signed_at', 'created_at'],
  invoices: ['id', 'invoice_number', 'project_id', 'project_title', 'client_id', 'client_name', 'client_email', 'client_address', 'stage', 'stage_description', 'line_items', 'charge_gst', 'amount', 'due_date', 'status', 'paid_at', 'sent_at', 'notes', 'created_at'],
  time_entries: ['id', 'project_id', 'project_title', 'stage', 'description', 'hours', 'billable', 'date', 'team_member', 'created_at'],
  expenses: ['id', 'description', 'category', 'amount', 'date', 'receipt_url', 'project_id', 'notes', 'created_at'],
  notifications: ['id', 'type', 'title', 'message', 'read', 'action_url', 'created_at'],
  settings: ['key', 'value'],
  users: ['id', 'email', 'name', 'role', 'password_hash', 'created_at'],
  tickets: ['id', 'subject', 'client_id', 'client_name', 'project_id', 'project_title', 'status', 'priority', 'description', 'thread_id', 'sender_email', 'assigned_to', 'resolved_at', 'notes', 'created_at'],
  software_stack: ['id', 'client_id', 'client_name', 'app_name', 'category', 'url', 'version', 'notes', 'last_checked', 'last_update_found', 'update_summary', 'created_at'],
};

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).map((row, idx) => {
    const obj = { _rowIndex: idx + 2 }; // 1-indexed, skip header row
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? '';
    });
    // Parse JSON fields
    ['stage_completion', 'payment_stages', 'payment_schedule', 'deliverables'].forEach(field => {
      if (obj[field]) {
        try { obj[field] = JSON.parse(obj[field]); } catch {}
      }
    });
    return obj;
  });
}

function objectToRow(sheetName, obj) {
  const schema = SCHEMA[sheetName];
  if (!schema) throw new Error(`Unknown sheet: ${sheetName}`);
  return schema.map(key => {
    const val = obj[key];
    if (val === undefined || val === null) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  });
}

// ──────────────────────────────────────────────
// ID generator
// ──────────────────────────────────────────────

export function generateId(prefix = '') {
  return `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

// ──────────────────────────────────────────────
// Entity CRUD
// ──────────────────────────────────────────────

// CLIENTS
export const ClientsAPI = {
  async list() { return readSheet('clients'); },
  async create(data) {
    const record = { ...data, id: generateId('C'), created_at: new Date().toISOString() };
    await appendRow('clients', objectToRow('clients', record));
    return record;
  },
  async update(id, data) {
    const rows = await readSheet('clients');
    const row = rows.find(r => r.id === id);
    if (!row) throw new Error('Client not found');
    const updated = { ...row, ...data };
    await updateRow('clients', row._rowIndex, objectToRow('clients', updated));
    return updated;
  },
  async delete(id) {
    const rows = await readSheet('clients');
    const row = rows.find(r => r.id === id);
    if (!row) throw new Error('Client not found');
    await deleteRow('clients', row._rowIndex);
  },
};

// PROJECTS
export const ProjectsAPI = {
  async list() { return readSheet('projects'); },
  async get(id) {
    const rows = await readSheet('projects');
    return rows.find(r => r.id === id);
  },
  async create(data) {
    const record = {
      ...data,
      id: generateId('P'),
      stage_completion: data.stage_completion || {},
      current_stage: data.current_stage || 'Discovery',
      status: data.status || 'active',
      created_at: new Date().toISOString(),
    };
    await appendRow('projects', objectToRow('projects', record));
    return record;
  },
  async update(id, data) {
    const rows = await readSheet('projects');
    const row = rows.find(r => r.id === id);
    if (!row) throw new Error('Project not found');
    const updated = { ...row, ...data };
    await updateRow('projects', row._rowIndex, objectToRow('projects', updated));
    return updated;
  },
};

// PROPOSALS
export const ProposalsAPI = {
  async list() { return readSheet('proposals'); },
  async get(id) {
    const rows = await readSheet('proposals');
    return rows.find(r => r.id === id);
  },
  async create(data) {
    const record = {
      ...data,
      id: generateId('PR'),
      status: 'draft',
      created_at: new Date().toISOString(),
    };
    await appendRow('proposals', objectToRow('proposals', record));
    return record;
  },
  async update(id, data) {
    const rows = await readSheet('proposals');
    const row = rows.find(r => r.id === id);
    if (!row) throw new Error('Proposal not found');
    const updated = { ...row, ...data };
    await updateRow('proposals', row._rowIndex, objectToRow('proposals', updated));
    return updated;
  },
};

// INVOICES
export const InvoicesAPI = {
  async list() { return readSheet('invoices'); },
  async get(id) {
    const rows = await readSheet('invoices');
    return rows.find(r => r.id === id);
  },
  async create(data) {
    const record = {
      ...data,
      id: generateId('INV'),
      invoice_number: data.invoice_number || `INV-${Date.now()}`,
      status: data.status || 'draft',
      created_at: new Date().toISOString(),
    };
    await appendRow('invoices', objectToRow('invoices', record));
    return record;
  },
  async update(id, data) {
    const rows = await readSheet('invoices');
    const row = rows.find(r => r.id === id);
    if (!row) throw new Error('Invoice not found');
    const updated = { ...row, ...data };
    await updateRow('invoices', row._rowIndex, objectToRow('invoices', updated));
    return updated;
  },
};

// TIME ENTRIES
export const TimeAPI = {
  async list() { return readSheet('time_entries'); },
  async create(data) {
    const record = { ...data, id: generateId('T'), created_at: new Date().toISOString() };
    await appendRow('time_entries', objectToRow('time_entries', record));
    return record;
  },
  async update(id, data) {
    const rows = await readSheet('time_entries');
    const row = rows.find(r => r.id === id);
    if (!row) throw new Error('Entry not found');
    const updated = { ...row, ...data };
    await updateRow('time_entries', row._rowIndex, objectToRow('time_entries', updated));
    return updated;
  },
  async delete(id) {
    const rows = await readSheet('time_entries');
    const row = rows.find(r => r.id === id);
    if (row) await deleteRow('time_entries', row._rowIndex);
  },
};

// EXPENSES
export const ExpensesAPI = {
  async list() { return readSheet('expenses'); },
  async create(data) {
    const record = { ...data, id: generateId('EX'), created_at: new Date().toISOString() };
    await appendRow('expenses', objectToRow('expenses', record));
    return record;
  },
  async update(id, data) {
    const rows = await readSheet('expenses');
    const row = rows.find(r => r.id === id);
    if (!row) throw new Error('Expense not found');
    const updated = { ...row, ...data };
    await updateRow('expenses', row._rowIndex, objectToRow('expenses', updated));
    return updated;
  },
  async delete(id) {
    const rows = await readSheet('expenses');
    const row = rows.find(r => r.id === id);
    if (row) await deleteRow('expenses', row._rowIndex);
  },
};

// NOTIFICATIONS
export const TicketsAPI = {
  list: async () => readSheet('tickets'),
  create: async (data) => {
    const record = { id: `T_${Date.now()}_${Math.random().toString(36).substr(2,6)}`, ...data };
    await appendRow('tickets', objectToRow('tickets', record));
    return record;
  },
  update: async (id, data) => {
    const rows = await readSheet('tickets');
    const row = rows.find(r => r.id === id);
    if (!row) throw new Error('Ticket not found');
    const updated = { ...row, ...data };
    await updateRow('tickets', row._rowIndex, objectToRow('tickets', updated));
    return updated;
  },
  delete: async (id) => {
    const rows = await readSheet('tickets');
    const row = rows.find(r => r.id === id);
    if (!row) throw new Error('Ticket not found');
    await deleteRow('tickets', row._rowIndex);
  },
};

export const SoftwareStackAPI = {
  list: async () => readSheet('software_stack'),
  create: async (data) => {
    const record = { id: `SW_${Date.now()}_${Math.random().toString(36).substr(2,6)}`, ...data };
    await appendRow('software_stack', objectToRow('software_stack', record));
    return record;
  },
  update: async (id, data) => {
    const rows = await readSheet('software_stack');
    const row = rows.find(r => r.id === id);
    if (!row) throw new Error('Entry not found');
    const updated = { ...row, ...data };
    await updateRow('software_stack', row._rowIndex, objectToRow('software_stack', updated));
    return updated;
  },
  delete: async (id) => {
    const rows = await readSheet('software_stack');
    const row = rows.find(r => r.id === id);
    if (!row) throw new Error('Entry not found');
    await deleteRow('software_stack', row._rowIndex);
  },
};

export const NotificationsAPI = {
  async list() { return readSheet('notifications'); },
  async create(data) {
    const record = {
      ...data,
      id: generateId('N'),
      read: 'false',
      created_at: new Date().toISOString(),
    };
    await appendRow('notifications', objectToRow('notifications', record));
    return record;
  },
  async markRead(id) {
    const rows = await readSheet('notifications');
    const row = rows.find(r => r.id === id);
    if (!row) return;
    const updated = { ...row, read: 'true' };
    await updateRow('notifications', row._rowIndex, objectToRow('notifications', updated));
  },
  async delete(id) {
    const rows = await readSheet('notifications');
    const row = rows.find(r => r.id === id);
    if (row) await deleteRow('notifications', row._rowIndex);
  },
};

// SETTINGS
export const SettingsAPI = {
  async getAll() {
    const rows = await readSheet('settings');
    const obj = {};
    rows.forEach(r => { obj[r.key] = r.value; });
    return obj;
  },
  async set(key, value) {
    const rows = await readSheet('settings');
    const row = rows.find(r => r.key === key);
    if (row) {
      await updateRow('settings', row._rowIndex, [key, String(value)]);
    } else {
      await appendRow('settings', [key, String(value)]);
    }
  },
  async setAll(obj) {
    for (const [key, value] of Object.entries(obj)) {
      await SettingsAPI.set(key, value);
    }
  },
};

// USERS / AUTH
export const AuthAPI = {
  async login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Login failed');
    }
    return res.json();
  },
};

// Email via Gmail
export const EmailAPI = {
  async sendProposal(proposalId, recipientEmail, subject, body) {
    const res = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposalId, recipientEmail, subject, body, type: 'proposal' }),
    });
    if (!res.ok) throw new Error('Failed to send email');
    return res.json();
  },
  async sendInvoice(invoiceId, recipientEmail, subject, body) {
    const res = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId, recipientEmail, subject, body, type: 'invoice' }),
    });
    if (!res.ok) throw new Error('Failed to send email');
    return res.json();
  },
};

// AI (Anthropic)
export const AIAPI = {
  async generateInvoiceDescription(projectTitle, projectType, stage, clientName) {
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectTitle, projectType, stage, clientName, type: 'invoice_description' }),
    });
    if (!res.ok) throw new Error('AI generation failed');
    return res.json();
  },
};
