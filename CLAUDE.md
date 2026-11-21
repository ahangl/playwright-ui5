# playwright-ui5

## Documentation style

Follow the [Google developer documentation style guide](https://developers.google.com/style) for all files in `docs/`, the README, and code comments. Where it conflicts with `docs/STYLE.md`, `docs/STYLE.md` wins.

- Second person ("you"), active voice, present tense. No future tense ("will").
- Sentence-case headings. Bare infinitives for task headings ("Find controls"). One H1 per page, no skipped heading levels.
- Use the serial (Oxford) comma. Use contractions where natural.
- Avoid "please", "simply", "just", "easy", and Latin abbreviations (write "for example", not "e.g.").
- Put conditions before instructions ("To deploy, run...").
- Numbered lists for sequential steps, bullets otherwise.
- Descriptive link text, never "click here" or "this page".
- Code font for code, commands, file names, and API names. Bold for UI labels (**Go**, **Save**).
- Keep pages concise and start new pages from `docs/_templates/`.
- Every page needs a quoted `description` in its frontmatter.

Before finishing docs work, run `npm run docs:build` (fails on dead links) and `npm run format`.

## TypeScript style

Follow the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html).

- Named exports only. No default exports.
- `const` and `let`, never `var`. Always use `===`. Semicolons required.
- Avoid `any`; use `unknown` or a specific type. Avoid type assertions and non-null assertions unless a comment justifies them.
- No `namespace`. Use ES modules.
- Naming: UpperCamelCase for types, classes, and enums; lowerCamelCase for variables, functions, and methods; CONSTANT_CASE for global constants. No `I` prefix on interfaces.
- Use `T[]` for simple array types.
- JSDoc (`/** */`) on exported APIs. Don't repeat types in JSDoc. Use `//` for implementation comments, and only to explain why.

Before finishing code work, run `npm run lint`, `npm run format`, `npm run typecheck`, and `npm test`.
