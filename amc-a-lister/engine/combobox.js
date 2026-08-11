/**
 * Keyboard support for the search dropdowns.
 *
 * The movie and theater pickers were mouse-only: no arrow keys, no combobox
 * semantics, and pressing Enter with the list open submitted the surrounding
 * form instead of choosing the highlighted result.
 */

/**
 * @param {HTMLInputElement} input
 * @param {HTMLElement} resultsEl container whose direct children are <button>s
 * @param {{ onSelect?: (btn: HTMLButtonElement) => void }} [opts]
 */
export function wireComboboxKeys(input, resultsEl, { onSelect } = {}) {
  if (!input || !resultsEl) return;

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-autocomplete', 'list');
  resultsEl.setAttribute('role', 'listbox');

  const options = () => [...resultsEl.querySelectorAll('button')];
  const isOpen = () => !resultsEl.hidden && options().length > 0;

  const highlight = (next) => {
    const opts = options();
    opts.forEach((o, i) => {
      const active = i === next;
      o.classList.toggle('is-active', active);
      o.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) o.scrollIntoView({ block: 'nearest' });
    });
    input.setAttribute('aria-activedescendant', opts[next]?.id || '');
  };

  const activeIndex = () => options().findIndex((o) => o.classList.contains('is-active'));

  // The results list is re-rendered on every keystroke, so keep the ARIA state
  // and option ids in sync rather than setting them once.
  const observer = new MutationObserver(() => {
    input.setAttribute('aria-expanded', isOpen() ? 'true' : 'false');
    options().forEach((o, i) => {
      if (!o.id) o.id = `${input.id || 'cb'}-opt-${i}`;
      o.setAttribute('role', 'option');
      if (!o.hasAttribute('aria-selected')) o.setAttribute('aria-selected', 'false');
    });
  });
  observer.observe(resultsEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      resultsEl.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      return;
    }
    if (!isOpen()) return;

    const opts = options();
    const current = activeIndex();

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlight(current < opts.length - 1 ? current + 1 : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlight(current > 0 ? current - 1 : opts.length - 1);
    } else if (e.key === 'Enter' && current >= 0) {
      // Choose the highlighted result instead of submitting the form.
      e.preventDefault();
      const btn = opts[current];
      if (onSelect) onSelect(btn);
      else btn.click();
    }
  });
}
