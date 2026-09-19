# DyNDy agent instructions

 The repository is a static web app located at the project root, not in a nested `kampaň` folder.
 The authoritative project sources are:
  `SRD_CC_v5.2.1.pdf`, `pravidla/zdroje/tvorba-postavy-2024.txt`,
  `svet/zdroje/specifikace-sveta-a-kampane.txt`, and `handouty/zdroje/pamflet-h.html`.
 Use those four sources as the only source of truth for rules, character creation, world, and campaign content. Use SRD 5.2.1 as the sole rules reference; do not derive new core content from PHB24.pdf, legacy markdown files, or `D&D.7z` directly.
 The app is currently focused on a character overview for the player: name, race, personal description, inventory management, item list, and character stats.
 Keep the implementation simple and centered on the player character sheet rather than broader DM/admin campaign tooling unless explicitly requested.
 Core files live in the root: `index.html`, `src/`, `content/`, `postavy/`, `lokace/`, `svet/`, and related source folders. Content loaded by core code must be registered in `content/manifest.json` and point only to the four authorized sources.
  3. `docker compose exec web ...` for checks, shell access, or static file validation
- Only rebuild when the Dockerfile or compose config is intentionally changed, or when the container does not exist.
- Do not run repeated `docker compose up --build` while the same container is already healthy.
- Keep the app running in a single container; do not create duplicate containers for the same project.
- The app is currently focused on a character overview for the player: name, race, personal description, inventory management, item list, and character stats.
- Keep the implementation simple and centered on the player character sheet rather than broader DM/admin campaign tooling unless explicitly requested.
- Core files live in the root: `index.html`, `src/`, `content/`, `postavy/`, `lokace/`, `svet/`, and related markdown content folders.
