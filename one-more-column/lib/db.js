// Neon Postgres access for api/*.js routes. Lazy init so the module can be
// imported before DATABASE_URL is configured — routes return 503 instead of
// crashing at import time.
import { neon } from '@neondatabase/serverless';

let _sql = null;

export function db() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql;
}

let _schemaReady = null;

/** Ensures H1.5 schema exists (users + workspaces + planning domain tables). */
export function ensureSchema() {
  if (!_schemaReady) {
    _schemaReady = (async () => {
      const sql = db();
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT,
          name TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          profile TEXT NOT NULL DEFAULT 'default',
          description TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS planning_cycles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          profile TEXT NOT NULL DEFAULT 'default',
          status TEXT NOT NULL DEFAULT 'active',
          cycle_type TEXT NOT NULL DEFAULT 'annual',
          start_date DATE,
          end_date DATE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`ALTER TABLE planning_cycles ADD COLUMN IF NOT EXISTS workspace_id TEXT`;
      await sql`ALTER TABLE planning_cycles ADD COLUMN IF NOT EXISTS cycle_type TEXT NOT NULL DEFAULT 'annual'`;

      await sql`
        CREATE TABLE IF NOT EXISTS planning_policies (
          id TEXT PRIMARY KEY,
          cycle_id TEXT NOT NULL REFERENCES planning_cycles(id) ON DELETE CASCADE,
          version INTEGER NOT NULL DEFAULT 1,
          config JSONB NOT NULL,
          created_by TEXT REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (cycle_id, version)
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS assumptions (
          id TEXT PRIMARY KEY,
          cycle_id TEXT NOT NULL REFERENCES planning_cycles(id) ON DELETE CASCADE,
          text TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          owner_user_id TEXT REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS resources (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT,
          team TEXT,
          active BOOLEAN NOT NULL DEFAULT true,
          jira_account_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`ALTER TABLE resources ADD COLUMN IF NOT EXISTS workspace_id TEXT`;

      await sql`
        CREATE TABLE IF NOT EXISTS resource_profiles (
          id TEXT PRIMARY KEY,
          resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
          effective_from DATE NOT NULL,
          weekly_hours NUMERIC(6,2),
          daily_hours NUMERIC(6,2),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS resource_time_off (
          id TEXT PRIMARY KEY,
          resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          hours_per_day NUMERIC(6,2),
          reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS scenarios (
          id TEXT PRIMARY KEY,
          cycle_id TEXT NOT NULL REFERENCES planning_cycles(id) ON DELETE CASCADE,
          name TEXT NOT NULL DEFAULT 'Default',
          status TEXT NOT NULL DEFAULT 'active',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS field_definitions (
          id TEXT PRIMARY KEY,
          profile TEXT NOT NULL DEFAULT 'default',
          key TEXT NOT NULL,
          label TEXT NOT NULL,
          field_type TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'static',
          validation JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (profile, key)
        )
      `;

      await sql`ALTER TABLE field_definitions ADD COLUMN IF NOT EXISTS workspace_id TEXT`;

      await sql`
        CREATE TABLE IF NOT EXISTS plan_items (
          id TEXT PRIMARY KEY,
          cycle_id TEXT NOT NULL REFERENCES planning_cycles(id) ON DELETE CASCADE,
          scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
          unique_key TEXT,
          title TEXT NOT NULL,
          phase TEXT,
          source TEXT NOT NULL DEFAULT 'manual',
          work_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
          review_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
          due_week DATE,
          assignee_ids TEXT[] NOT NULL DEFAULT '{}',
          attributes JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`CREATE INDEX IF NOT EXISTS idx_workspaces_name ON workspaces(name)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_cycles_workspace ON planning_cycles(workspace_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_resources_workspace ON resources(workspace_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_resources_team ON resources(team)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_resources_active ON resources(active)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_plan_items_cycle ON plan_items(cycle_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_plan_items_scenario ON plan_items(scenario_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_plan_items_due_week ON plan_items(due_week)`;

      await sql`
        CREATE TABLE IF NOT EXISTS dependencies (
          id TEXT PRIMARY KEY,
          cycle_id TEXT NOT NULL REFERENCES planning_cycles(id) ON DELETE CASCADE,
          from_plan_item_id TEXT REFERENCES plan_items(id) ON DELETE CASCADE,
          to_plan_item_id TEXT NOT NULL REFERENCES plan_items(id) ON DELETE CASCADE,
          dep_type TEXT NOT NULL DEFAULT 'input_ready',
          status TEXT NOT NULL DEFAULT 'open',
          label TEXT,
          meta JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`CREATE INDEX IF NOT EXISTS idx_dependencies_cycle ON dependencies(cycle_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_dependencies_to ON dependencies(to_plan_item_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_scenarios_cycle ON scenarios(cycle_id)`;

      await sql`
        CREATE TABLE IF NOT EXISTS plan_changelog (
          id TEXT PRIMARY KEY,
          cycle_id TEXT NOT NULL REFERENCES planning_cycles(id) ON DELETE CASCADE,
          scenario_id TEXT REFERENCES scenarios(id) ON DELETE SET NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT,
          action TEXT NOT NULL,
          summary TEXT NOT NULL,
          actor_user_id TEXT REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS import_snapshots (
          id TEXT PRIMARY KEY,
          cycle_id TEXT NOT NULL REFERENCES planning_cycles(id) ON DELETE CASCADE,
          scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
          row_count INTEGER NOT NULL DEFAULT 0,
          snapshot JSONB NOT NULL DEFAULT '[]',
          created_by TEXT REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`CREATE INDEX IF NOT EXISTS idx_changelog_cycle ON plan_changelog(cycle_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_import_snapshots_cycle ON import_snapshots(cycle_id)`;

      await sql`
        CREATE TABLE IF NOT EXISTS task_types (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          key TEXT NOT NULL,
          label TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (workspace_id, key)
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS gate_templates (
          id TEXT PRIMARY KEY,
          task_type_id TEXT NOT NULL REFERENCES task_types(id) ON DELETE CASCADE,
          seq INTEGER NOT NULL,
          label TEXT NOT NULL,
          duration_days NUMERIC(6,2) NOT NULL DEFAULT 1,
          day_kind TEXT NOT NULL DEFAULT 'business',
          dep_type TEXT NOT NULL DEFAULT 'input_ready',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS task_type_fields (
          id TEXT PRIMARY KEY,
          task_type_id TEXT NOT NULL REFERENCES task_types(id) ON DELETE CASCADE,
          key TEXT NOT NULL,
          label TEXT NOT NULL,
          field_type TEXT NOT NULL DEFAULT 'text',
          options JSONB,
          required BOOLEAN NOT NULL DEFAULT false,
          seq INTEGER NOT NULL,
          UNIQUE (task_type_id, key)
        )
      `;

      await sql`CREATE INDEX IF NOT EXISTS idx_task_types_workspace ON task_types(workspace_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_gate_templates_type ON gate_templates(task_type_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_task_type_fields_type ON task_type_fields(task_type_id)`;
    })().catch((err) => {
      _schemaReady = null;
      throw err;
    });
  }
  return _schemaReady;
}
