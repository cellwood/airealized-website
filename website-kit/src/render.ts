// Turns what the API returned into the pages of the website: a person page, the list of people, and a sitemap.
// Pure functions with no network and no files, so every rule here is tested directly.
// A page shows what the API returned and nothing else. The structured data goes into the page unchanged.

import { frameClasses } from './frame.ts';
import { dateOf, esc, longDate, player, plays, roleText, safeUrl, sourceName, text, KIND } from './parts.ts';
import type { Item } from './parts.ts';
import { timelineHtml } from './timeline.ts';

export { esc, safeUrl } from './parts.ts';
export type { Appearance, Item } from './parts.ts';

export type Person = { slug: string; fields: Record<string, unknown>; items?: Item[] };

export type SiteConfig = {
  siteName: string; // "AI Realized"
  siteBaseUrl: string; // "https://airealized.org", no trailing slash
  peoplePath: string; // "/people": a person page is at {siteBaseUrl}{peoplePath}/{address}/
  privacyPolicyUrl: string;
  stylesheetHref?: string; // defaults to the kit's own stylesheet beside the list page
  homeUrl?: string; // where the site's name in the header leads. Defaults to the site's own front page.
  footer?: { heading: string; text: string; links: Array<{ label: string; url: string }> }; // the site's invitation to join
};

// How a person page lays out the work, and where it finds what the layout needs.
//   timeline  one card for each appearance under year bands (timeline.ts). A picture is the Platform's own copy,
//             at the address pictureSrc gives, and the page loads the kit's script. The layout in use.
//   list      every item in a list of cards and rows, newest first. A video's picture comes from YouTube. The
//             layout in use until November 18, 2026, kept for a build that asks for it (PEOPLE_LAYOUT=list).
export type Layout = 'list' | 'timeline';
// The layout every page uses unless it is told otherwise: the public site, the preview in a professional's note
// and the administrator's preview together. Christina switched everyone to the timeline on November 18, 2026.
export const DEFAULT_LAYOUT: Layout = 'timeline';
export type PageOptions = {
  layout?: Layout;
  pictureSrc?: (item: Item) => string | null;
  scriptHref?: string; // defaults to the kit's own script beside the list page
};

// What the AI Realized website shows in its header and footer, read from the live site on November 16, 2026.
// The name leads to the current site until the new one is at airealized.org.
export const AI_REALIZED: Required<Pick<SiteConfig, 'siteName' | 'homeUrl' | 'footer'>> = {
  siteName: 'AI Realized',
  homeUrl: 'https://www.airealizedsummit.com/',
  footer: {
    heading: 'Join AI Realized',
    text: 'Connect with enterprise leaders putting AI into practice.',
    links: [
      { label: 'Join our Mailing List', url: 'https://www.airealizedsummit.com/subscribe' },
      { label: 'Subscribe to the Newsletter', url: 'https://airealizednow.substack.com/' },
    ],
  },
};

export const personUrl = (config: SiteConfig, slug: string): string => `${config.siteBaseUrl}${config.peoplePath}/${slug}/`;
export const listUrl = (config: SiteConfig): string => `${config.siteBaseUrl}${config.peoplePath}/`;

// The order the API gives is kept (newest first). Within one day, what does not play comes first, so an event's
// own row sits right above the recordings of it.
function inOrder(items: Item[]): Item[] {
  return items
    .map((item, i) => ({ item, i, plain: plays(item) ? 1 : 0 }))
    .sort((a, b) => (dateOf(a.item) === dateOf(b.item) && dateOf(a.item) ? a.plain - b.plain || a.i - b.i : a.i - b.i))
    .map((x) => x.item);
}

