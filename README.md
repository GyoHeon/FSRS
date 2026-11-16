# Recall Room

[Open Recall Room](https://recall-room-mwilzvpa.minty-anole-5187.chatgpt.site/) (private, ChatGPT sign-in required)

A flashcard web app with FSRS-6 scheduling and account-based sync. The interface uses native HTML controls and browser defaults.

## Build

Requires Node.js 20 or later.

```sh
npm ci
npm run build
```

The output is an ES-module Cloudflare Worker at `dist/server/index.js`. Bind a D1 database as `DB` and apply `drizzle/0000_collections.sql`. The deployed worker expects a trusted authentication gateway that strips client-supplied identity headers and sets `oai-authenticated-user-id` for authenticated requests. Keep the worker behind that gateway.

For ChatGPT Sites deployments, supply the site's own `.openai/hosting.json`.
