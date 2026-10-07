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

export function experienceRowSpec(entry) {
  const row = entry || {};
  return {
    id: row.id || '',
    bullet: row.title || '',
    requiresInteraction: false,
    controls: [
      { key: 'jobId', label: 'Job', column: 'lead', kind: 'job', value: row.jobId || '' },
      ...STAR_FIELDS.map((field) => ({
        key: field.key,
        label: field.label,
        column: 'star',
        value: row[field.key] || '',
      })),
    ],
  };
}
