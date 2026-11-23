const fs = require('node:fs');
const path = require('node:path');

const excluded = new Set(['scripts', 'tests', 'docs', 'node_modules', '_site']);
const publicEntry = entry => !entry.name.startsWith('.') && !excluded.has(entry.name) && !entry.isSymbolicLink();
const escapeHtml = value => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const label = slug => slug.replace(/[-_]+/g, ' ').replace(/\b\p{L}/gu, char => char.toLocaleUpperCase('es'));

function discoverMenus(root) {
  const menus = [];
  function visit(directory, segments) {
    const entries = fs.readdirSync(directory, {withFileTypes: true}).filter(publicEntry);
    if (segments.length && entries.some(entry => entry.isFile() && entry.name === 'index.html')) {
      menus.push({segments, href: '/' + segments.map(encodeURIComponent).join('/') + '/'});
    }
    for (const entry of entries.filter(entry => entry.isDirectory())) visit(path.join(directory, entry.name), [...segments, entry.name]);
  }
  visit(root, []);
  return menus.sort((a, b) => a.href.localeCompare(b.href, 'es'));
}

function renderHome(template, menus) {
  const navigation = /<nav\b[^>]*aria-label="Pizzerías"[^>]*>[\s\S]*?<\/nav>/;
  if (!navigation.test(template)) throw new Error('No se encontró la navegación de pizzerías en index.html');
  const previous = new Map();
  const brands = new Map();
  for (const match of template.matchAll(/<a href="([^"]+)"><strong>([^<]+)<\/strong><span>([^<]+)<\/span><\/a>/g)) {
    previous.set(match[1], {brand: match[2], branch: match[3].replace(/\s*→$/, '')});
    brands.set(decodeURIComponent(match[1].split('/')[1]), match[2]);
  }
  const links = menus.map(menu => {
    const known = previous.get(menu.href);
    // Existing labels are already HTML text; new names are escaped before rendering.
    const brand = known?.brand || brands.get(menu.segments[0]) || escapeHtml(label(menu.segments[0]));
    const branch = known?.branch || escapeHtml(menu.segments.length > 1 ? menu.segments.slice(1).map(label).join(' · ') : 'Ver menú');
    return `<a href="${escapeHtml(menu.href)}"><strong>${brand}</strong><span>${branch} →</span></a>`;
  });
  return template.replace(navigation, () => `<nav aria-label="Pizzerías" data-menu-directory="automatic">\n${links.join('\n')}\n</nav>`);
}

function buildSite(root) {
  root = path.resolve(root);
  const menus = discoverMenus(root);
  if (!menus.length) throw new Error('No se encontraron menús para publicar');
  const home = renderHome(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), menus);
  const output = path.join(root, '_site');
  // A fresh artifact prevents removed branches from surviving a later deployment.
  fs.mkdirSync(output);
  for (const entry of fs.readdirSync(root, {withFileTypes: true}).filter(publicEntry)) {
    if (entry.name === 'index.html') continue;
    fs.cpSync(path.join(root, entry.name), path.join(output, entry.name), {
      recursive: true,
      filter: source => !fs.lstatSync(source).isSymbolicLink()
    });
  }
  fs.writeFileSync(path.join(output, 'index.html'), home);
  fs.writeFileSync(path.join(output, '.nojekyll'), '');
  fs.writeFileSync(path.join(output, 'menus.json'), JSON.stringify({menus: menus.map(menu => ({path: menu.href}))}, null, 2) + '\n');
  console.log(`Portada generada automáticamente: ${menus.length} menús`);
  return {output, menus};
}

module.exports = {discoverMenus, renderHome, buildSite};
if (require.main === module) buildSite(path.resolve(__dirname, '..'));
