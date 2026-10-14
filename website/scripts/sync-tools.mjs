// Génère la liste des outils de reference/tools.mdx à partir du registre réel de seshat-runtime.
// Usage : npm run sync:tools [-- --runtime <dossier de seshat-runtime>]
//
// Un petit programme Go (écrit dans <seshat-runtime>/.tmp_tools/, un dossier ignoré par ./...) construit
// builtin.NewBuiltinRegistry(), la même liste que celle d'un client sans aucune clé, et affiche chaque outil.
// Le script range les outils par thème et réécrit la page entre {/* generated:start */} et
// {/* generated:end */}. Le texte autour des marqueurs reste écrit à la main.
//
// Trois outils ne sont pas dans ce registre : l'outil agent, spawn_agent et resume_agent sont ajoutés par
// sdk.NewClient (pkg/sdk/client.go), donc la liste ci-dessous les ajoute à la main.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const ri = args.indexOf('--runtime');
const runtime = resolve(ri >= 0 ? args[ri + 1] : process.env.SESHAT_RUNTIME_DIR ?? '../../seshat-runtime');
const page = resolve('src/content/docs/en/reference/tools.mdx');
if (!existsSync(join(runtime, 'go.mod'))) { console.error(`seshat-runtime est introuvable : ${runtime}`); process.exit(2); }

const GO = `package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/KPO-Tech/seshat-runtime/internal/tools/builtin"
)

type row struct {
	Name        string \`json:"name"\`
	Category    string \`json:"category"\`
	Description string \`json:"description"\`
	ReadOnly    bool   \`json:"readOnly"\`
	Enabled     bool   \`json:"enabled"\`
}

func main() {
	reg, err := builtin.NewBuiltinRegistry()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	var rows []row
	for _, t := range reg.List() {
		d := t.Definition()
		desc := strings.TrimSpace(d.Description)
		if i := strings.Index(desc, "\\n"); i >= 0 {
			desc = strings.TrimSpace(desc[:i])
		}
		rows = append(rows, row{d.Name, d.Category, desc, d.IsReadOnly, t.IsEnabled()})
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].Name < rows[j].Name })
	_ = json.NewEncoder(os.Stdout).Encode(rows)
}
`;

const work = join(runtime, '.tmp_tools');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
writeFileSync(join(work, 'main.go'), GO);
const run = spawnSync('go', ['run', './.tmp_tools'], { cwd: runtime, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
rmSync(work, { recursive: true, force: true });
if (run.status !== 0) { console.error(run.stderr); process.exit(1); }
const tools = JSON.parse(run.stdout.trim().split('\n').pop());

// Outils ajoutés par sdk.NewClient (pkg/sdk/client.go).
tools.push(
  { name: 'agent', category: 'agents', description: 'Run a sub-agent on a focused task, with the tools of its type, and get its result back.', readOnly: false, enabled: true, sdk: true },
  { name: 'spawn_agent', category: 'agents', description: 'Start a background sub-agent on a task. It returns at once with an `agent_id`.', readOnly: false, enabled: true, sdk: true },
  { name: 'resume_agent', category: 'agents', description: 'Resume a sub-agent that has finished and give it a new task, with its history intact.', readOnly: false, enabled: true, sdk: true },
);

// Textes plus clairs que la première ligne de la description du modèle.
const TEXT = {
  tool_search: 'Find deferred tools (MCP tools, for example) that are not in the first tool list.',
  submit_plan: 'Submit a plan for your review while in plan mode.',
  enter_plan_mode: 'Enter plan mode, to explore and agree on a plan before changing anything.',
  exit_plan_mode: 'Leave plan mode once you have approved the submitted plan.',
  skill: 'Run a skill.',
  mcp: 'Call a tool of a connected MCP server.',
};

// Ce qu'il faut pour qu'un outil inactif devienne disponible.
const NEEDS = [
  [/^speech_to_text$/, 'a `SpeechToText` provider'],
  [/^text_to_speech$/, 'a `TextToSpeech` provider'],
  [/^generate_image$/, 'an `ImageGeneration` provider'],
  [/^code_complete$/, 'a fill-in-the-middle model'],
  [/^memory_/, 'the memory service (`EnableMemory`)'],
  [/^rag_/, 'a `RAGService`'],
  [/^submit_plan$/, 'a `PlanStore`'],
  [/^tool_search$/, '`EnableToolSearch`'],
  [/^reddit_/, 'the keys `reddit_client_id` and `reddit_client_secret`'],
  [/^youtube_/, 'the key `youtube_api_key`'],
  [/^places_/, 'the key `google_places_api_key`'],
  [/^trustpilot_/, 'the key `trustpilot_api_key`'],
];
const PLANNED = (t) => !t.enabled && (['notifications', 'vcs'].includes(t.category) || /^(twitter_|whatsapp_)/.test(t.name));

const GROUPS = [
  ['Files, shell and documents', ['filesystem']],
  ['Skills', []],
  ['Web and browser', ['web', 'browser']],
  ['Research and communities', ['research', 'social']],
  ['Notebooks', ['notebook']],
  ['Code and context', ['code_intelligence', 'context', 'configuration', 'code']],
  ['Plans, tasks and goals', ['planning', 'mode', 'task', 'goal']],
  ['Sub-agents', ['agents']],
  ['Worktrees', ['worktree']],
  ['Scheduling', ['automation']],
  ['Memory and knowledge', ['memory', 'rag']],
  ['Media', ['audio', 'creative']],
  ['Calculation', ['math']],
  ['Interaction and control', ['interaction', 'permissions', 'process', 'mcp', 'meta']],
];

const plannedTools = tools.filter(PLANNED);
const live = tools.filter((t) => !PLANNED(t));
const seen = new Set();
// Première phrase seulement (les descriptions du registre sont écrites pour le modèle), sans tiret cadratin.
function short(text) {
  let t = text.replace(/—/g, '-').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.{20,}?[.!?])\s+[A-Z]/);
  if (m) t = m[1];
  if (t.length > 160) t = t.slice(0, 157).replace(/\s+\S*$/, '') + '...';
  return t;
}
const cell = (s) => short(s).replace(/\|/g, '\\|');
const out = [];
const active = tools.filter((t) => t.enabled).length;
out.push(`The runtime registers **${tools.length - 3} tools**, and \`sdk.NewClient\` adds 3 more (\`agent\`, \`spawn_agent\`, \`resume_agent\`). **${active - 3} of the registered ones are active in an environment with no key, no provider and no service configured**; the others wait for what the last column names. \`client.ToolNames()\` lists the active ones only.`);
out.push('');

