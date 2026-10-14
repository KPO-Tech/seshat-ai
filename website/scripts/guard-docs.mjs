// Lance tous les contrôles qui comparent la documentation au code de seshat-runtime.
// Usage : npm run guard:docs [-- --runtime <dossier de seshat-runtime>]
//
// Il faut un clone de seshat-runtime à côté du dépôt (../../seshat-runtime), ou --runtime, ou la variable
// SESHAT_RUNTIME_DIR. Les contrôles ne modifient aucun fichier.
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const ri = args.indexOf('--runtime');
const runtimeArgs = ri >= 0 ? ['--runtime', args[ri + 1]] : [];

const steps = [
  ['Tableau des outils (reference/tools.mdx)', 'scripts/sync-tools.mjs', ['--check']],
  ['Clés du fichier de configuration', 'scripts/sync-config-file.mjs', ['--check']],
  ['Champs de ClientConfig', 'scripts/check-client-config.mjs', []],
  ['Variables d\'environnement', 'scripts/check-env-vars.mjs', []],
  ['Affirmations vérifiables dans le code', 'scripts/check-doc-claims.mjs', []],
  ['Extraits Go', 'scripts/check-go-snippets.mjs', []],
];

const failed = [];
for (const [label, script, extra] of steps) {
  console.log(`\n== ${label}`);
  const r = spawnSync(process.execPath, [script, ...extra, ...runtimeArgs], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(label);
}

console.log('\n' + (failed.length ? `ÉCHEC : ${failed.length} contrôle(s) en échec :\n  - ${failed.join('\n  - ')}` : 'Tous les contrôles passent.'));
process.exit(failed.length ? 1 : 0);
