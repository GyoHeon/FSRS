# Recall Room

A flashcard web app with FSRS-6 scheduling, account-based sync, and Anki package import. The interface uses native HTML controls and browser defaults. Anki archive and SQLite code loads only when an import starts.

## Build

Requires Node.js 20 or later.

```sh
npm ci
npm run build
```

The output is an ES-module Cloudflare Worker at `dist/server/index.js`. Bind a D1 database as `DB` and apply `drizzle/0000_collections.sql`. The deployed worker expects a trusted authentication gateway that strips client-supplied identity headers and sets `oai-authenticated-user-id` for authenticated requests. Keep the worker behind that gateway.

For ChatGPT Sites deployments, supply the site's own `.openai/hosting.json`.

## Import

Export a text-based `.apkg` or `.colpkg` with learning progress and import it from Settings. The app imports review history and saved due dates. Support is limited to basic text and cloze cards. Future scheduling can differ from Anki.
