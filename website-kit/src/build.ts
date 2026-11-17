// Builds the person pages of the website from the Platform's API (architecture 8.2, method A).
// It runs inside the website's own build, after the rest of the site is built, and writes into the build output:
//   {out}/people/index.html                the list of live person pages
//   {out}/people/{address}/index.html      one person page
//   {out}/people/{address}/photo.jpg       the photo, when the page shows one
//   {out}/people/sitemap.xml               every person page address
//   {out}/people/people.css                the stylesheet, with site-style.css and fonts/ beside it
// Nothing from a profile is written anywhere else, committed, cached between builds, or printed. The log holds
// counts only. Every run starts from an empty people folder, so a page that is no longer live is gone.
//
// Environment when run as a command:
//   PLATFORM_API_URL      https://api.airealized.org
//   PLATFORM_SITE_KEY     the site's key, a repository secret
//   SITE_BASE_URL         https://airealized.org
//   PRIVACY_POLICY_URL    the address of the privacy policy
//   SITE_HOME_URL         where the site's name in the header leads (optional; the current AI Realized site until it moves)
//   OUT_DIR               the build output folder
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { KIT_ASSETS, kitAssetUrl } from './assets.ts';
import { AI_REALIZED, personUrl, renderPeopleList, renderPersonPage, renderSitemap } from './render.ts';
import type { Person, SiteConfig } from './render.ts';

export type BuildOptions = { apiUrl: string; siteKey: string; outDir: string; config: SiteConfig };
export type BuildResult = { pages: number; photos: number; photos_unavailable: number; gone_during_build: number };

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function buildPeople(opts: BuildOptions): Promise<BuildResult> {
  const { config } = opts;
  const api = opts.apiUrl.replace(/\/+$/, '');
  const call = (path: string) =>
    fetch(api + path, { headers: { Authorization: `Bearer ${opts.siteKey}` }, signal: AbortSignal.timeout(20_000) });

  const listRes = await call('/v1/people?set=people_list');
  // If the list cannot be read the build stops, and the site keeps what it last published.
  if (!listRes.ok) throw new Error(`the Platform answered ${listRes.status} for the list of people`);
  const listed = ((await listRes.json()) as { people: Person[] }).people.filter((p) => SLUG.test(p.slug));

  const peopleDir = join(opts.outDir, config.peoplePath.replace(/^\/+/, ''));
  await rm(peopleDir, { recursive: true, force: true });
  await mkdir(peopleDir, { recursive: true });

  const result: BuildResult = { pages: 0, photos: 0, photos_unavailable: 0, gone_during_build: 0 };
  const cards: Array<{ person: Person; photoSrc: string | null }> = [];
  const slugs: string[] = [];

  for (const entry of listed) {
    const dir = join(peopleDir, entry.slug);
    await mkdir(dir, { recursive: true });

    // The photo first, so the page and its structured data can state the photo's address.
    let photoFile: string | null = null;
    const media = (entry.fields.photo as { media_id?: string } | undefined)?.media_id;
    if (media) {
      const res = await call(`/v1/photos/${media}`);
      const ext = EXT[res.headers.get('content-type') ?? ''];
      if (res.ok && ext) {
        photoFile = `photo.${ext}`;
        await writeFile(join(dir, photoFile), Buffer.from(await res.arrayBuffer()));
        result.photos += 1;
      } else {
        result.photos_unavailable += 1; // the page shows initials, and the count is reported
      }
    }

    const url = personUrl(config, entry.slug);
    const query = new URLSearchParams({ set: 'person_page', page_url: url });
    if (photoFile) query.set('image_url', url + photoFile);
    const res = await call(`/v1/people/${entry.slug}?${query}`);
    if (res.status === 404) {
      // Hidden or removed between the list and this call: the page is not built.
      await rm(dir, { recursive: true, force: true });
      result.gone_during_build += 1;
      continue;
    }
    if (!res.ok) throw new Error(`the Platform answered ${res.status} for a person page`);
    const { person, structured_data } = (await res.json()) as { person: Person; structured_data: unknown };
    await writeFile(join(dir, 'index.html'), renderPersonPage(person, structured_data, config, photoFile));
    cards.push({ person: entry, photoSrc: photoFile ? `${config.peoplePath}/${entry.slug}/${photoFile}` : null });
    slugs.push(entry.slug);
    result.pages += 1;
  }

  await writeFile(join(peopleDir, 'index.html'), renderPeopleList(cards, config));
  await writeFile(join(peopleDir, 'sitemap.xml'), renderSitemap(config, slugs));
  // The stylesheets, the font files and the font's license, beside each other as the stylesheet expects.
  for (const name of Object.keys(KIT_ASSETS)) {
    await mkdir(dirname(join(peopleDir, name)), { recursive: true });
    await copyFile(fileURLToPath(kitAssetUrl(name)), join(peopleDir, name));
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const need = (name: string): string => {
    const v = process.env[name];
    if (!v) throw new Error(`${name} is not set`);
    return v;
  };
  const result = await buildPeople({
    apiUrl: need('PLATFORM_API_URL'),
    siteKey: need('PLATFORM_SITE_KEY'),
    outDir: need('OUT_DIR'),
    config: {
      ...AI_REALIZED,
      siteName: process.env.SITE_NAME ?? AI_REALIZED.siteName,
      homeUrl: process.env.SITE_HOME_URL ?? AI_REALIZED.homeUrl,
      siteBaseUrl: need('SITE_BASE_URL').replace(/\/+$/, ''),
      peoplePath: process.env.PEOPLE_PATH ?? '/people',
      privacyPolicyUrl: need('PRIVACY_POLICY_URL'),
    },
  });
  console.log(JSON.stringify(result));
}
