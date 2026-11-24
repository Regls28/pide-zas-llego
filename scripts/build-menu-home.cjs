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
    for (const entry of entries.filter(entry => entry.isDirectory() && (segments.length || entry.name !== 'media'))) visit(path.join(directory, entry.name), [...segments, entry.name]);
  }
  visit(root, []);
  return menus.sort((a, b) => a.href.localeCompare(b.href, 'es'));
}

function renderHome(template, menus, {showDirectory = true} = {}) {
  const navigation = /<nav\b[^>]*aria-label="Pizzerías"[^>]*>[\s\S]*?<\/nav>/;
  if (!showDirectory) return template.replace(navigation, '');
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
  const directory = `<nav aria-label="Pizzerías" data-menu-directory="automatic">\n${links.join('\n')}\n</nav>`;
  if (navigation.test(template)) return template.replace(navigation, () => directory);
  // The home design may change independently from the automatic menu directory.
  // Insert a directory when an edited home no longer includes the previous nav.
  const styles = '<style id="zas-menu-directory-styles">nav[data-menu-directory="automatic"]{box-sizing:border-box;width:min(100%,1000px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px;margin:24px auto}nav[data-menu-directory="automatic"] a{display:grid;gap:6px;padding:20px;border:1px solid #886349;border-radius:14px;background:#302018;color:#fff8ef;text-decoration:none;overflow-wrap:anywhere;font:16px/1.4 system-ui,sans-serif}nav[data-menu-directory="automatic"] a:hover,nav[data-menu-directory="automatic"] a:focus-visible{background:#493022;outline:2px solid #ff9a4d;outline-offset:2px}nav[data-menu-directory="automatic"] a span{color:#eed9c9}</style>';
  const closing = /<\/main\s*>/i.test(template) ? /<\/main\s*>/i : /<\/body\s*>/i;
  if (!closing.test(template)) throw new Error('La portada necesita un cierre de main o body para colocar los menús');
  return template.replace(closing, match => styles + '\n' + directory + '\n' + match);
}

function discoverMedia(root) {
  const directory = path.join(root, 'media');
  if (!fs.existsSync(directory) || fs.lstatSync(directory).isSymbolicLink() || !fs.statSync(directory).isDirectory()) return [];
  const media = [];
  function visit(folder, segments) {
    for (const entry of fs.readdirSync(folder, {withFileTypes: true}).filter(publicEntry)) {
      const parts = [...segments, entry.name];
      if (entry.isDirectory()) visit(path.join(folder, entry.name), parts);
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      const type = ['.jpg','.jpeg','.png','.webp','.gif','.avif'].includes(extension) ? 'image' : ['.mp4','.webm'].includes(extension) ? 'video' : null;
      if (type) media.push({type, href: '/' + ['media',...parts].map(encodeURIComponent).join('/'), name: entry.name.replace(/\.[^.]+$/, '').replace(/^\d+[-_ ]+/, '').replace(/[-_]+/g, ' ')});
    }
  }
  visit(directory, []);
  return media.sort((a,b)=>a.href.localeCompare(b.href,'es',{numeric:true}));
}

function renderMedia(template, media) {
  // Generated content is replaceable; the editable home remains the source of truth.
  template = template.replace(/<!-- zas-media:start -->[\s\S]*?<!-- zas-media:end -->/g, '');
  if (!media.length) return template;
  const cards = media.map((item,index)=>{
    const href=escapeHtml(item.href), name=escapeHtml(item.name || 'Promoción');
    return item.type==='video'
      ? `<figure><video controls playsinline preload="metadata" aria-label="${name}"><source src="${href}" type="${/\.webm$/i.test(item.href)?'video/webm':'video/mp4'}">Tu navegador no puede reproducir este video. <a href="${href}">Abrir video</a></video></figure>`
      : `<figure><img src="${href}" alt="${name}" loading="${index===0?'eager':'lazy'}" decoding="async"></figure>`;
  });
  const gallery = '<!-- zas-media:start --><style>.zas-home-media{box-sizing:border-box;width:min(100%,1000px);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px;margin:24px auto 0}.zas-home-media figure{min-width:0;margin:0;overflow:hidden;align-self:start;border:1px solid #604331;border-radius:16px;background:#160f0c}.zas-home-media img,.zas-home-media video{display:block;width:100%;height:auto;max-height:75svh;object-fit:contain}.zas-home-media a{color:#ffb77c}.zas-portada:has(.zas-home-media){gap:24px;align-content:start}.zas-home-media:only-child{margin-top:0}</style><section class="zas-home-media" aria-label="Imágenes y videos de ZAS">' + cards.join('\n') + '</section><!-- zas-media:end -->';
  const closing=/<\/main\s*>/i.test(template)?/<\/main\s*>/i:/<\/body\s*>/i;
  if (!closing.test(template)) throw new Error('La portada necesita un cierre de main o body para colocar las imágenes y videos');
  return template.replace(closing, match=>gallery+'\n'+match);
}

function buildSite(root) {
  root = path.resolve(root);
  const menus = discoverMenus(root);
  if (!menus.length) throw new Error('No se encontraron menús para publicar');
  const media = discoverMedia(root);
  const home = renderMedia(renderHome(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), menus, {showDirectory: process.env.SHOW_MENU_DIRECTORY === 'true'}), media);
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
  console.log(`Portada generada automáticamente: ${menus.length} menús; ${media.length} imágenes/videos`);
  return {output, menus, media};
}

module.exports = {discoverMenus, renderHome, discoverMedia, renderMedia, buildSite};
if (require.main === module) buildSite(path.resolve(__dirname, '..'));

