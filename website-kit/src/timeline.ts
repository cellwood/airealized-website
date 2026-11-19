// The timeline layout of a person's work (Christina's design of November 18, 2026).
//
// One card for each appearance: an event, a podcast episode or an article. The cards sit side by side, grouped
// under a band for each year, oldest on the left and newest on the right, and the page opens on the newest.
// A card shows a strip that names the source ("AI Realized Summit") over a wide picture, 16 to 9, then the date
// and one line for each item ("Talk: ..."), then the topics as tags.
//
// Clicking a card opens its story ribbon: the items of the appearance one after another, each in a 16 to 9 frame,
// with progress bars across the top. A video plays in the frame. An article or a readout shows its picture with a
// "Read" button, an episode its artwork with a "Listen" button. "All items" in the ribbon opens the list view:
// every item with its full title, the person's role, the links and the player.
//
// Everything is in the page's HTML: the list view of each card is written out in full, so a search engine and a
// reader without scripts get the whole list. Without the script a card opens its list view, and the filter chips
// still filter. The script (people.js) runs the ribbon and the arrows.
//
// A picture is only ever the Platform's own copy, at the address the caller gives. An item with no copy shows a
// plain block in the color of its kind. Nothing here loads a picture from the source site.
import { KIND, dateOf, esc, isAudio, longDate, mediaOf, player, roleText, safeUrl, sourceName, text, youtubeVideo } from './parts.ts';
import type { Item } from './parts.ts';

export type TimelineOptions = {
  // The address of the Platform's own copy of an item's picture, or null when it holds none.
  pictureSrc: (item: Item) => string | null;
};

type Card = {
  kind: 'event' | 'episode' | 'article'; // which color the strip has
  label: string; // the strip: what the source is called
  title: string; // the full name of the event, episode or article
  date: string | null;
  own: Item | null; // the item that stands for the event, episode or article itself
  items: Item[]; // every other item of the appearance, recordings first
  solo: boolean; // an item that belongs to no appearance, as a card of its own
};

// The word in front of a title on a card and in the ribbon.
const LINE: Record<string, string> = {
  talk: 'Talk', panel: 'Panel', podcast_episode: 'Episode', article: 'Article', video: 'Video', clip: 'Clip', quote: 'Quote', event: 'Event',
};
const lineWord = (item: Item): string => LINE[item.kind] ?? KIND[item.kind] ?? item.kind;
// What counts as a recording of an event, in the order a card lists them.
const RECORDINGS = ['talk', 'panel', 'video', 'clip'];
const isRecording = (item: Item): boolean => RECORDINGS.includes(item.kind);
// Recordings first, a talk before a panel, then everything else by date.
const rank = (item: Item): number => (isRecording(item) ? RECORDINGS.indexOf(item.kind) : RECORDINGS.length);

// The title a card shows: the short title when one is set, otherwise the part of the title before the colon.
// A label in front that only says what the item is ("Panel 1:", "Keynote:") is not the title, because the card
// already says "Panel:" itself, so the part after it is used.
export function cardTitle(item: Pick<Item, 'title' | 'short_title'>): string {
  const set = text(item.short_title);
  if (set) return set;
  const full = item.title.trim();
  const rest = full.replace(/^(?:(?:opening|closing)\s+)?(?:panel|keynote|talk|fireside chat|presentation|session|episode|ep\.?)\s*#?\d*\s*:\s*/i, '');
  const from = rest === '' ? full : rest;
  const colon = from.indexOf(':');
  const head = colon > 0 ? from.slice(0, colon).trim() : from;
  return head === '' ? from : head;
}

function shortDate(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d).toUpperCase();
}

const byDate = (a: Item, b: Item): number => (a.published_on ?? '').localeCompare(b.published_on ?? '') || a.title.localeCompare(b.title);

