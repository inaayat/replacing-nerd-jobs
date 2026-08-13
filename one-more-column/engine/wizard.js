/**
 * Guided plan creation.
 *
 * The old Setup page opened on "Workspace: [Existing] [New]" — but the API's
 * listWorkspaces() calls ensureDefaultWorkspace(), so a workspace always exists.
 * The very first decision a new user faced was therefore one they never needed
 * to make. Here the workspace is demoted to a single line of secondary text
 * with an escape hatch, and step one is the thing people actually came to do:
 * name a plan and give it dates.
 */

import { escapeHtml, prettyDate } from './shell.js';

const STEP_LABELS = ['Your plan', 'Your team', 'Review'];

export function blankWizard() {
  const start = todayIso();
  const end = addDays(start, 84); // 12 weeks reads as a natural default quarter
  return {
    open: false,
    step: 1,
    name: suggestPlanName(start),
    start,
    end,
    granularity: 'week',
    useNewWorkspace: false,
    newWorkspaceName: '',
    showWorkspace: false,
    people: [],
    person: { name: '', role: '', hours: '32' },
    errors: {},
    submitting: false,
  };
}

/* ── Date helpers ─────────────────────────────────────────────────────── */

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function suggestPlanName(iso) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
  return `Q${quarter} ${d.getUTCFullYear()}`;
}

function daysBetween(a, b) {
  const start = new Date(`${a}T00:00:00.000Z`);
  const end = new Date(`${b}T00:00:00.000Z`);
  return Math.round((end - start) / 86400000);
}

