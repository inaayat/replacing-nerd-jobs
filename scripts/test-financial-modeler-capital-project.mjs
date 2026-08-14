import assert from 'node:assert/strict';
import { runCapitalProject, defaultCapitalProjectAssumptions } from '../financial-modeler/capital-project.js';

const model = runCapitalProject(defaultCapitalProjectAssumptions());
assert.equal(model.ok, true);
assert.ok(model.returns.projectIrr != null || model.returns.equityIrr != null);
assert.ok(model.totalCapex > 0);
assert.ok(model.rows.some((r) => r.operating));
assert.equal(model.checks.sourcesUses, true);
console.log('test-financial-modeler-capital-project: ok');
