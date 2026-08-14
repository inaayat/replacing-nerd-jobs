/**
 * Reusable build-checklist renderer for guided model construction.
 */

export function renderChecklist(steps, activeId, { onSelect, preview } = {}) {
  if (!steps.length) return { html: '', bind: () => {} };
  const items = steps
    .map((step, i) => {
      const active = step.id === activeId;
      const status = active ? 'active' : 'pending';
      return `<li class="fm-build-step is-${status}">
        <button type="button" class="fm-build-step-btn" data-build-step="${step.id}" aria-current="${active ? 'step' : 'false'}">
          <span class="fm-build-step-num">${i + 1}</span>
          <span class="fm-build-step-title">${escapeHtml(step.title)}</span>
        </button>
      </li>`;
    })
    .join('');

  const active = steps.find((s) => s.id === activeId) || steps[0];
  const previewHtml = preview
    ? `<p class="fm-build-preview"><strong>Live preview.</strong> ${escapeHtml(preview)}</p>`
    : '';
  const detail = active
    ? `<div class="fm-build-detail">
        <p class="fm-build-instruction">${escapeHtml(active.instruction)}</p>
        ${active.formula ? `<p class="fm-build-formula"><strong>Formula.</strong> ${escapeHtml(active.formula)}</p>` : ''}
        ${previewHtml}
      </div>`
    : '';

  const html = `<nav class="fm-build-checklist" aria-label="Build steps">
    <ol class="fm-build-steps">${items}</ol>
    ${detail}
  </nav>`;

  return {
    html,
    bind(wrap) {
      wrap.querySelectorAll('[data-build-step]').forEach((btn) => {
        btn.onclick = () => onSelect?.(btn.dataset.buildStep);
      });
    },
  };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

export function previewForStep(step, context) {
  const { model, dcf, comps, assumptions, peers } = context;
  if (!step?.previewKey) return null;
  const scale = model?.scale ?? 1e6;
  const fmtM = (n) =>
    n == null || !Number.isFinite(n) ? '—' : (n / scale).toLocaleString('en-US', { maximumFractionDigits: 0 });

  switch (step.previewKey) {
    case 'revenue': {
      const row = model?.rows?.find((r) => r.offset === 1);
      return row ? `Year 1 revenue: $${fmtM(row.revenue)}m` : null;
    }
    case 'ebit': {
      const row = model?.rows?.find((r) => r.offset === 1);
      return row ? `Year 1 EBIT: $${fmtM(row.ebit)}m` : null;
    }
    case 'receivables': {
      const row = model?.rows?.find((r) => r.offset === 1);
      return row ? `Year 1 receivables: $${fmtM(row.receivables)}m` : null;
    }
    case 'capex': {
      const row = model?.rows?.find((r) => r.offset === 1);
      return row ? `Year 1 CapEx: $${fmtM(row.capex)}m` : null;
    }
    case 'interestExpense': {
      const row = model?.rows?.find((r) => r.offset === 1);
      return row ? `Year 1 interest: $${fmtM(row.interestExpense)}m` : null;
    }
    case 'cash': {
      const row = model?.rows?.find((r) => r.offset === 1);
      return row ? `Year 1 cash plug: $${fmtM(row.cash)}m` : null;
    }
    case 'balanceCheck': {
      const ok = model?.checks?.balances;
      return ok ? 'Balance sheet ties in every year' : 'Balance sheet does NOT tie';
    }
    case 'unleveredFcf': {
      const row = model?.rows?.find((r) => r.offset === 1);
      return row ? `Year 1 unlevered FCF: $${fmtM(row.unleveredFcf)}m` : null;
    }
    case 'wacc':
      return dcf?.ok ? `WACC: ${((dcf.wacc?.wacc ?? 0) * 100).toFixed(2)}%` : null;
    case 'terminalValue':
      return dcf?.ok && dcf.terminalValue != null
        ? `Terminal value: $${fmtM(dcf.terminalValue)}m (${((dcf.terminalShare ?? 0) * 100).toFixed(0)}% of EV)`
        : null;
    case 'enterpriseValue':
      return dcf?.ok ? `Enterprise value: $${fmtM(dcf.enterpriseValue)}m` : null;
    case 'impliedPrice':
      return dcf?.ok && dcf.impliedPrice != null ? `Implied price: $${dcf.impliedPrice.toFixed(2)}` : null;
    case 'peerCount':
      return `${peers?.length ?? 0} peer${peers?.length === 1 ? '' : 's'} selected`;
    case 'missingMultiples':
      return comps?.ok ? 'Missing multiples excluded from median' : 'Add peers with filed data';
    case 'evRevenue':
      return comps?.self?.evRevenue != null ? `Your EV/Revenue: ${comps.self.evRevenue.toFixed(1)}×` : null;
    case 'medianMultiple':
      return comps?.stats?.evRevenue?.median != null
        ? `Peer median EV/Revenue: ${comps.stats.evRevenue.median.toFixed(1)}×`
        : null;
    case 'impliedCompsPrice': {
      const imp = comps?.implied?.[0];
      return imp?.pricePerShare != null ? `Implied price: $${imp.pricePerShare.toFixed(2)}` : null;
    }
    case 'dcfVsComps': {
      if (!dcf?.impliedPrice || !comps?.implied?.[0]?.pricePerShare) return 'Compare once both DCF and comps have prices';
      const diff = dcf.impliedPrice - comps.implied[0].pricePerShare;
      return `DCF − comps: $${diff.toFixed(2)} per share`;
    }
    default:
      return null;
  }
}
