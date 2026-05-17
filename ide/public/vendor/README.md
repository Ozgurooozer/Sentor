# vendor/

Place `mermaid.min.js` here. Download command:

```
curl -L https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js -o mermaid.min.js
```

Atlas-Maker generates vault pages that reference `/vendor/mermaid.min.js` instead of
a CDN link, so diagrams work offline. Vite and Tauri both serve `public/` as static assets.