for (const [title, cats] of GROUPS) {
  const rows2 = title === 'Skills'
    ? live.filter((t) => t.name === 'skill' || t.name.startsWith('seshat_'))
    : live.filter((t) => cats.includes(t.category) && !seen.has(t.name));
  if (!rows2.length) continue;
  rows2.forEach((t) => seen.add(t.name));
  out.push(`### ${title}`, '', '| Tool | What it does | Read-only | Available |', '|---|---|---|---|');
  for (const t of rows2.sort((a, b) => a.name.localeCompare(b.name))) {
    const need = NEEDS.find(([re]) => re.test(t.name));
    let avail = t.enabled ? 'Yes' : need ? `With ${need[1]}` : 'Depends on the host';
    if (t.category === 'automation') avail = 'With `AutomationServiceURL`';
    out.push(`| \`${t.name}\` | ${cell(TEXT[t.name] ?? t.description)} | ${t.readOnly ? 'Yes' : 'No'} | ${avail} |`);
  }
  out.push('');
}
const missed = live.filter((t) => !seen.has(t.name));
if (missed.length) { console.error('outils sans groupe : ' + missed.map((t) => `${t.name} (${t.category})`).join(', ')); process.exit(1); }

out.push('### Planned, not active', '', 'These tools are registered but always off. They have no working implementation yet: do not count on them.', '', '| Tool | What it was meant to do |', '|---|---|');
for (const t of plannedTools.sort((a, b) => a.name.localeCompare(b.name))) out.push(`| \`${t.name}\` | ${cell(t.description)} |`);
out.push('');

const text = readFileSync(page, 'utf8').replace(/\r\n/g, '\n');
const a = text.indexOf('{/* generated:start */}');
const b = text.indexOf('{/* generated:end */}');
if (a < 0 || b < 0) { console.error('marqueurs introuvables dans reference/tools.mdx'); process.exit(1); }
const next = `${text.slice(0, a)}{/* generated:start */}\n${out.join('\n')}\n${text.slice(b)}`;
// --check : ne rien écrire, échouer si la page ne correspond plus au registre (la date `updated` est ignorée).
if (args.includes('--check')) {
  const strip = (s) => s.replace(/^updated: "[0-9-]+"$/m, '');
  if (strip(next) !== strip(text)) { console.error('reference/tools.mdx ne correspond plus au registre : lancez npm run sync:tools'); process.exit(1); }
  console.log('reference/tools.mdx est à jour.');
  process.exit(0);
}
const today = new Date().toISOString().slice(0, 10);
writeFileSync(page, next.replace(/^updated: "[0-9-]+"$/m, `updated: "${today}"`));
console.log(`${tools.length} outils (${active} actifs), ${plannedTools.length} prévus et inactifs. Page mise à jour.`);
