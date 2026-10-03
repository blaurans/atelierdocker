/**
 * Mini-renderer Markdown pour les missions.
 *
 * Le contenu pédagogique est rédigé par des humains : il ne doit jamais
 * pouvoir injecter de HTML dans la page. On n'utilise donc pas innerHTML
 * avec du HTML issu des quêtes, mais une construction par nœuds DOM.
 *
 * Sous-ensemble supporté (cf. docs/CONTRACTS.md § 1.1) :
 *   # titre, paragraphes, listes - et 1., ```bash, **gras** *italique* `code`
 *   [lien](http://…)
 */
export function renderMarkdown(source) {
  const root = document.createDocumentFragment();
  const lines = String(source ?? '').replace(/\r\n/g, '\n').split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Bloc de code : on lit jusqu'à la fence de fermeture.
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const buf = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // fence fermante
      root.appendChild(codeBlock(buf.join('\n'), lang));
      continue;
    }

    // Titre
    if (/^#\s+/.test(line)) {
      root.appendChild(el('h3', inline(line.replace(/^#\s+/, ''))));
      i += 1;
      continue;
    }

    // Liste à puces ou ordonnée : on regroupe les lignes consécutives.
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const list = document.createElement(ordered ? 'ol' : 'ul');
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '');
        const li = document.createElement('li');
        appendAll(li, inline(item));   // inline() renvoie un tableau de nœuds
        list.appendChild(li);
        i += 1;
      }
      root.appendChild(list);
      continue;
    }

    // Paragraphe : on accumule jusqu'à une ligne vide.
    if (line.trim() === '') { i += 1; continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^(```|#\s|\s*([-*]|\d+\.)\s)/.test(lines[i])) {
      buf.push(lines[i]);
      i += 1;
    }
    root.appendChild(el('p', inline(buf.join(' '))));
  }

  return root;
}

function el(tag, nodes) {
  const node = document.createElement(tag);
  appendAll(node, nodes);
  return node;
}

function appendAll(parent, nodes) {
  for (const n of [nodes].flat()) {
    if (n === null || n === undefined) continue;
    parent.appendChild(typeof n === 'string' ? document.createTextNode(n) : n);
  }
  return parent;
}

function codeBlock(text, lang) {
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = text;              // textContent : jamais d'interprétation
  if (lang) code.dataset.lang = lang;
  pre.appendChild(code);
  return pre;
}

/**
 * Parse le passage en ligne. Les jetons sont déjà échappés par construction
 * (createTextNode), donc aucune donnée de quête n'est interpretée comme du HTML.
 */
function inline(text) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0;
  let m;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];

    if (tok.startsWith('**')) {
      out.push(el('strong', tok.slice(2, -2)));
    } else if (tok.startsWith('`')) {
      out.push(el('code', tok.slice(1, -1)));
    } else if (tok.startsWith('[')) {
      const label = tok.slice(1, tok.indexOf(']'));
      const href = tok.slice(tok.indexOf('(') + 1, -1);
      const a = document.createElement('a');
      a.href = href;
      a.textContent = label;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      out.push(a);
    } else {
      out.push(el('em', tok.slice(1, -1)));
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}