# Desk Notes Workflow

Write new entries in `blog/posts/*.md`, then regenerate the archive and post pages:

```bash
node blog/generate-blog.mjs
```

## Fast daily workflow

Copy the reusable template into `blog/posts/`, rename it with the date and slug, then edit it:

```bash
cp blog/post-template.md blog/posts/2026-03-22-my-note.md
```

Then open the new file, replace the frontmatter and text, delete any blocks you do not need,
and run:

```bash
node blog/generate-blog.mjs
```

## Required frontmatter

```md
---
title: My Entry
date: 2026-03-21
kicker: Template
tags: note, photo
excerpt: One-line archive summary.
intro: Short intro shown at the top of the post page.
---
```

## Supported body syntax

- Paragraphs
- Bullet lists using `- item`
- Horizontal divider using `---`
- Note blocks:

```md
:::note Filing Rule
Some text here.
:::
```

- Photo grids:

```md
:::photos
./media/example.jpg | Caption text
placeholder:Drop photo 02 here | Placeholder caption
:::
```

- Footer links:

```md
:::links
Open archive | ../blog.html
Open next post | ./2026-03-21-something.html
:::
```

Images referenced in posts should use paths that make sense from the generated HTML inside `blog/`.

Posts are ordered by date from newest to oldest. If multiple posts share the same date,
the filename decides their order, so naming them consistently is helpful.
