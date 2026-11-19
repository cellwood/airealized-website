// The files a person page loads besides its own HTML: the stylesheets, the timeline's script, the font files and
// the font's license.
// Whoever serves a person page (the website's build, the reader's preview, the control center's preview) serves
// exactly these, beside each other, because people.css finds site-style.css and the fonts by relative address.
export const KIT_ASSETS: Record<string, string> = {
  'people.css': 'text/css; charset=utf-8',
  'site-style.css': 'text/css; charset=utf-8',
  'people.js': 'text/javascript; charset=utf-8',
  'fonts/inter-tight-latin-500-normal.woff2': 'font/woff2',
  'fonts/inter-tight-latin-700-normal.woff2': 'font/woff2',
  'fonts/inter-tight-latin-ext-500-normal.woff2': 'font/woff2',
  'fonts/inter-tight-latin-ext-700-normal.woff2': 'font/woff2',
  'fonts/OFL.txt': 'text/plain; charset=utf-8',
};

// frame.ts is code, not a file a page loads. It is listed nowhere here on purpose.
export const kitAssetUrl = (name: string): URL => new URL(`./${name}`, import.meta.url);
