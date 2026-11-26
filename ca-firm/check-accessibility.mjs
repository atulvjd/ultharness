// Focused browser audit. This is not a substitute for a manual WCAG review.
export function auditAccessibility() {
  const issues = [];
  const check = (ok, message) => { if (!ok) issues.push(message); };
  const visible = element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
  check(document.documentElement.lang === 'en', 'Document language must be en');
  check(Boolean(document.title.trim()), 'Document needs a title');
  check(document.querySelectorAll('main').length === 1, 'Exactly one main landmark');
  check(document.querySelectorAll('h1').length === 1, 'Exactly one h1');
  check(Boolean(document.querySelector('body > header')), 'Header landmark');
  check(Boolean(document.querySelector('body > footer')), 'Footer landmark');
  check(Boolean(document.querySelector('a.skip-link[href="#main"]')), 'Skip link targets main');
  const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
  check(new Set(ids).size === ids.length, 'No duplicate IDs');
  let level = 0;
  for (const heading of document.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const next = Number(heading.tagName[1]);
    check(next <= level + 1, `Heading level skips at ${heading.textContent}`);
    level = next;
  }
  for (const nav of document.querySelectorAll('nav')) check(Boolean(nav.getAttribute('aria-label')), 'Navigation needs a name');
  for (const img of document.images) check(img.hasAttribute('alt'), 'Image needs an alt attribute');
  for (const field of document.querySelectorAll('input,select,textarea')) {
    check(Boolean(field.labels?.length), `Label missing for ${field.id}`);
    for (const id of (field.getAttribute('aria-describedby') || '').split(' ').filter(Boolean)) check(Boolean(document.getElementById(id)), `Missing description ${id}`);
    check(field.required, `Expected required field ${field.id}`);
  }
  for (const element of document.querySelectorAll('a,button,summary')) {
    check(Boolean(element.getAttribute('aria-label') || element.textContent.trim() || element.querySelector('img[alt]:not([alt=""])')), `Unnamed ${element.tagName}`);
    if (visible(element)) {
      const rect = element.getBoundingClientRect();
      check(rect.width >= 24 && rect.height >= 24, `Target under WCAG minimum: ${element.textContent.trim()}`);
      check(rect.height >= 44, `Practical 44px target height: ${element.textContent.trim()}`);
    }
  }
  const rgb = color => {
    const values = color.match(/[\d.]+/g)?.map(Number) || [0, 0, 0];
    return [...values.slice(0, 3), values[3] ?? 1];
  };
  const composite = (fg, bg) => fg.slice(0, 3).map((value, i) => value * fg[3] + bg[i] * (1 - fg[3]));
  const background = element => {
    const parents = [];
    for (let node = element; node; node = node.parentElement) parents.unshift(node);
    return parents.reduce((bg, node) => composite(rgb(getComputedStyle(node).backgroundColor), bg), [255, 255, 255]);
  };
  const luminance = color => color.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((total, value, i) => total + value * [.2126, .7152, .0722][i], 0);
  let textSamples = 0;
  for (const element of document.querySelectorAll('body *')) {
    if (!visible(element) || element.closest('svg,script,style') || ![...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())) continue;
    const style = getComputedStyle(element);
    const bg = background(element);
    const fg = composite(rgb(style.color), bg);
    const l1 = luminance(fg), l2 = luminance(bg);
    const contrast = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
    const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && parseInt(style.fontWeight, 10) >= 700);
    check(contrast >= (large ? 3 : 4.5), `Text contrast ${contrast.toFixed(2)}: ${element.textContent.trim().slice(0, 65)}`);
    textSamples++;
  }
  return { issues, textSamples, scope: 'Landmarks, names, headings, labels, descriptions, targets and computed text contrast; manual WCAG review remains necessary.' };
}