// Each item shows its source, its date and the professional's role in it (R67), and links to where it is hosted (R21).
function itemHtml(item: Item): string {
  const links = item.links.map((l) => ({ ...l, url: safeUrl(l.url) })).filter((l): l is { url: string; source: string | null } => l.url !== null);
  const first = links[0];
  const title = first ? `<a href="${esc(first.url)}">${esc(item.title)}</a>` : esc(item.title);
  const facts = [
    `<span class="role">${esc(roleText(item))}</span>`,
    `<span class="kind">${esc(KIND[item.kind] ?? item.kind)}</span>`,
    dateOf(item) ? `<time datetime="${esc(dateOf(item) as string)}">${esc(longDate(dateOf(item) as string))}</time>` : '',
    first ? `<span class="source">${esc(sourceName(first))}</span>` : '',
  ].filter((f) => f !== '');
  // Other places the same item is published. An audio file is played here, not listed as a place.
  const others = links.slice(1).filter((l) => !/\.(mp3|m4a)$/i.test(new URL(l.url).pathname)).map((l) => `<a href="${esc(l.url)}">Also on ${esc(sourceName(l))}</a>`);
  // Each item is a card: what plays, on top, then what it is. The first link that can play in place is the one
  // played, so an episode whose first link is its page still plays its audio here.
  const media = links.map((l) => player(l.url, item.title)).find((m) => m !== '') ?? '';
  // An item with nothing to play (an event, an article) is a short row across the list, not a card with an
  // empty picture's worth of space.
  return `<li class="item${media ? '' : ' plain'}">${media}<div class="item-text"><h3>${title}</h3><p class="facts">${facts.join(' <span aria-hidden="true">·</span> ')}</p>${others.length ? `<p class="also">${others.join(', ')}</p>` : ''}</div></li>`;
}

// The photo, or the initials in its place when the professional asked for the photo to be removed (R65).
function avatar(fields: Record<string, unknown>, name: string, photoSrc: string | null): string {
  if (photoSrc) {
    // One size and one shape for every photo. The framing classes put the face in the middle of the circle.
    const framing = frameClasses((fields.photo as { frame?: unknown } | undefined)?.frame);
    return `<span class="avatar"><img${framing ? ` class="${framing}"` : ''} src="${esc(photoSrc)}" alt="${esc(`Photo of ${name}`)}" width="200" height="200"></span>`;
  }
  const fromName = name.split(/\s+/).filter(Boolean);
  const initials = text(fields.initials) ?? `${fromName[0]?.[0] ?? ''}${fromName.length > 1 ? (fromName[fromName.length - 1]?.[0] ?? '') : ''}`.toUpperCase();
  return `<div class="avatar initials" role="img" aria-label="${esc(`Initials of ${name}`)}">${esc(initials)}</div>`;
}

