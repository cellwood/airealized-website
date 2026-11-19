# The AI Realized website

This repository publishes the site at airealized.org with GitHub Pages. Today the site is the people pages
(`/people/`) and a front page that sends visitors to www.airealizedsummit.com. The rest of the AI Realized website
moves here later.

## What is here

| Path | What it is |
| --- | --- |
| `site/` | The site's own pages: the front page and the "not found" page. |
| `website-kit/src/` | The page template, the stylesheets, the font files and the one script for the person pages and the people list. A copy: the master is kept with the Platform that holds the profiles. |
| `.github/workflows/build-site.yml` | The build. It copies `site/`, builds the people pages from the Platform's API, and publishes to GitHub Pages. |

## What is never here

No profile content: no name, bio, photo or link of any person is committed to this repository, cached between
builds or printed in a build log. Each build asks the Platform's API for the pages that are live at that moment,
writes them into the published site with the Platform's copy of each picture, and deletes the earlier upload. A page that is taken down is gone from the
site at the next build, which the Platform starts itself.

## Settings the build needs

| Kind | Name | Value |
| --- | --- | --- |
| Repository secret | `PLATFORM_SITE_KEY` | The site's key, made on the Platform's control center. Never written anywhere else. |
| Repository variable | `PRIVACY_POLICY_URL` | The address of AI Realized's privacy policy. |

In Settings, Pages: the source is "GitHub Actions", and the custom domain is `airealized.org`.
