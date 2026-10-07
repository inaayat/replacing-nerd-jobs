/**
 * Resume bullets & knowledge page. Browser-safe, import-free ESM.
 * One tab is visible at a time. The list renders its controls immediately.
 */

export const BOOK_TABS = [
  { id: 'experiences', label: 'Resume bullets', kind: 'log' },
  { id: 'knowledge', label: 'Knowledge', kind: 'kb' },
];

export const STAR_FIELDS = [
  { key: 'situation', label: 'Situation' },
  { key: 'task', label: 'Task' },
  { key: 'action', label: 'Action' },
  { key: 'result', label: 'Result' },
];

export const SHARED_BULLET_FIELDS = [
  { key: 'jobId', label: 'Job', kind: 'job' },
  { key: 'title', label: 'Resume line', kind: 'rich' },
  ...STAR_FIELDS.map((field) => ({ ...field, kind: 'star' })),
  { key: 'notes', label: 'Notes', kind: 'notes' },
];

export function sharedBulletValues(entry) {
  const row = entry || {};
  return {
    id: row.id || '',
    jobId: row.jobId || '',
    title: row.title || '',
    rich: row.rich || null,
    situation: row.situation || '',
    task: row.task || '',
    action: row.action || '',
    result: row.result || '',
    notes: row.notes || '',
  };
}

export function sharedBulletSpec(entry) {
  const values = sharedBulletValues(entry);
  return {
    ...values,
    fields: SHARED_BULLET_FIELDS.map((field) => ({
      ...field,
      value: field.key === 'title' ? values.title : values[field.key] || '',
    })),
  };
}

export function homeStartCards() {
  return [
    { key: 'postings', view: { kind: 'jobs' } },
    { key: 'resume', view: { kind: 'profile' } },
    { key: 'book', view: { kind: 'log' }, combined: true },
  ];
}

export function bookPagePlan(view) {
  if (!view || (view.kind !== 'log' && view.kind !== 'kb')) return null;
  const noteId = view.kind === 'kb' && view.id && view.id !== 'new' ? view.id : '';
  return {
    experiences: true,
    knowledge: true,
    focus: view.kind === 'kb' ? 'knowledge' : 'experiences',
    tabs: BOOK_TABS,
    knowledgeId: noteId,
    addExperiences: view.kind === 'log' && view.id === 'new',
    addKnowledge: view.kind === 'kb' && view.id === 'new',
  };
}

export const JOB_CATALOG_SAVE_MS = 300;

export function jobCatalogFocusKeys(jobId) {
  const id = String(jobId || '');
  return {
    company: `job-co-${id}`,
    title: `job-title-${id}`,
    dates: `job-dates-${id}`,
    location: `job-loc-${id}`,
  };
}

// Typing and leaving a Jobs field save the row. They do not render, and they
// do not hand a focus key back to restoreFocus — that loop traps the caret.
export function jobCatalogEditEffects(eventType) {
  if (eventType !== 'input' && eventType !== 'blur') return { save: false, render: false };
  return { save: true, render: false };
}

export function experienceAdderChrome(open) {
  const isOpen = Boolean(open);
  return {
    open: isOpen,
    showForm: isOpen,
    addLabel: isOpen ? 'Add' : '+ New',
    showCancel: isOpen,
  };
}

export function nextExperienceAdderOpen(action, wasOpen = false) {
  if (action === 'new' || action === 'compose-new') return true;
  if (action === 'save' || action === 'cancel' || action === 'pick') return false;
  return Boolean(wasOpen);
}

export function resumeBulletArrows(index, length, { groupIndex = 0, groupCount = 1 } = {}) {
  const i = Number(index) || 0;
  const n = Number(length) || 0;
  const gi = Number(groupIndex) || 0;
  const gc = Number(groupCount) || 0;
  return {
    disableUp: n <= 0 || (i <= 0 && gi <= 0),
    disableDown: n <= 0 || (i >= n - 1 && gi >= Math.max(gc, 1) - 1),
  };
}

// Native ParentNode.append(null) becomes the text "null". Drop those
// before they reach the DOM (collapsed adders, optional chrome).
export function visibleNodes(...nodes) {
  return nodes.filter((node) => node != null && node !== false);
}

export function resumeGroupHasName(group) {
  return Boolean(String(group?.heading || '').trim());
}

export function resumeGroupChrome(groups, draftGroupId = '', posting = true) {
  const list = Array.isArray(groups) ? groups : [];
  const namedCount = list.filter(resumeGroupHasName).length;
  const draftId = String(draftGroupId || '');
  const hasDraft = Boolean(draftId && list.some((group) => group.id === draftId && !resumeGroupHasName(group)));
  return {
    namedCount,
    hasDraft,
    // A bullet's heading is the nearest named one above it. Empty groups
    // stay hidden on both surfaces, except the heading being typed.
    showDefaultAdd: namedCount === 0 && !hasDraft,
    showHeading(group) {
      if (resumeGroupHasName(group)) return true;
      return Boolean(draftId && group?.id === draftId);
    },
  };
}

export function experienceRowSpec(entry) {
  const spec = sharedBulletSpec(entry);
  return {
    id: spec.id,
    bullet: spec.title,
    requiresInteraction: false,
    controls: spec.fields
      .filter((field) => field.kind === 'job' || field.kind === 'star')
      .map((field) => ({
        key: field.key,
        label: field.label,
        column: field.kind === 'job' ? 'lead' : 'star',
        kind: field.kind === 'job' ? 'job' : undefined,
        value: field.value,
      })),
  };
}