// The cards of a page, newest first. Items of one appearance share a card. Any other item is a card of its own.
function cardsOf(items: Item[]): Card[] {
  const byWork = new Map<string, Card>();
  const cards: Card[] = [];
  for (const item of items) {
    const a = item.appearance;
    const work = a ? text(a.work_id) : null;
    if (a && work) {
      let card = byWork.get(work);
      if (!card) {
        card = { kind: a.kind === 'episode' ? 'episode' : a.kind === 'article' ? 'article' : 'event', label: text(a.label) ?? '', title: text(a.title) ?? item.title, date: text(a.published_on), own: null, items: [], solo: false };
        byWork.set(work, card);
        cards.push(card);
      }
      if (a.own && !card.own) card.own = item;
      else card.items.push(item);
    } else {
      const first = item.links.find((l) => safeUrl(l.url) !== null);
      cards.push({
        kind: item.kind === 'podcast_episode' ? 'episode' : item.kind === 'article' ? 'article' : 'event',
        label: first ? sourceName({ url: safeUrl(first.url) as string, source: first.source }) : '',
        title: item.title, date: item.published_on, own: null, items: [item], solo: true,
      });
    }
  }
  for (const card of cards) {
    card.items.sort((a, b) => rank(a) - rank(b) || byDate(a, b));
    // The date of a card is the date of the event, episode or article itself: the work's own date, then the date
    // on the item that stands for it, then the date of a recording of it. Never the date of an article about it,
    // which is written later. (An episode once showed the date of an article about it, because the feed's release
    // dates had not been read.) A card with none of these is undated, and says so.
    card.date ??= text(card.own?.published_on) ?? card.items.filter(isRecording).map((i) => i.published_on).filter((d): d is string => d !== null).sort()[0] ?? null;
  }
  return cards.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.title.localeCompare(b.title));
}

const everyItem = (card: Card): Item[] => (card.own ? [card.own, ...card.items] : card.items);

// The items of a card in the one order everything follows: the card's lines, its pictures and the ribbon.
// An episode or an article comes first itself, then what is about it. An event's items are its recordings, a talk
// before a panel, then the articles and readouts about it. An event with nothing else is just itself.
function queueOf(card: Card): Item[] {
  if (card.kind !== 'event' && card.own) return [card.own, ...card.items];
  if (card.items.length > 0) return card.items;
  return card.own ? [card.own] : [];
}

// The lines of a card, at most three, from the front of its queue. An event lists its recordings, and the
// articles about it only when it has no recording. An episode or an article is one line.
function linesOf(card: Card): Item[] {
  const queue = queueOf(card);
  if (card.kind !== 'event' && card.own) return queue.slice(0, 1);
  const recordings = queue.filter(isRecording);
  return (recordings.length > 0 ? recordings : queue).slice(0, 3);
}

