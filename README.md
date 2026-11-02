# Self-evolving network verifiers

Companion page for the HotNets 2026 paper *Self-evolving network verifiers*
(Protogeros, Schneider, Vanbever, ETH Zürich).

**Live page:** https://vanourogeros.github.io/self-evolving-network-verifiers/

The page explains the paper's problem and approach, then walks through two examples (BGP route
reflection and OSPF areas) and shows how an AI-driven loop fixed a verifier's
rules, version by version.

## Layout

- `docs/` is the site that GitHub Pages serves: plain HTML, CSS and
  JavaScript, with no build step and no external requests. All answers are
  precomputed and stored in `docs/data/`.
- `docs/.nojekyll` tells GitHub Pages to serve the files as they are.

## Running it locally

Open `docs/index.html` in a browser. No server is needed.

## Publishing

GitHub Pages deploys the `docs/` folder of the `main` branch
(Settings → Pages → Deploy from a branch → `main` / `/docs`).
Pushing to `main` updates the live page within a minute or two.

To update from the artifact source, run `./publish.sh` (it copies the site into
`docs/` and stamps the file links with the source commit so browsers don't mix
old cached scripts with the new page), then commit and push.
