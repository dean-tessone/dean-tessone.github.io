# Dean Tessone — personal site

A static personal portfolio built for GitHub Pages. It has no build step or dependencies.

## Preview locally

Open `index.html` directly, or run:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Live site

[dean-tessone.github.io](https://dean-tessone.github.io)

## Deployment

GitHub Pages publishes the site from the root of the `main` branch. Future pushes to `main` redeploy it automatically.

## Add work or writing

`index.html` is intentionally a single-page narrative. Add scale-specific work inside the four `.scale-chapter` articles, selected publications inside `.paper-list`, and future writing inside the `#notes` section. The microscope transitions and automatic/manual H&E–IMC switch live in `script.js`; their scale-specific microscopy layers live in `assets/`. No framework configuration is needed.
