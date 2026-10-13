// Génère les tableaux de reference/configuration-file.mdx à partir des structures du fichier de configuration
// (seshat-runtime/internal/seshattui/config/config.go) : clés, types, valeurs par défaut et descriptions
// viennent des balises `json:` et `jsonschema:` du code.
// Usage : npm run sync:config-file [-- --runtime <dossier de seshat-runtime>]
// Le texte autour des marqueurs {/* generated:start */} et {/* generated:end */} reste écrit à la main.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const ri = args.indexOf('--runtime');
const runtime = resolve(ri >= 0 ? args[ri + 1] : process.env.SESHAT_RUNTIME_DIR ?? '../../seshat-runtime');
const source = join(runtime, 'internal/seshattui/config/config.go');
const page = resolve('src/content/docs/en/reference/configuration-file.mdx');
if (!existsSync(source)) { console.error(`introuvable : ${source}`); process.exit(2); }

const go = readFileSync(source, 'utf8').replace(/\r\n/g, '\n');

function structFields(name) {
  const start = go.indexOf(`type ${name} struct {`);
  if (start < 0) throw new Error(`structure introuvable : ${name}`);
  const end = go.indexOf('\n}\n', start);
  const fields = [];
  for (const line of go.slice(start, end).split('\n').slice(1)) {
    const m = line.match(/^\t([A-Z]\w*)\s+(\S+)\s+`json:"([^"]*)"(?:\s+jsonschema:"((?:[^"\\]|\\.)*)")?`/);
    if (!m) continue;
    const key = m[3].split(',')[0];
    if (!key || key === '-') continue;
    fields.push({ key, goType: m[2], schema: m[4] ?? '' });
  }
  return fields;
}

function parseSchema(text) {
  // Les virgules d'un texte sont échappées par une barre oblique inverse dans la balise.
  const parts = text.split(/(?<!\\),/).map((p) => p.replace(/\\\\?,/g, ',').replace(/\\"/g, '"').trim()).filter(Boolean);
  const out = { enums: [], examples: [] };
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 0) { if (p === 'required') out.required = true; continue; }
    const k = p.slice(0, eq);
    const v = p.slice(eq + 1);
    if (k === 'description') out.description = v;
    else if (k === 'default') out.default = v;
    else if (k === 'enum') out.enums.push(v);
    else if (k === 'example') out.examples.push(v);
  }
  return out;
}

function typeName(t) {
  t = t.replace(/^\*/, '');
  if (t === 'bool') return 'boolean';
  if (/^u?int/.test(t) || /^float/.test(t) || t === 'time.Duration') return t === 'time.Duration' ? 'duration' : 'number';
  if (t === 'string' || t.startsWith('catwalk.Type') || /^(MCPType|SelectedModelType|TrailerStyle)$/.test(t)) return 'string';
  if (t.startsWith('[]')) return `list of ${typeName(t.slice(2))}s`;
  if (t.startsWith('map[')) return 'object';
  return 'object';
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/—/g, '-');

function table(structName, { prefix = '' } = {}) {
  const rows = structFields(structName).map((f) => {
    const s = parseSchema(f.schema);
    let desc = s.description ?? '';
    if (s.enums.length) {
      // La liste des valeurs vient de `enum=` : on retire un « Options: ... » écrit à la main dans la description.
      desc = desc.replace(/\s*Options:.*$/, '').trim();
      if (desc && !/[.!?]$/.test(desc)) desc += '.';
      desc += `${desc ? ' ' : ''}One of ${s.enums.map((e) => `\`${e}\``).join(', ')}.`;
    }
    return `| \`${prefix}${f.key}\` | ${typeName(f.goType)}${s.required ? ', required' : ''} | ${s.default !== undefined ? `\`${cell(s.default)}\`` : ''} | ${cell(desc)} |`;
  });
  return ['| Key | Type | Default | Meaning |', '|---|---|---|---|', ...rows, ''].join('\n');
}

const sections = [
  ['`models`', 'One entry per model type, `large` and `small`. Each entry has these keys.', 'SelectedModel'],
  ['`providers`', 'One entry per provider, named by its id. Each entry has these keys.', 'ProviderConfig'],
  ['`mcp`', 'One entry per MCP server, named by you. Each entry has these keys. In `mcp`, `type` is `stdio`, `sse` or `http`.', 'MCPConfig'],
  ['`lsp`', 'One entry per language server, named by you. Each entry has these keys.', 'LSPConfig'],
  ['`options`', 'General options.', 'Options'],
  ['`options.tui`', 'Options of the terminal interface.', 'TUIOptions'],
  ['`options.attribution`', 'What Seshat adds to commit messages, issues and pull requests it writes.', 'Attribution'],
  ['`permissions`', 'Which tools do not ask for approval.', 'Permissions'],
  ['`tools.ls`', 'Settings of the directory listing tool.', 'ToolLs'],
  ['`tools.grep`', 'Settings of the search tool.', 'ToolGrep'],
  ['`hooks`', 'A map from an event name to a list of shell hooks. Each hook has these keys. Today `seshat` reads the `pre_tool_use` event.', 'HookConfig'],
  ['`image_generation`', 'The provider behind the image tool.', 'ImageGenerationConfig'],
  ['`text_to_speech`', 'The provider behind the text-to-speech tool.', 'TextToSpeechConfig'],
  ['`speech_to_text`', 'The provider behind the speech-to-text tool.', 'SpeechToTextConfig'],
];

const out = [];
for (const [title, lead, struct] of sections) out.push(`### ${title}`, '', lead, '', table(struct));

const text = readFileSync(page, 'utf8').replace(/\r\n/g, '\n');
const a = text.indexOf('{/* generated:start */}');
const b = text.indexOf('{/* generated:end */}');
if (a < 0 || b < 0) { console.error('marqueurs introuvables dans reference/configuration-file.mdx'); process.exit(1); }
const today = new Date().toISOString().slice(0, 10);
const next = `${text.slice(0, a)}{/* generated:start */}\n${out.join('\n')}\n${text.slice(b)}`.replace(/^updated: "[0-9-]+"$/m, `updated: "${today}"`);
writeFileSync(page, next);
console.log(`${sections.length} sections générées.`);