// The topics of a card: the appearance's, then each item's, each once.
function topicsOf(card: Card): string[] {
  const all = everyItem(card);
  const listed = [...(all.find((i) => i.appearance)?.appearance?.topics ?? []), ...all.flatMap((i) => i.topics ?? [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of listed) {
    const topic = text(raw);
    if (!topic || seen.has(topic.toLowerCase())) continue;
    seen.add(topic.toLowerCase());
    out.push(topic);
  }
  return out;
}

const svg = (size: number, body: string): string => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
const stroke = (d: string): string => `<path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`;
const ICON = {
  video: svg(14, '<path fill="currentColor" d="M8 5v14l11-7z"/>'),
  audio: svg(14, '<path fill="currentColor" d="M12 3a9 9 0 0 0-9 9v6a3 3 0 0 0 3 3h2v-8H5v-1a7 7 0 0 1 14 0v1h-3v8h2a3 3 0 0 0 3-3v-6a9 9 0 0 0-9-9z"/>'),
  earlier: svg(20, stroke('M15 5l-7 7 7 7')),
  later: svg(20, stroke('M9 5l7 7-7 7')),
  pause: svg(18, '<path fill="currentColor" d="M7 5h4v14H7zM13 5h4v14h-4z"/>'),
  play: svg(18, '<path fill="currentColor" d="M8 5v14l11-7z"/>'),
  soundOff: svg(18, `<path fill="currentColor" d="M4 9v6h4l5 4V5L8 9z"/>${stroke('M17 9l5 6M22 9l-5 6')}`),
  soundOn: svg(18, `<path fill="currentColor" d="M4 9v6h4l5 4V5L8 9z"/>${stroke('M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12')}`),
};

type SafeLink = { url: string; source: string | null };
const linksOf = (item: Item): SafeLink[] => item.links.map((l) => ({ ...l, url: safeUrl(l.url) })).filter((l): l is SafeLink => l.url !== null);

// The name of the event with its year, as the ribbon and the list view head it. The source's name stands in front
// unless the title already says it ("AI Realized Summit 2025").
function headOf(card: Card): { name: string; title: string | null } {
  const year = card.date?.slice(0, 4) ?? '';
  const says = card.label === '' || card.title.toLowerCase().includes(card.label.toLowerCase());
  if (card.kind !== 'event') return { name: card.label || card.title, title: null };
  return says ? { name: card.title, title: null } : { name: year ? `${card.label} ${year}` : card.label, title: card.title };
}

const roleOf = (card: Card): string => (card.own ? roleText(card.own) : card.solo && card.items[0] ? roleText(card.items[0]) : '');

// One item in a card's list view: what plays, then what it is, its full title linked to where it is hosted, and
// the professional's role in it (R67, R21).
function panelItem(item: Item, card: Card, opts: TimelineOptions): string {
  const links = linksOf(item);
  const first = links[0];
  const title = first ? `<a href="${esc(first.url)}">${esc(item.title)}</a>` : esc(item.title);
  const picture = opts.pictureSrc(item);
  const media = links.map((l) => player(l.url, item.title, picture)).find((m) => m !== '') ?? '';
  const on = dateOf(item);
  const facts = [
    `<span class="kind">${esc(KIND[item.kind] ?? item.kind)}</span>`,
    `<span class="role">${esc(roleText(item))}</span>`,
    on && on !== card.date ? `<time datetime="${esc(on)}">${esc(longDate(on))}</time>` : '',
    first ? `<span class="source">${esc(sourceName(first))}</span>` : '',
  ].filter((f) => f !== '');
  const others = links.slice(1).filter((l) => !isAudio(l.url)).map((l) => `<a href="${esc(l.url)}">Also on ${esc(sourceName(l))}</a>`);
  return `<li class="tl-item">${media}<div class="tl-item-text"><p class="facts">${facts.join(' <span aria-hidden="true">·</span> ')}</p><h5>${title}</h5>${others.length ? `<p class="also">${others.join(', ')}</p>` : ''}</div></li>`;
}

// The list view of a card ("All items"): the full name of the event, episode or article with its date and year,
// the person's role in it, and every item. It is in the page whether or not a script runs.
function panelHtml(card: Card, id: string, topics: string[], opts: TimelineOptions): string {
  // The source's name sits above the title unless the title already says it ("AI Realized Summit 2025").
  const year = card.date?.slice(0, 4) ?? '';
  const eyebrow = card.label !== '' && !card.title.toLowerCase().includes(card.label.toLowerCase())
    ? `<p class="tl-eyebrow">${esc(card.kind === 'event' && year ? `${card.label} ${year}` : card.label)}</p>`
    : '';
  const when = [
    card.date ? `<time datetime="${esc(card.date)}">${esc(longDate(card.date))}</time>` : '',
    card.own && card.kind === 'event' ? `<span class="role">${esc(roleText(card.own))}</span>` : '',
  ].filter((x) => x !== '');
  // An event's own item is the event: its page is linked under the items. An episode or an article is its own
  // first item, with its player and its links.
  const listed = card.kind === 'event' ? card.items : everyItem(card);
  const ownLink = card.kind === 'event' && card.own ? safeUrl(card.own.links[0]?.url) : null;
  return `<div class="tl-panel" id="${id}" popover>
<div class="tl-panel-head"><div>${eyebrow}<h4>${esc(card.title)}</h4>${when.length ? `<p class="tl-when">${when.join(' <span aria-hidden="true">·</span> ')}</p>` : ''}</div><button type="button" class="tl-close" popovertarget="${id}" popovertargetaction="hide" aria-label="Close">&times;</button></div>
${listed.length ? `<ul class="tl-items">${listed.map((item) => panelItem(item, card, opts)).join('\n')}</ul>` : ''}
${topics.length ? `<ul class="tl-tags" aria-label="Topics">${topics.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
${ownLink ? `<p class="tl-page"><a href="${esc(ownLink)}">The event's page</a></p>` : ''}
</div>`;
}

// One frame of a card's ribbon. Three kinds:
//   video    a talk, a panel or any item with a video on YouTube: the script plays it in the frame, with the
//            sound off, and the ribbon waits for it to end
//   audio    an episode: its artwork, and "Listen" plays the audio in the frame
//   picture  an article, a readout or an event's own page: its picture, and "Read" opens it in a new tab
// The frame carries only what the script needs: the video's identifier, never an address built here.
function frameHtml(item: Item, opts: TimelineOptions): string {
  const links = linksOf(item);
  const video = links.map((l) => youtubeVideo(l.url)).find((v): v is string => v !== null) ?? null;
  const audio = links.find((l) => isAudio(l.url))?.url ?? null;
  const kind = item.kind === 'podcast_episode' && audio ? 'audio' : video ? 'video' : 'picture';
  const src = opts.pictureSrc(item);
  const picture = src ? `<img class="tl-frame-picture${item.kind === 'podcast_episode' ? ' art' : ''}" src="${esc(src)}" alt="" loading="lazy">` : '';
  const page = links.find((l) => !isAudio(l.url))?.url ?? null;
  const go =
    kind === 'audio'
      ? `<p class="tl-frame-go"><button type="button" class="tl-listen">Listen</button><audio preload="none" src="${esc(audio as string)}"></audio></p>`
      : kind === 'picture' && page
        ? `<p class="tl-frame-go"><a href="${esc(page)}" target="_blank" rel="noopener">${item.kind === 'event' ? "The event's page" : 'Read'}</a></p>`
        : '';
  return `<li class="tl-frame k-${item.kind === 'podcast_episode' ? 'episode' : item.kind === 'article' ? 'article' : 'event'}" data-kind="${kind}"${kind === 'video' ? ` data-video="${esc(video as string)}"` : ''} hidden><div class="tl-stage">${picture}</div><p class="tl-frame-title"><b>${esc(lineWord(item))}:</b> ${esc(item.title)}</p>${go}</li>`;
}

// The story ribbon of a card: its queue, one frame at a time. It is a dialog the script opens. Without the
// script it stays closed and the card opens its list view.
function ribbonHtml(card: Card, id: string, panel: string, queue: Item[], opts: TimelineOptions): string {
  if (queue.length === 0) return '';
  const head = headOf(card);
  const role = roleOf(card);
  const title = [
    `<b>${esc(head.name)}</b>`,
    head.title ? `<span>${esc(head.title)}</span>` : '',
    card.date ? `<time datetime="${esc(card.date)}">${esc(longDate(card.date))}</time>` : '',
    role ? `<span>${esc(role)}</span>` : '',
  ].filter((x) => x !== '');
  return `<dialog class="tl-ribbon" id="${id}" aria-label="${esc(head.title ?? head.name)}">
<div class="tl-rb" tabindex="-1" autofocus>
<div class="tl-rb-bars" aria-hidden="true">${queue.map(() => '<span><i></i></span>').join('')}</div>
<div class="tl-rb-head"><p class="tl-rb-title">${title.join(' ')}</p><div class="tl-rb-tools"><button type="button" class="tl-rb-pause" aria-pressed="false" aria-label="Pause">${ICON.pause}${ICON.play}</button><button type="button" class="tl-rb-mute" aria-pressed="true" aria-label="Turn the sound on">${ICON.soundOff}${ICON.soundOn}</button><button type="button" class="tl-rb-all" data-panel="${panel}">All items</button><button type="button" class="tl-rb-close" aria-label="Close">&times;</button></div></div>
<div class="tl-rb-body"><ol class="tl-rb-frames">
${queue.map((item) => frameHtml(item, opts)).join('\n')}
</ol><button type="button" class="tl-rb-prev" aria-label="Previous item">${ICON.earlier}</button><button type="button" class="tl-rb-next" aria-label="Next item">${ICON.later}</button></div>
</div>
</dialog>`;
}

function flagsOf(card: Card): string[] {
  const all = everyItem(card);
  return [
    (card.kind === 'event' && !card.solo) || all.some(isRecording) ? 'f-talks' : '',
    card.kind === 'episode' || all.some((i) => i.kind === 'podcast_episode') ? 'f-podcasts' : '',
    all.some((i) => i.kind === 'article') ? 'f-articles' : '',
  ].filter((f) => f !== '');
}

function cardHtml(card: Card, n: number, opts: TimelineOptions): string {
  const panel = `tl-${n}`;
  const ribbon = `tl-r-${n}`;
  const all = everyItem(card);
  const queue = queueOf(card);
  // The main picture is the picture of the first item in the queue, which is the card's first line. The small
  // pictures are the next items, in the same order, so they show what the ribbon plays next.
  const main = queue[0] ?? null;
  const src = main ? opts.pictureSrc(main) : null;
  const size = main?.image && src ? ` width="${Number(main.image.width) || 0}" height="${Number(main.image.height) || 0}"` : '';
  const picture = src ? `<img class="tl-lead${main?.kind === 'podcast_episode' ? ' art' : ''}" src="${esc(src)}" alt="" loading="lazy"${size}>` : '';
  const minis = queue.length > 1
    ? `<span class="tl-minis">${queue
        .slice(1, 5)
        .map((item, i) => {
          const mini = opts.pictureSrc(item);
          return mini
            ? `<img class="tl-mini" data-at="${i + 1}" src="${esc(mini)}" alt="" loading="lazy">`
            : `<span class="tl-mini m-${item.kind === 'article' ? 'article' : item.kind === 'podcast_episode' ? 'episode' : 'video'}" data-at="${i + 1}"></span>`;
        })
        .join('')}</span>`
    : '';
  // The sign at the top right: something here plays. An episode is listened to first. Anything else is watched first.
  const plays = all.map(mediaOf);
  const video = plays.some((m) => m.video);
  const audio = plays.some((m) => m.audio);
  const media = card.kind === 'episode' ? (audio ? 'audio' : video ? 'video' : null) : video ? 'video' : audio ? 'audio' : null;
  const icon = media ? `<span class="tl-media">${ICON[media]}<span class="tl-sr">${media === 'video' ? 'Has a video' : 'Has audio'}</span></span>` : '';
  const lines = linesOf(card).map((item) => `<span class="tl-line" data-at="${queue.indexOf(item)}"><b>${esc(lineWord(item))}:</b> ${esc(cardTitle(item))}</span>`);
  const topics = topicsOf(card);
  return `<li class="tl-card k-${card.kind} ${flagsOf(card).join(' ')}">
<button type="button" class="tl-open" popovertarget="${panel}"${queue.length ? ` data-ribbon="${ribbon}"` : ''}>
<span class="tl-image"><span class="tl-strip">${esc(card.label)}</span>${icon}<span class="tl-picture">${picture}${minis}</span></span>
${card.date ? `<span class="tl-date"><time datetime="${esc(card.date)}">${esc(shortDate(card.date))}</time></span>` : ''}
${lines.join('\n')}
</button>
${topics.length ? `<ul class="tl-tags" aria-label="Topics">${topics.slice(0, 4).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
${panelHtml(card, panel, topics, opts)}
${ribbonHtml(card, ribbon, panel, queue, opts)}
</li>`;
}

const FILTERS: Array<[string, string]> = [['talks', 'Talks and panels'], ['podcasts', 'Podcasts'], ['articles', 'Articles']];

// The timeline of a page's items. The items arrive in the API's order and leave as cards under year bands.
// In the page's HTML the newest year and the newest card come first. On screen the row runs oldest to newest,
// left to right, and starts at its right end.
export function timelineHtml(items: Item[], opts: TimelineOptions): string {
  const cards = cardsOf(items);
  const years: Array<{ year: string; cards: Array<{ card: Card; n: number }> }> = [];
  cards.forEach((card, i) => {
    const year = card.date?.slice(0, 4) ?? '';
    let group = years.find((g) => g.year === year);
    if (!group) {
      group = { year, cards: [] };
      years.push(group);
    }
    group.cards.push({ card, n: i + 1 });
  });
  const present = FILTERS.filter(([key]) => cards.some((c) => flagsOf(c).includes(`f-${key}`)));
  // Chips are worth showing only when they can narrow the row: at least two kinds of work are present.
  const chips = present.length >= 2 ? [['all', 'All'] as [string, string], ...present] : [];
  const inputs = chips.map(([key], i) => `<input class="tl-f" type="radio" name="tl-filter" id="tl-f-${key}"${i === 0 ? ' checked' : ''}>`).join('');
  const labels = chips.length ? `<div class="tl-chips" role="group" aria-label="Show">${chips.map(([key, label]) => `<label for="tl-f-${key}">${esc(label)}</label>`).join('')}</div>` : '';
  const bands = years
    .map((g) => {
      const flags = FILTERS.map(([key]) => `f-${key}`).filter((flag) => g.cards.some(({ card }) => flagsOf(card).includes(flag))).join(' ');
      const id = `tl-y-${g.year || 'undated'}`;
      return `<section class="tl-year ${flags}" aria-labelledby="${id}"><h3 class="tl-band" id="${id}"><span>${esc(g.year || 'Undated')}</span></h3><ul class="tl-cards">
${g.cards.map(({ card, n }) => cardHtml(card, n, opts)).join('\n')}
</ul></section>`;
    })
    .join('\n');
  return `<div class="timeline">${inputs}${labels}
<div class="tl-scroll"><button type="button" class="tl-arrow tl-prev" aria-label="Earlier work" hidden>${ICON.earlier}</button><div class="tl-row">
${bands}
</div><button type="button" class="tl-arrow tl-next" aria-label="Later work" hidden>${ICON.later}</button></div>
</div>`;
}
