// Routing inspector. Loaded only when the URL carries ?debug — never on the
// path a real user takes.
//
// Self-contained on purpose: it builds its own markup and injects its own
// styles, so deleting this one file removes the feature completely. It is
// styled as a console strip rather than as part of the app, because the whole
// point is that you can tell at a glance which part is the product and which
// part is the instrument.

import { route } from './router.js';

const STYLES = `
.dbg {
  position: fixed; inset-inline: 0; bottom: 0; z-index: 9999;
  max-height: 45vh; display: flex; flex-direction: column;
  background: #14161a; color: #c9d1d9;
  font: 12px/1.5 ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace;
  border-top: 2px solid #30363d;
}
.dbg-bar {
  display: flex; align-items: center; gap: .5rem;
  padding: .35rem .6rem; background: #1f242c; color: #8b949e;
  font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
}
.dbg-bar b { color: #e3b341; font-weight: 600; letter-spacing: .04em; }
.dbg-close { margin-inline-start: auto; background: none; border: 0;
  color: #8b949e; font: inherit; cursor: pointer; padding: 0 .3rem; }
.dbg-try { display: flex; gap: .4rem; padding: .5rem .6rem; }
.dbg-try input {
  flex: 1; min-width: 0; background: #0d1117; color: #c9d1d9;
  border: 1px solid #30363d; border-radius: 4px; padding: .4rem .5rem;
  font: inherit;
}
.dbg-try button {
  background: #238636; color: #fff; border: 0; border-radius: 4px;
  padding: .4rem .8rem; font: inherit; cursor: pointer;
}
.dbg-out { overflow: auto; padding: 0 .6rem .6rem; }
.dbg-out:empty::before { content: "speak, or type a phrase above"; color: #6e7681; }
.dbg-row { display: flex; gap: .5rem; }
.dbg-k { color: #6e7681; flex: 0 0 5.5rem; }
.dbg-v { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.dbg-scores { margin: .4rem 0 0; border-top: 1px solid #30363d; padding-top: .4rem; }
.dbg-s { display: flex; gap: .5rem; }
.dbg-s.hit .dbg-sc { color: #3fb950; }
.dbg-sc { flex: 0 0 1.5rem; text-align: end; color: #6e7681; }
.dbg-sid { flex: 0 0 10rem; }
.dbg-hits { flex: 1; min-width: 0; color: #58a6ff; overflow-wrap: anywhere; }
.dbg-verdict { margin-top: .45rem; border-top: 1px solid #30363d;
  padding-top: .45rem; color: #e3b341; }
.dbg-verdict a { color: #58a6ff; }
`;

let topics = [];
let panel;
let out;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function row(key, value) {
  const line = el('div', 'dbg-row');
  line.append(el('span', 'dbg-k', key), el('span', 'dbg-v', value));
  return line;
}

function render(transcript, result, source) {
  const trace = result.trace || {};
  out.textContent = '';

  out.append(row('heard', transcript));
  if (trace.normalized != null && trace.normalized !== transcript) {
    out.append(row('normalized', trace.normalized));
  }
  out.append(row('via', `${source} · router=${trace.mode || '?'}`));

  if (trace.scores?.length) {
    const table = el('div', 'dbg-scores');
    for (const s of trace.scores) {
      const line = el('div', `dbg-s${s.score > 0 ? ' hit' : ''}`);
      line.append(
        el('span', 'dbg-sc', String(s.score)),
        el('span', 'dbg-sid', s.id),
        el('span', 'dbg-hits', s.hits?.join(' · ') || '')
      );
      table.append(line);
    }
    out.append(table);
  }

  const verdict = el('div', 'dbg-verdict');
  if (result.slug) {
    verdict.append(document.createTextNode(`→ ${result.slug} (${result.confidence.toFixed(2)}) — ${trace.reason || ''} `));
    const go = el('a', null, 'open');
    go.href = `#/topic/${result.slug}`;
    verdict.append(go);
  } else {
    verdict.textContent = `→ no match — ${trace.reason || ''} · asks: "${result.clarify || ''}"`;
  }
  out.append(verdict);
}

async function tryPhrase(phrase) {
  if (!phrase.trim()) return;
  render(phrase, await route(phrase, topics), 'typed');
}

export function initDebug(topicList) {
  topics = topicList;

  document.head.append(el('style', null, STYLES));

  panel = el('div', 'dbg');
  panel.dir = 'ltr'; // ids, scores and keys read left-to-right whatever the app does

  const bar = el('div', 'dbg-bar');
  bar.append(el('b', null, 'debug'), el('span', null, 'voice routing — not part of the app'));
  const close = el('button', 'dbg-close', '✕');
  close.type = 'button';
  close.addEventListener('click', () => panel.remove());
  bar.append(close);

  const form = el('form', 'dbg-try');
  const input = el('input');
  input.placeholder = 'type a test phrase…';
  input.autocomplete = 'off';
  const submit = el('button', null, 'route');
  submit.type = 'submit';
  form.append(input, submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    tryPhrase(input.value);
  });

  out = el('div', 'dbg-out');
  panel.append(bar, form, out);
  document.body.append(panel);

  document.addEventListener('compass:route', (event) => {
    const { transcript, result, source } = event.detail;
    render(transcript, result, source);
  });
}
