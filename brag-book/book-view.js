/**
 * Combined Experiences + Knowledge page. Browser-safe, import-free ESM.
 * The list renders these controls immediately — nothing is behind a click.
 */

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
    knowledgeId: noteId,
    addExperiences: view.kind === 'log' && view.id === 'new',
    addKnowledge: view.kind === 'kb' && view.id === 'new',
  };
}

export function experienceRowSpec(entry) {
  const row = entry || {};
  return {
    id: row.id || '',
    bullet: row.title || '',
    requiresInteraction: false,
    controls: [
      { key: 'company', label: 'Job', column: 'lead', value: row.company || '' },
      { key: 'role', label: 'Role', column: 'lead', value: row.role || '' },
      ...STAR_FIELDS.map((field) => ({
        key: field.key,
        label: field.label,
        column: 'star',
        value: row[field.key] || '',
      })),
    ],
  };
}
