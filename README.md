# VIBLOC — React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## 3D Avatar Setup (HEADZ)

The avatar system uses [HEADZ](https://threedeeshop.gumroad.com/l/BbsEv) by ThreeDee. The GLB files are **not committed to this repo** (license forbids redistribution — see [`docs/legal/headz-license.md`](docs/legal/headz-license.md)).

To regenerate the avatar files locally after cloning:

```bash
# 1. Purchase HEADZ from https://threedeeshop.gumroad.com/l/BbsEv
# 2. Unpack the "AVATAR FILE" folder somewhere
# 3. Install Blender (https://www.blender.org/)
# 4. Run:
AVATAR_FILE_DIR="/path/to/AVATAR FILE" ./scripts/headz/setup.sh
```

This produces:
- `public/models/headz/{f,m}-{white,black}.glb` — 4 Draco-compressed 3D heads (~590KB total)
- `public/avatars/headz-thumbs/{f,m}-{white,black}.png` — 4 pre-rendered 2D portraits (~60KB total)

The 3D heads power the rooftop avatars + profile editor; the 2D thumbs are used in tagger lists, the editor base picker, and any other spot where mounting a WebGL canvas would be wasteful.

The .blend file analysis that drives the export pipeline is documented in [`docs/headz-blend-analysis.md`](docs/headz-blend-analysis.md).

## Credits

3D characters powered by [HEADZ](https://threedeeshop.gumroad.com/) by ThreeDee. Used under personal / non-commercial license.



Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
