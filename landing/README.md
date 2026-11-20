# Ultharness landing page

A standalone product website for Ultharness, with responsive layouts, real app screenshots, an interactive delivery walkthrough, a setup guide, and the verified Mac installer.

## Preview locally

Requires Node.js. No dependencies or build step.

```sh
npm run dev
```

Open http://127.0.0.1:4380. Set PORT to use another local port.

## Files

- `dist/index.html`: product landing page.
- `dist/style.css`: design and responsive styles.
- `dist/site.js`: preview tabs, keyboard navigation, delivery walkthrough, mobile menu.
- `dist/guide.html`: installation and first-project guide.
- `dist/assets/`: original SVG mark and product screenshots using synthetic QA projects.
- `dist/downloads/`: Ultharness 0.3.1 for Apple silicon and its SHA-256 file.
- `.openai/hosting.json`: the existing Sites identity and static directory. Preserve its project_id for future updates.

Run `npm run check` for syntax checks. The landing page is independent of the desktop dashboard and doesn't use its private data, API keys, or local SQLite state. The walkthrough is explicitly illustrative and makes no model calls. Product screenshots use sample projects.

New Sites are private by default. Website publication does not change the desktop app's signing state: the current installer is ad-hoc signed, not Apple-notarized, and requires macOS 14 or later.