// Every page has the site's header (its name, and the link to the people list), then the page, then the site's
// footer: the invitation to join when the site has one, and the privacy policy link (website minimum, item 6).
function shell(config: SiteConfig, title: string, description: string, canonical: string, body: string, extraHead = ''): string {
  const css = config.stylesheetHref ?? `${config.peoplePath}/people.css`;
  const home = safeUrl(config.homeUrl) ?? `${config.siteBaseUrl}/`;
  const joinLinks = (config.footer?.links ?? [])
    .map((l) => ({ label: l.label, url: safeUrl(l.url) }))
    .filter((l): l is { label: string; url: string } => l.url !== null)
    .map((l) => `<a class="button" href="${esc(l.url)}">${esc(l.label)}</a>`);
  const join = config.footer
    ? `<div class="join"><div><h2>${esc(config.footer.heading)}</h2><p>${esc(config.footer.text)}</p></div>${joinLinks.length ? `<p class="join-links">${joinLinks.join('')}</p>` : ''}</div>\n`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<link rel="stylesheet" href="${esc(css)}">
${extraHead}</head>
<body>
<a class="skip" href="#main">Skip to the content</a>
<header class="site-header"><a class="site-name" href="${esc(home)}">${esc(config.siteName)}</a><nav aria-label="Site"><a href="${esc(listUrl(config))}">People</a></nav></header>
<main id="main" class="people">
${body}
</main>
<footer class="site-footer">
${join}<p class="legal"><a href="${esc(config.privacyPolicyUrl)}">Privacy policy</a></p>
</footer>
</body>
</html>
`;
}

// A person page. The order follows R65: the photo, then the name, the current title and company, the topics the
// person is known for, and a short bio. Then the work, newest first, each item with its source, date and role
// (R66, R67). Items are grouped by topic once topics exist. Until then they are listed by date.
export function renderPersonPage(person: Person, structuredData: unknown, config: SiteConfig, photoSrc: string | null, page: PageOptions = {}): string {
  const f = person.fields;
  const name = text(f.name);
  if (!name) throw new Error('a person page needs a published name');
  const title = text(f.title);
  const company = text(f.company);
  const bio = text(f.bio);
  const linkedin = safeUrl(f.linkedin_url);
  const topics = Array.isArray(f.topics) ? f.topics.map(text).filter((t): t is string => t !== null) : [];
  const role = [title, company].filter((x): x is string => x !== null).join(', ');
  const items = [...(person.items ?? [])].sort((a, b) => (dateOf(b) ?? '').localeCompare(dateOf(a) ?? '') || a.title.localeCompare(b.title));

  const timeline = (page.layout ?? DEFAULT_LAYOUT) === 'timeline';
  const work = timeline
    ? timelineHtml(items, { pictureSrc: page.pictureSrc ?? (() => null) })
    : `<ul class="items">${inOrder(items).map(itemHtml).join('\n')}</ul>`;

  // A bio keeps its paragraphs: a blank line starts a new one.
  const paragraphs = bio ? bio.split(/\n\s*\n/).map((x) => x.trim()).filter((x) => x !== '') : [];

  const body = `<article class="person">
<header class="person-header">
${avatar(f, name, photoSrc)}
<div class="person-intro">
<h1>${esc(name)}</h1>
${role ? `<p class="role-line">${esc(role)}</p>` : ''}
${topics.length ? `<ul class="topics" aria-label="Known for">${topics.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
</div>
</header>
${paragraphs.length || linkedin || items.length ? `<div class="person-body">
${paragraphs.length ? `<section aria-labelledby="about"><h2 id="about">About</h2>${paragraphs.map((x) => `<p class="bio">${esc(x)}</p>`).join('')}</section>` : ''}
${linkedin ? `<p class="links"><a class="button" href="${esc(linkedin)}" rel="me">${esc(name)} on LinkedIn</a></p>` : ''}
${items.length ? `<section aria-labelledby="work"><h2 id="work">Work</h2>${work}</section>` : ''}
</div>` : ''}
</article>`;

  // The structured data the API supplied goes in unchanged. "<" is written as its JSON escape so that no text inside
  // it can end the script element. The data a reader parses is identical.
  const ld = structuredData ? `<script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, '\\u003c')}</script>\n` : '';
  // The timeline's ribbon and arrows are the kit's own script, a file beside the stylesheet. Without it a card
  // opens its list view, and the page still works.
  const script = timeline ? `<script type="module" src="${esc(page.scriptHref ?? `${config.peoplePath}/people.js`)}"></script>\n` : '';
  const description = [name, role].filter((x) => x !== '').join(': ');
  return shell(config, `${name} | ${config.siteName}`, description, personUrl(config, person.slug), body, ld + script);
}

// The page that lists the live person pages and links to each one (website minimum, item 7).
export function renderPeopleList(people: Array<{ person: Person; photoSrc: string | null }>, config: SiteConfig): string {
  const cards = people
    .map(({ person, photoSrc }) => ({ person, photoSrc, name: text(person.fields.name) }))
    .filter((p): p is { person: Person; photoSrc: string | null; name: string } => p.name !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ person, photoSrc, name }) => {
      const role = [text(person.fields.title), text(person.fields.company)].filter((x): x is string => x !== null).join(', ');
      return `<li class="card">${avatar(person.fields, name, photoSrc)}<h2><a href="${esc(config.peoplePath)}/${esc(person.slug)}/">${esc(name)}</a></h2>${role ? `<p class="role-line">${esc(role)}</p>` : ''}</li>`;
    });
  const body = `<header class="page-header"><h1>People</h1></header>
<div class="people-list">
${cards.length ? `<ul class="cards">${cards.join('\n')}</ul>` : '<p>No pages are published yet.</p>'}
</div>`;
  return shell(config, `People | ${config.siteName}`, `People who have spoken and written with ${config.siteName}`, listUrl(config), body);
}

export function renderSitemap(config: SiteConfig, slugs: string[]): string {
  const urls = [listUrl(config), ...slugs.map((s) => personUrl(config, s))];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${esc(u)}</loc></url>`).join('\n')}
</urlset>
`;
}
