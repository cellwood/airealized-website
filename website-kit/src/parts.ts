// What the page templates share: escaping, safe links, the plain words for a role, a kind and a source, dates,
// and the player. Pure functions with no network and no files.

// The event, episode or article an item belongs to, as the API gives it with the item.
export type Appearance = {
  work_id: string;
  kind: string; // event, episode or article
  title: string;
  published_on: string | null;
  event_type?: string | null; // summit, salon, roundtable or workshop
  label?: string | null; // what the source is called: "AI Realized Summit", "AI Realized Podcast"
  topics?: string[] | null; // the topics of this person's appearance
  own?: boolean; // whether the item stands for the event, episode or article itself
};

export type Item = {
  item_id: string;
  kind: string;
  title: string;
  published_on: string | null;
  role: string;
  roles?: string[] | null; // every role the person had, when the item belongs to an appearance record
  role_label?: string | null; // the role in the partner organization's own words, when it set them
  links: Array<{ url: string; source: string | null }>;
  short_title?: string | null; // the title a card shows, when one is set
  topics?: string[] | null;
  image?: { width: number; height: number } | null; // the size of the Platform's own copy of the item's picture
  appearance?: Appearance | null;
};

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value: unknown): string => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c] as string);

export const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

// Only ordinary web links are ever written into a page.
export function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export const ROLE: Record<string, string> = {
  keynote: 'Keynote speaker', speaker: 'Speaker', panelist: 'Panelist', moderator: 'Moderator', presenter: 'Presenter', host: 'Host', guest: 'Guest',
  // "subject" is someone an article or a readout features without having written it.
  author: 'Author', subject: 'Featured in',
};
export const KIND: Record<string, string> = {
  talk: 'Talk', panel: 'Panel', podcast_episode: 'Podcast episode', article: 'Article', video: 'Video', clip: 'Clip', quote: 'Quote',
  event: 'Event',
};
// "partner_article" is something AI Realized published that is attached to an appearance: a readout, an article.
export const SOURCE: Record<string, string> = { redcircle: 'AI Realized Podcast', youtube: 'YouTube', substack: 'AI Realized Now', partner_work: 'AI Realized', partner_article: 'AI Realized' };

// The person's role in an item, in plain words: the wording set on the appearance record when there is one,
// otherwise every role they had ("Speaker and moderator").
export function roleText(item: Item): string {
  const worded = text(item.role_label);
  if (worded) return worded;
  const roles = Array.isArray(item.roles) && item.roles.length > 0 ? item.roles : [item.role];
  const names = roles.map((r, i) => (i === 0 ? (ROLE[r] ?? r) : (ROLE[r] ?? r).toLowerCase()));
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '');
}

export function sourceName(link: { url: string; source: string | null }): string {
  if (link.source && SOURCE[link.source]) return SOURCE[link.source] as string;
  return new URL(link.url).hostname.replace(/^www\./, '');
}

export function longDate(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(d);
}

// The identifier of the video a YouTube address points at, or null for any other address.
export function youtubeVideo(url: string): string | null {
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, '');
  const id = host === 'youtu.be' ? u.pathname.slice(1) : host.endsWith('youtube.com') ? u.searchParams.get('v') : null;
  return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
}

export const isAudio = (url: string): boolean => /\.(mp3|m4a)$/i.test(new URL(url).pathname);

// Media plays in place, from where it is hosted (R73). Nothing loads until the visitor opens it.
// The picture in front of a video is one of three things. Left out: YouTube's own picture of the video, loaded
// from YouTube (the list layout). An address: the Platform's own copy of the picture (the timeline layout).
// null: no picture at all, so nothing is loaded from the source site.
export function player(url: string, title: string, picture?: string | null): string {
  const id = youtubeVideo(url);
  if (id) {
    // The video itself loads only when the visitor opens it, in YouTube's no-cookie player. YouTube's player
    // refuses to start ("Error 153") unless the frame's request says which site embeds it, so the frame states the
    // site and nothing more: the origin, never the page's address. That holds whatever referrer rule the page
    // itself is served with, so a preview whose address holds a token still passes on no part of that address.
    const thumb =
      picture === undefined
        ? `<img class="thumb" src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" width="480" height="360">`
        : picture === null
          ? '<span class="thumb none"></span>'
          : `<img class="thumb" src="${esc(picture)}" alt="" loading="lazy">`;
    return `<details class="player"><summary>${thumb}<span class="play">Play the video here</span></summary><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${esc(title)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></details>`;
  }
  if (isAudio(url)) {
    return `<audio class="player" controls preload="none" src="${esc(url)}" aria-label="${esc(`Listen to ${title}`)}"></audio>`;
  }
  return '';
}

// The date of an item. The item that stands for an episode, an event or an article takes the work's own date
// when it has none of its own: an episode's release date is kept on the episode, read from the podcast feed.
export const dateOf = (item: Item): string | null => text(item.published_on) ?? (item.appearance?.own ? text(item.appearance.published_on) : null);

// What an item can play in place: a video, audio, both or neither.
export function mediaOf(item: Item): { video: boolean; audio: boolean } {
  const urls = item.links.map((l) => safeUrl(l.url)).filter((u): u is string => u !== null);
  return { video: urls.some((u) => youtubeVideo(u) !== null), audio: urls.some(isAudio) };
}

// Whether an item has something that plays in place.
export function plays(item: Item): boolean {
  return item.links.some((l) => {
    const url = safeUrl(l.url);
    return url !== null && player(url, item.title) !== '';
  });
}
