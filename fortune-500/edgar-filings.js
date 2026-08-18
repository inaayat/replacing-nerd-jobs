/**
 * Pick the best annual filing from SEC submissions for inline-XBRL work.
 * Prefer the original 10-K / 20-F over a later 10-K/A amendment — amendments
 * often lack tagged HTML even when Company Facts already reflect the numbers.
 */

export const ANNUAL_FORMS = ['10-K', '10-K/A', '20-F', '20-F/A'];
const BASE_ANNUAL = new Set(['10-K', '20-F']);

export function latestAnnualFiling(submissions) {
  const recent = submissions?.filings?.recent;
  if (!recent?.form) return null;
  let amendment = null;
  for (let i = 0; i < recent.form.length; i += 1) {
    const form = recent.form[i];
    if (!ANNUAL_FORMS.includes(form)) continue;
    const filing = {
      form,
      accession: recent.accessionNumber[i],
      primary: recent.primaryDocument[i],
      filingDate: recent.filingDate[i],
    };
    if (BASE_ANNUAL.has(form)) return filing;
    if (!amendment) amendment = filing;
  }
  return amendment;
}
