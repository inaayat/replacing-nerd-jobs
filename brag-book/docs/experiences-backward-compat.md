# Experiences — backward compatibility gate

This guarantee applies to **every Experiences phase** and blocks shipping if it fails.

## Promise

Books built before Experiences (schema 3 exports, posting resumes, Resume basics, saved resume snapshots) must behave as follows:

1. **Render unchanged** — After upgrade (`normalizeStore`), client load/save, server preservation for old tabs, and full-book JSON export/import, compiled editor documents and preview/print HTML for Resume basics, each posting resume, and each saved snapshot stay **byte-identical** to the pre-upgrade baseline.
2. **Stored resume records unchanged** — The same operations must not alter resume-related persistence: profile, career `jobs`, posting `resume` variants, requirements, entry wording/STAR (ignoring additive empty `experienceId`), and frozen snapshot `doc`/`fit` payloads.
3. **Grouping is non-destructive** — Creating an experience and assigning bullets to it later must **not** change any existing resume’s content, order, fit, or HTML/PDF output.

Additive root fields (`v: 4`, `experiences: []`, `experienceGroupingBackups: []`) and membership fields on entries are allowed; resume surfaces are not.

## Test

```bash
node scripts/test-brag-book-experiences-backward-compat.mjs
```

Fixtures live under `scripts/fixtures/brag-book/` (`pre-experiences-v3-export.json`, `schema-3-sample.json`). Run this together with `test-brag-book-experiences-preservation.mjs` and the full `test-brag-book*` suite (including PWA sync guarantees) before merging Experiences work.

Implementation: `brag-book/experiences-backward-compat.js`.
