# HEADZ — Third-Party Asset License

VIBLOC uses 3D characters from **HEADZ** by ThreeDee for its avatar
system (rooftop building avatars, profile pictures, and the future
customizer).

- **Asset name:** HEADZ Cartoony Character Pack (Female + Male, 3 skin tones, 10 poses)
- **Source:** <https://threedeeshop.gumroad.com/l/BbsEv>
- **License purchase:** standard HEADZ license, purchased by the project owner
- **License key:** stored in the owner's password manager — **never committed to this repo**

## License terms (full text)

See `License.pdf` shipped with the HEADZ download. Summary:

### Granted rights
- Royalty-free use in personal AND commercial projects
- Modification of the resources allowed
- May be included in games, digital products, or websites for clients

### Prohibitions (the ones we must respect)
1. **No redistribution / resell / sub-license.** We may NOT offer the file
   downloads to third parties.
2. **No "additional attachment" in resalable web apps.** If VIBLOC is ever
   monetized (paid product, paywall, etc.), HEADZ assets cannot be bundled
   in the download/install package — that would be considered redistribution.
3. **No merchandising** (T-shirt prints, etc.).
4. **No competing service.** Cannot compile HEADZ illustrations to replicate
   a similar avatar marketplace.

## Email confirmation from ThreeDee (2026-04-18)

Sent to `samuel@threedee.design` describing our exact use case (React +
Three.js, exporting `.blend` to GLB, serving them via the web app for a
**non-commercial personal portfolio**, ThreeDee credit included).

> **Sam (ThreeDee):**
>
> 1. You should be good.
> 2. I don't think there are any restrictions. Last month, I exported
>    to GLB, and it worked nicely. I was baking them.

This explicit approval covers our specific use case. Screenshot of the
exchange is archived in the owner's records.

## Project guardrails (binding on every contributor)

These are baked into the codebase and **must not be removed without
re-confirming the license**:

| # | Rule | Where enforced |
|---|------|---------------|
| 1 | GLB files NEVER committed to the public repo | `.gitignore` excludes `public/models/headz/*.glb` |
| 2 | Each developer regenerates GLBs from their own HEADZ purchase | `scripts/headz/setup.sh` |
| 3 | No user-facing "download my avatar as GLB" feature | enforced in code review |
| 4 | VIBLOC stays non-commercial / personal portfolio | if this changes, re-contact ThreeDee |
| 5 | No merchandising of HEADZ characters | enforced in code review |
| 6 | No competing-service positioning | enforced in code review |
| 7 | ThreeDee credit displayed in README + site footer | `README.md` + footer component |

## What the build pipeline ships

When VIBLOC is deployed, the GLB files are baked into the build output
(part of the `dist/` folder served by the host). This matches the
"include this resource in your … website for a client" provision of
the license and was confirmed safe by Sam's email above.

If VIBLOC is ever forked into a paid product, every contributor must:

1. Remove HEADZ assets from the build
2. Re-contact ThreeDee for an extended/commercial license, or
3. Replace HEADZ with a different avatar source

## Contact

Questions about this license file → project owner.
Questions about the HEADZ license itself → samuel@threedee.design.
