# quarry docs

The documentation site for quarry: a static Next.js export that wears the app's own palette and
typography.

```sh
bun install
bun run dev        # http://localhost:4321
bun run build      # search index, then the static export in out/
bun run preview    # serve out/ locally
bun run typecheck
```

## How it is put together

| Piece         | Where                                                                                 |
| ------------- | ------------------------------------------------------------------------------------- |
| Pages         | `content/docs/*.mdx`, compiled on the server by `next-mdx-remote`                     |
| Routes        | one catch-all, `src/app/docs/[[...slug]]/page.tsx`, with `generateStaticParams`       |
| Nav and pager | `src/lib/nav.ts` — the sidebar, breadcrumbs, pager and search all read it             |
| Search        | `scripts/build-search.ts` writes `public/search-index.json` before the build          |
| Theme         | `src/app/styles/base.css` — token values copied from the app's One Dark and One Light |

Adding a page means three things: the MDX file, its frontmatter (`title`, `description`), and an
entry in `src/lib/nav.ts`. Nothing else — the sidebar, the pager, the index and the "edit this page"
link all derive from the nav.

## Theme

The site uses the app's tokens, not a lookalike palette. `base.css` carries the same `--bg`,
`--panel`, `--rail`, `--chrome`, `--line`, `--text`, `--muted`, `--accent`, `--hover`, `--danger`,
`--warn` and `--good` values as `src/lib/themes/builtin/one-dark.ts` and `one-light.ts`. If a palette
moves there, mirror it here.

Type is the app's too: `system-ui` / SF Pro Text for prose, `ui-monospace` / SF Mono for labels, key
caps and code. Labels are uppercase mono at 10px with `0.16em` tracking, exactly like the app's
section headings.

Code blocks are highlighted by shiki with both themes (`one-dark-pro` and `one-light`), so a token
carries a dark and a light colour and CSS picks one — no theme flash, no second highlight pass.
