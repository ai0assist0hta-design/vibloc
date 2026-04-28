# Playlist cover overrides

Drop square image files in this folder for any persona that should
ship with a custom playlist cover instead of the default 2×2
auto-mosaic of track artworks.

The seed (`src/features/dev/seedAgents.ts`) currently expects:

| File                             | Used by   | Vibe (matches the user's reference) |
|----------------------------------|-----------|-------------------------------------|
| `teddy-cool.jpg`                 | Omar      | Late-night cool — teddy bear with sunglasses + headphones |
| `jiji-cat.jpg`                   | Mei       | Minimal moody — black cat (Jiji-style) |
| `penguin-selfie.jpg`             | Sora      | Cute hipster — penguin with shades + iPhone selfie |
| `horse-motion.jpg`               | Kai       | Motion blur — silhouetted horse running |
| `unknown-silhouette.jpg`         | Ezra      | Dark / mystery — silhouette with light bar over eyes |

- Recommended size: ≥ 1200×1200 px, JPG (smaller = the runtime can't
  upsample). Square crop preferred — the renderer fills with cover.
- File names must match exactly (case-sensitive).
- New personas can be added by setting `customCoverUrl` on their
  Agent entry and dropping a matching file here.
- Personas without `customCoverUrl` automatically get the 4-frame
  mosaic of their top track artworks — no action needed.
