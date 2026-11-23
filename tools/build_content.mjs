// Cases are written as Markdown: one German file per case, and one file per
// translation next to it. This turns them into the two kinds of JSON the app
// and the proxy read. `pnpm content` runs it, and so do dev, test and build.
//
//   content/base.json               county, languages, authorities, and the
//                                   order of the cases on the home screen
//   content/lang/<code>.json        UI strings and authority names
//   content/cases/<id>.md           German: icon, authority, title, steps
//   content/cases/<id>.<code>.md    the same case in another language
//
//   -> public/data/structure.json, public/data/lang/<code>.json
//
// A mistake in the content stops the build and names the file. A case that is
// not translated yet is no mistake: the app leaves its tile out in that
// language.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_STEPS = 7; // more is not one case, or not one an app should walk through

// A case file: an optional head of "key: value" lines between two --- lines,
// a # title, then ## sections. A section is a list or plain lines; either way
// it comes back as its lines without the list markers.
export function parseCase(source) {
  const lines = source.replace(/\r/g, '').split('\n');
  const head = {};
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end < 0) throw new Error('the head opened with --- is never closed');
    for (const line of lines.slice(1, end)) {
      const colon = line.indexOf(':');
      if (colon > 0) head[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
    lines.splice(0, end + 1);
  }

  let title = '';
  let section = null;
  const sections = {};
  for (const line of lines) {
    if (line.startsWith('# ')) title = line.slice(2).trim();
    else if (line.startsWith('## ')) sections[(section = line.slice(3).trim())] = [];
    else if (line.trim() && section) sections[section].push(line.replace(/^\s*(\d+\.|-)\s+/, '').trim());
  }
  return { head, title, sections };
}

// base: content/base.json, packs: { fa: content/lang/fa.json, ... },
// files: { 'wohngeld.md': '...', 'wohngeld.fa.md': '...' }
export function compile({ base, packs, files }) {
  const problems = [];
  const codes = base.languages.map((language) => language.code);

  for (const code of codes) {
    if (!packs[code]) problems.push(`content/lang/${code}.json is missing`);
  }
  for (const name of Object.keys(files)) {
    const [id, code] = name.replace(/\.md$/, '').split('.');
    if (!base.topics.includes(id)) problems.push(`${name}: "${id}" is not in the topics list of base.json`);
    if (code && !codes.includes(code)) problems.push(`${name}: base.json has no language "${code}"`);
  }

  const out = Object.fromEntries(codes.map((code) => [code, { ...packs[code], topics: {} }]));

  const topics = base.topics.map((id) => {
    const name = `${id}.md`;
    if (!files[name]) {
      problems.push(`${name} is missing, but "${id}" is in the topics list of base.json`);
      return null;
    }
    const german = parseCase(files[name]);
    const steps = german.sections.Schritte || [];
    const deadline = (german.sections.Frist || []).join(' ');
    const { icon, authority, urgency } = german.head;

    if (!german.title) problems.push(`${name}: no # title`);
    if (!icon) problems.push(`${name}: no icon`);
    if (!steps.length) problems.push(`${name}: no steps under ## Schritte`);
    if (steps.length > MAX_STEPS) problems.push(`${name}: ${steps.length} steps, at most ${MAX_STEPS}`);
    if (authority && !base.authorities[authority]) problems.push(`${name}: base.json has no authority "${authority}"`);
    if (urgency && urgency !== 'high') problems.push(`${name}: urgency is "high" or left out`);

    for (const code of codes) {
      const translated = `${id}.${code}.md`;
      if (!files[translated]) continue;
      const text = parseCase(files[translated]);
      const own = text.sections.Schritte || [];
      const ownDeadline = (text.sections.Frist || []).join(' ');

      if (!text.title) problems.push(`${translated}: no # title`);
      if (own.length !== steps.length) {
        problems.push(`${translated}: ${own.length} steps, the German file has ${steps.length}`);
      }
      if (Boolean(ownDeadline) !== Boolean(deadline)) {
        problems.push(`${translated}: ## Frist must be there exactly when the German file has one`);
      }

      out[code].topics[id] = {
        name: text.title,
        ...(ownDeadline && { deadline: ownDeadline }),
        keywords: text.sections['Stichwörter'] || [],
        steps: Object.fromEntries(own.map((step, index) => [index + 1, step])),
      };
    }

    return {
      id,
      icon,
      de: german.title,
      ...(authority && { authority }),
      ...(urgency && { urgency }),
      ...(deadline && { deadline_de: deadline }),
      steps: steps.map((step, index) => ({ id: index + 1, de: step })),
    };
  });

  if (problems.length) throw new Error(problems.join('\n'));
  return { structure: { ...base, topics }, packs: out };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(import.meta.dirname, '..');
  const json = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
  const write = (path, data) => writeFileSync(join(root, path), `${JSON.stringify(data, null, 2)}\n`);

  const base = json('content/base.json');
  const packs = Object.fromEntries(
    readdirSync(join(root, 'content/lang')).map((file) => [file.replace('.json', ''), json(`content/lang/${file}`)])
  );
  const files = Object.fromEntries(
    readdirSync(join(root, 'content/cases')).map((file) => [file, readFileSync(join(root, 'content/cases', file), 'utf8')])
  );

  try {
    const built = compile({ base, packs, files });
    mkdirSync(join(root, 'public/data/lang'), { recursive: true });
    write('public/data/structure.json', built.structure);
    for (const [code, pack] of Object.entries(built.packs)) write(`public/data/lang/${code}.json`, pack);
  } catch (err) {
    console.error(`Content does not build:\n${err.message}`);
    process.exit(1);
  }
}