/** "13 weeks", "3 months", "18 days" — whichever unit the plan tracks by. */
function spanLabel(wizard) {
  if (!wizard.start || !wizard.end) return '';
  const days = daysBetween(wizard.start, wizard.end);
  if (days < 0) return '';
  if (wizard.granularity === 'day') return plural(days + 1, 'day');
  if (wizard.granularity === 'month') return plural(Math.max(1, Math.round(days / 30.4)), 'month');
  return plural(Math.max(1, Math.round(days / 7)), 'week');
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/* ── Validation ───────────────────────────────────────────────────────
   Inline and per-field. The old flow used window.alert() for each failure and
   put `required` on date inputs that live inside a display:none panel, which
   Chrome refuses to submit around — so a returning user picking an existing
   plan could press the button and have nothing happen at all. */

export function validateStep(wizard, step) {
  const errors = {};
  if (step === 1) {
    if (!wizard.name.trim()) errors.name = 'Give the plan a name.';
    if (!wizard.start) errors.start = 'Pick a start date.';
    if (!wizard.end) errors.end = 'Pick an end date.';
    if (wizard.start && wizard.end && daysBetween(wizard.start, wizard.end) < 0) {
      errors.end = 'The end date is before the start date.';
    }
    if (wizard.useNewWorkspace && !wizard.newWorkspaceName.trim()) {
      errors.newWorkspaceName = 'Name the new workspace.';
    }
  }
  return errors;
}

/* ── Rendering ────────────────────────────────────────────────────────── */

function errorFor(errors, key) {
  return errors[key]
    ? `<span class="field-error"><span aria-hidden="true">!</span>${escapeHtml(errors[key])}</span>`
    : '';
}

function stepChips(current) {
  return `
    <ol class="wizard-steps">
      ${STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const cls = n === current ? 'current' : n < current ? 'done' : '';
        return `${i > 0 ? '<span class="wizard-sep" aria-hidden="true">→</span>' : ''}
          <li class="wizard-step ${cls}">
            <span class="num">${n < current ? '✓' : n}</span>
            <span>${label}</span>
          </li>`;
      }).join('')}
    </ol>`;
}

/* Day-level tracking is supported by the capacity grid (one column per day). */
function granularityChoices(selected) {
  const options = [
    ['day', 'Day', 'Best for a short sprint or a single week.'],
    ['week', 'Week', 'The usual choice for a quarter.'],
    ['month', 'Month', 'Best for long roadmaps.'],
  ];
  return `
    <div class="choice-row" role="radiogroup" aria-label="Track work by">
      ${options
        .map(
          ([value, name, desc]) => `
        <label class="choice${selected === value ? ' selected' : ''}">
          <input type="radio" name="wiz-granularity" value="${value}"${selected === value ? ' checked' : ''} />
          <span class="choice-name">${name}</span>
          <span class="choice-desc">${desc}</span>
        </label>`,
        )
        .join('')}
    </div>`;
}

function workspaceLine(wizard, state) {
  const active = state.workspaces.find((w) => w.id === state.activeWorkspaceId);
  if (!wizard.showWorkspace) {
    return `
      <p class="wizard-secondary">
        Saving into <strong>${escapeHtml(active?.name || 'your workspace')}</strong>.
        <button type="button" class="link-btn" id="wiz-show-workspace">Use a different workspace</button>
      </p>`;
  }

  return `
    <div class="field">
      <span class="field-label">Workspace</span>
      <p class="field-hint">A workspace is a separate pool of people and plans. Most people only ever need one.</p>
      <div class="btn-row" style="margin:6px 0">
        <div class="toggle-group" role="group" aria-label="Workspace choice">
          <button type="button" class="toggle-btn${!wizard.useNewWorkspace ? ' active' : ''}" data-ws-mode="existing">Use existing</button>
          <button type="button" class="toggle-btn${wizard.useNewWorkspace ? ' active' : ''}" data-ws-mode="new">Create new</button>
        </div>
      </div>
      ${wizard.useNewWorkspace
        ? `<input class="input${wizard.errors.newWorkspaceName ? ' invalid' : ''}" id="wiz-new-workspace"
             placeholder="e.g. Finance team" value="${escapeHtml(wizard.newWorkspaceName)}" />
           ${errorFor(wizard.errors, 'newWorkspaceName')}`
        : `<select class="input" id="wiz-workspace">
             ${state.workspaces
               .map(
                 (w) =>
                   `<option value="${escapeHtml(w.id)}"${w.id === state.activeWorkspaceId ? ' selected' : ''}>${escapeHtml(w.name)}</option>`,
               )
               .join('')}
           </select>`}
    </div>`;
}

/** Echo of the plan dates/granularity — patched in place so date inputs stay mounted. */
export function wizardEchoHtml(wizard) {
  const span = spanLabel(wizard);
  if (!span) return '';
  return `<div class="wizard-echo">
         <strong>${escapeHtml(wizard.name || 'This plan')}</strong> runs
         ${escapeHtml(prettyDate(wizard.start))} → ${escapeHtml(prettyDate(wizard.end))}
         and tracks work by <strong>${escapeHtml(wizard.granularity)}</strong>
         — that's <span class="mono">${escapeHtml(span)}</span> of capacity to fill.
       </div>`;
}

function stepPlan(wizard, state) {
  return `
    <section class="panel wizard-panel">
      <div>
        <h2 class="section-title">What are you planning, and when?</h2>
        <p class="section-sub">A plan is one stretch of time you're staffing — a quarter, a project, a release. You can create more later.</p>
      </div>

      <div class="form-grid form-grid-2">
        <label class="field span-2">
          <span class="field-label">Plan name</span>
          <input class="input${wizard.errors.name ? ' invalid' : ''}" id="wiz-name"
            value="${escapeHtml(wizard.name)}" placeholder="e.g. Q1 2026" autocomplete="off" />
          ${errorFor(wizard.errors, 'name')}
        </label>
        <label class="field">
          <span class="field-label">Starts</span>
          <input class="input${wizard.errors.start ? ' invalid' : ''}" id="wiz-start" type="date" value="${escapeHtml(wizard.start)}" />
          ${errorFor(wizard.errors, 'start')}
        </label>
        <label class="field">
          <span class="field-label">Ends</span>
          <input class="input${wizard.errors.end ? ' invalid' : ''}" id="wiz-end" type="date" value="${escapeHtml(wizard.end)}" />
          ${errorFor(wizard.errors, 'end')}
        </label>
      </div>

      <div class="field">
        <span class="field-label">Track work by</span>
        <p class="field-hint">Sets the columns on your capacity grid. You can change it later under Planning rules on Capacity.</p>
        ${granularityChoices(wizard.granularity)}
      </div>

      <div data-section="wizard-echo">${wizardEchoHtml(wizard)}</div>
      ${workspaceLine(wizard, state)}

      <div class="wizard-foot">
        <span></span>
        <button type="button" class="btn btn-primary btn-lg" id="wiz-next">Next: your team →</button>
      </div>
    </section>`;
}

function stepTeam(wizard) {
  const rows = wizard.people
    .map(
      (p, i) => `
      <tr>
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.role || '—')}</td>
        <td class="num-col">${escapeHtml(String(p.hours))}</td>
        <td class="planner-actions">
          <button type="button" class="btn-icon" data-remove-person="${i}" aria-label="Remove ${escapeHtml(p.name)}">
            <span aria-hidden="true">×</span>
          </button>
        </td>
      </tr>`,
    )
    .join('');

  return `
    <section class="panel wizard-panel">
      <div>
        <h2 class="section-title">Who's doing the work?</h2>
        <p class="section-sub">
          Capacity is the whole point of this tool — it needs to know who's available and for how long.
          You can skip this and add people later; everything else works without it.
        </p>
      </div>

      <div class="form-grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1.5fr) minmax(0,0.8fr) auto;align-items:end">
        <label class="field">
          <span class="field-label">Name</span>
          <input class="input" id="wiz-person-name" value="${escapeHtml(wizard.person.name)}" placeholder="Alex Rivera" autocomplete="off" />
        </label>
        <label class="field">
          <span class="field-label">Role</span>
          <input class="input" id="wiz-person-role" value="${escapeHtml(wizard.person.role)}" placeholder="Analyst" autocomplete="off" />
        </label>
        <label class="field">
          <span class="field-label">Hours/week</span>
          <input class="input" id="wiz-person-hours" type="number" step="0.5" min="0" value="${escapeHtml(wizard.person.hours)}" />
        </label>
        <button type="button" class="btn btn-ghost" id="wiz-add-person">Add</button>
      </div>
      <p class="field-hint">
        Hours/week is time available for planned work — not a contracted week. 32 leaves room for the meetings and interruptions that always happen.
      </p>

      ${wizard.people.length
        ? `<div class="table-scroll">
             <table class="table">
               <thead><tr><th>Name</th><th>Role</th><th class="num-col">Hours/week</th><th></th></tr></thead>
               <tbody>${rows}</tbody>
             </table>
           </div>`
        : `<div class="empty">
             <span class="empty-title">No one added yet</span>
             <p class="empty-body">Add people above, or skip — the Team page can take them later.</p>
           </div>`}

      <div class="wizard-foot">
        <button type="button" class="btn btn-ghost" id="wiz-back">← Back</button>
        <div class="btn-row">
          <button type="button" class="btn btn-quiet" id="wiz-skip">Skip for now</button>
          <button type="button" class="btn btn-primary btn-lg" id="wiz-next">Review →</button>
        </div>
      </div>
    </section>`;
}

function stepReview(wizard, state) {
  const workspaceName = wizard.useNewWorkspace
    ? `${wizard.newWorkspaceName} (new)`
    : state.workspaces.find((w) => w.id === state.activeWorkspaceId)?.name || 'workspace';

  const rows = [
    ['Plan name', wizard.name],
    ['Runs', `${prettyDate(wizard.start)} → ${prettyDate(wizard.end)}`],
    ['Length', spanLabel(wizard)],
    ['Tracked by', wizard.granularity],
    ['Workspace', workspaceName],
    ['Team', wizard.people.length ? `${wizard.people.length} added` : 'none yet'],
  ];

  return `
    <section class="panel wizard-panel">
      <div>
        <h2 class="section-title">Ready to create</h2>
        <p class="section-sub">Nothing has been saved yet. Check it over, then create the plan.</p>
      </div>

      <div class="review-list">
        ${rows
          .map(
            ([key, value]) => `
          <div class="review-row">
            <span class="review-key">${escapeHtml(key)}</span>
            <span class="review-val">${escapeHtml(String(value))}</span>
          </div>`,
          )
          .join('')}
      </div>

      <p class="field-hint">Next you'll set up task types (fields and dependencies), then list the work itself.</p>

      <div class="wizard-foot">
        <button type="button" class="btn btn-ghost" id="wiz-back">← Back</button>
        <button type="button" class="btn btn-primary btn-lg" id="wiz-create">Create plan</button>
      </div>
    </section>`;
}

export function renderWizard({ state }) {
  const wizard = state.wizard;
  const isFirstPlan = !state.cycles.length;

  const head = `
    <div class="page-head">
      <p class="eyebrow">${isFirstPlan ? 'Getting started' : 'New plan'}</p>
      <h1 class="page-title">${isFirstPlan ? 'Set up your first plan' : 'Create another plan'}</h1>
      <p class="page-lead">
        Three short steps. The only things that really matter are a name and a date range —
        everything else can change later.
      </p>
    </div>`;

  const body =
    wizard.step === 1
      ? stepPlan(wizard, state)
      : wizard.step === 2
        ? stepTeam(wizard)
        : stepReview(wizard, state);

  const cancel =
    state.cycles.length > 0
      ? `<div class="btn-row"><button type="button" class="btn btn-quiet" id="wiz-cancel">Cancel</button></div>`
      : '';

  return `<div class="wizard">${head}${stepChips(wizard.step)}${body}${cancel}</div>`;
}
