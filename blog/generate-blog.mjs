import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BLOG_DIR = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = path.dirname(BLOG_DIR);
const POSTS_DIR = path.join(BLOG_DIR, "posts");
const ARCHIVE_PATH = path.join(PROJECT_ROOT, "blog.html");
const CSS_PATH = "./desk-notes.css";

const FONTS_HTML = `
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600;700&family=Silkscreen:wght@400;700&family=VT323&display=swap"
      rel="stylesheet"
    />`;

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseInline(text) {
  const escaped = escapeHtml(text);
  const linked = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
    const safeHref = escapeHtml(href);
    const external = /^https?:\/\//.test(href);
    const rel = external ? ' rel="noopener"' : "";
    const target = external ? ' target="_blank"' : "";
    return `<a href="${safeHref}"${target}${rel}>${label}</a>`;
  });

  return linked
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function parseFrontmatter(source) {
  if (!source.startsWith("---\n")) {
    throw new Error("Markdown post is missing frontmatter.");
  }

  const endIndex = source.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    throw new Error("Markdown post has unterminated frontmatter.");
  }

  const frontmatter = source.slice(4, endIndex).trim();
  const body = source.slice(endIndex + 5).trim();
  const data = {};

  for (const rawLine of frontmatter.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    data[key] = key === "tags" ? value.split(",").map((item) => item.trim()).filter(Boolean) : value;
  }

  return { data, body };
}

function parseSimpleBlocks(text) {
  const blocks = [];
  const lines = text.split("\n");
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (!line) {
      index += 1;
      continue;
    }

    if (line === "---") {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    if (line.startsWith(":::note ")) {
      const label = line.slice(":::note ".length).trim();
      index += 1;
      const inner = [];
      while (index < lines.length && lines[index].trim() !== ":::") {
        inner.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push({ type: "note", label, blocks: parseSimpleBlocks(inner.join("\n")) });
      continue;
    }

    if (line === ":::photos") {
      index += 1;
      const items = [];
      while (index < lines.length && lines[index].trim() !== ":::") {
        const itemLine = lines[index].trim();
        if (itemLine) {
          const [srcPart, captionPart = ""] = itemLine.split("|").map((item) => item.trim());
          items.push({ src: srcPart, caption: captionPart });
        }
        index += 1;
      }
      index += 1;
      blocks.push({ type: "photos", items });
      continue;
    }

    if (line === ":::links") {
      index += 1;
      const items = [];
      while (index < lines.length && lines[index].trim() !== ":::") {
        const itemLine = lines[index].trim();
        if (itemLine) {
          const [label, href] = itemLine.split("|").map((item) => item.trim());
          if (label && href) {
            items.push({ label, href });
          }
        }
        index += 1;
      }
      index += 1;
      blocks.push({ type: "links", items });
      continue;
    }

    if (line.startsWith("- ")) {
      const items = [];
      while (index < lines.length && lines[index].trim().startsWith("- ")) {
        items.push(lines[index].trim().slice(2).trim());
        index += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      lines[index].trim() !== "---" &&
      !lines[index].trim().startsWith(":::") &&
      !lines[index].trim().startsWith("- ")
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

function renderTextBlocks(blocks) {
  const parts = [];
  const proseBuffer = [];

  const flushProse = () => {
    if (!proseBuffer.length) {
      return;
    }
    parts.push(`<div class="post-prose">\n${proseBuffer.join("\n")}\n</div>`);
    proseBuffer.length = 0;
  };

  for (const block of blocks) {
    if (block.type === "paragraph") {
      proseBuffer.push(`<p>${parseInline(block.text)}</p>`);
      continue;
    }

    if (block.type === "list") {
      proseBuffer.push(
        `<ul>\n${block.items.map((item) => `  <li>${parseInline(item)}</li>`).join("\n")}\n</ul>`
      );
      continue;
    }

    flushProse();

    if (block.type === "rule") {
      parts.push('<div class="rule" aria-hidden="true"></div>');
      continue;
    }

    if (block.type === "note") {
      parts.push(
        `<div class="note-block">\n` +
          `  <span class="note-label">${escapeHtml(block.label)}</span>\n` +
          `  ${renderTextBlocks(block.blocks)}\n` +
          `</div>`
      );
      continue;
    }

    if (block.type === "photos") {
      const photoItems = block.items
        .map((item) => {
          if (item.src.startsWith("placeholder:")) {
            const placeholderLabel = escapeHtml(item.src.slice("placeholder:".length).trim());
            return (
              `<figure class="photo-card">\n` +
              `  <div class="photo-card__frame">${placeholderLabel}</div>\n` +
              `  <figcaption class="caption">${parseInline(item.caption)}</figcaption>\n` +
              `</figure>`
            );
          }

          const safeSrc = escapeHtml(item.src);
          const safeCaption = parseInline(item.caption);
          return (
            `<figure class="photo-card">\n` +
            `  <img class="photo-card__image" src="${safeSrc}" alt="${escapeHtml(item.caption || "Desk Notes photo")}" loading="lazy" />\n` +
            `  <figcaption class="caption">${safeCaption}</figcaption>\n` +
            `</figure>`
          );
        })
        .join("\n");

      parts.push(`<div class="photo-roll">\n${photoItems}\n</div>`);
      continue;
    }

    if (block.type === "links") {
      const linkItems = block.items
        .map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`)
        .join("\n");
      parts.push(`<div class="footer-links">\n${linkItems}\n</div>`);
    }
  }

  flushProse();

  return parts.join("\n");
}

function monthLabel(dateString) {
  const [year, month] = dateString.split("-");
  const monthIndex = Number(month) - 1;
  const labels = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  return { year, month: labels[monthIndex] ?? month, monthNumber: month };
}

function renderPage({ title, description, body, stylesheetHref }) {
  return (
    "<!DOCTYPE html>\n" +
    `<html lang="zh-CN">\n` +
    "  <head>\n" +
    '    <meta charset="UTF-8" />\n' +
    '    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />\n' +
    `    <title>${escapeHtml(title)}</title>\n` +
    `    <meta name="description" content="${escapeHtml(description)}" />\n` +
    `${FONTS_HTML}\n` +
    `    <link rel="stylesheet" href="${stylesheetHref}" />\n` +
    "  </head>\n" +
    "  <body>\n" +
    '    <a class="skip-link" href="#content">Skip to content</a>\n' +
    `${body}\n` +
    "  </body>\n" +
    "</html>\n"
  );
}

function renderArchive(posts) {
  const latest = posts[0];
  const groups = new Map();

  for (const post of posts) {
    const { year, month, monthNumber } = monthLabel(post.date);
    if (!groups.has(year)) {
      groups.set(year, new Map());
    }
    const months = groups.get(year);
    if (!months.has(monthNumber)) {
      months.set(monthNumber, { label: month, posts: [] });
    }
    months.get(monthNumber).posts.push(post);
  }

  const yearsHtml = [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, months]) => {
      const monthHtml = [...months.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([_monthNumber, monthGroup]) => {
          const entriesHtml = monthGroup.posts
            .map((post) => {
              const monthDay = post.date.slice(5);
              return (
                "              <li>\n" +
                `                <a class="entry-link" href="./blog/${post.outputFile}">\n` +
                `                  <span class="entry-date">${monthDay}</span>\n` +
                "                  <span class=\"entry-main\">\n" +
                `                    <strong class="entry-title">${escapeHtml(post.title)}</strong>\n` +
                `                    <span class="entry-excerpt">${escapeHtml(post.excerpt)}</span>\n` +
                "                  </span>\n" +
                `                  <span class="entry-tag">${escapeHtml(post.tags[0] ?? "note")}</span>\n` +
                "                </a>\n" +
                "              </li>"
              );
            })
            .join("\n");

          return (
            "          <section class=\"archive-month\" aria-labelledby=\"month-" + year + "-" + monthGroup.label.toLowerCase() + "\">\n" +
            "            <div class=\"archive-month__head\">\n" +
            `              <h3 class="archive-month__title" id="month-${year}-${monthGroup.label.toLowerCase()}">${monthGroup.label}</h3>\n` +
            `              <span class="archive-month__count">${monthGroup.posts.length} posts</span>\n` +
            "            </div>\n" +
            "            <ol class=\"entry-list\">\n" +
            `${entriesHtml}\n` +
            "            </ol>\n" +
            "          </section>"
          );
        })
        .join("\n");

      const yearCount = [...months.values()].reduce((total, group) => total + group.posts.length, 0);
      return (
        `        <section class="archive-year" aria-labelledby="year-${year}">\n` +
        "          <div class=\"archive-year__head\">\n" +
        `            <h2 class="archive-year__title" id="year-${year}">${year}</h2>\n` +
        `            <span class="archive-year__count">${yearCount} entries</span>\n` +
        "          </div>\n" +
        `${monthHtml}\n` +
        "        </section>"
      );
    })
    .join("\n");

  const latestMonth = monthLabel(latest.date).month;

  const body =
    '    <header class="site-bar">\n' +
    '      <div class="site-bar__inner">\n' +
    '        <p class="site-bar__title">Desk Notes Archive</p>\n' +
    '        <nav class="site-nav" aria-label="Blog navigation">\n' +
    '          <a href="./index.html">Home</a>\n' +
    '          <a href="./blog.html" aria-current="page">Archive</a>\n' +
    `          <a href="./blog/${latest.outputFile}">Latest</a>\n` +
    '        </nav>\n' +
    '      </div>\n' +
    '    </header>\n\n' +
    '    <main class="archive-shell" id="content">\n' +
    '      <section class="archive-card" aria-labelledby="archive-title">\n' +
    '        <p class="hero-kicker">Fragments / Photos / Notes</p>\n' +
    '        <h1 class="hero-title" id="archive-title">Desk Notes</h1>\n' +
    '        <p class="hero-desc">\n' +
    '          A running archive for small daily entries, loose observations, and photo-led notes.\n' +
    '          The homepage stays compact; the changing material lives here.\n' +
    '        </p>\n\n' +
    '        <ul class="archive-summary" aria-label="Archive summary">\n' +
    `          <li>${latest.date.slice(0, 4)} archive</li>\n` +
    `          <li>${latestMonth}</li>\n` +
    `          <li>${posts.length} ${posts.length === 1 ? "entry" : "entries"}</li>\n` +
    '        </ul>\n\n' +
    '        <p class="archive-note">\n' +
    '          Inspired by the calm archive rhythm of\n' +
    '          <a href="https://aritang.github.io/archives/" target="_blank" rel="noopener">this reference</a>,\n' +
    '          but translated into the warmer paper-and-hardware language of the current site.\n' +
    '        </p>\n\n' +
    `${yearsHtml}\n` +
    '      </section>\n' +
    '    </main>';

  return renderPage({
    title: "Desk Notes Archive",
    description: "Desk Notes archive for short daily fragments, photos, and personal notes.",
    body,
    stylesheetHref: "./blog/desk-notes.css"
  });
}

function renderPost(post, latest) {
  const tagsHtml = post.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("\n          ");
  const nextPost = post.next ? `          <a href="./${post.next.outputFile}">Next</a>\n` : "";
  const body =
    '    <header class="site-bar">\n' +
    '      <div class="site-bar__inner">\n' +
    '        <p class="site-bar__title">Desk Notes</p>\n' +
    '        <nav class="site-nav" aria-label="Post navigation">\n' +
    '          <a href="../index.html">Home</a>\n' +
    '          <a href="../blog.html">Archive</a>\n' +
    `          <a href="./${latest.outputFile}">Latest</a>\n` +
    `${nextPost}` +
    '        </nav>\n' +
    '      </div>\n' +
    '    </header>\n\n' +
    '    <main class="post-shell" id="content">\n' +
    `      <article class="post-card" aria-labelledby="post-title">\n` +
    '        <a class="post-back" href="../blog.html">Back to archive</a>\n' +
    `        <p class="hero-kicker">${escapeHtml(post.kicker || post.tags[0] || "Note")}</p>\n` +
    `        <h1 class="post-title" id="post-title">${escapeHtml(post.title)}</h1>\n` +
    '        <p class="post-meta">\n' +
    `          <span>${escapeHtml(post.date)}</span>\n` +
    `          ${tagsHtml}\n` +
    '        </p>\n' +
    `        <p class="post-intro">${escapeHtml(post.intro)}</p>\n\n` +
    `${renderTextBlocks(post.blocks)}\n` +
    '      </article>\n' +
    '    </main>';

  return renderPage({
    title: post.title,
    description: `${post.title} — Desk Notes entry.`,
    body,
    stylesheetHref: CSS_PATH
  });
}

async function loadPosts() {
  const entries = await fs.readdir(POSTS_DIR, { withFileTypes: true });
  const posts = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }

    const sourcePath = path.join(POSTS_DIR, entry.name);
    const source = await fs.readFile(sourcePath, "utf8");
    const { data, body } = parseFrontmatter(source);
    const outputBase = path.basename(entry.name, ".md");

    if (!data.title || !data.date || !data.intro || !data.excerpt) {
      throw new Error(`Post ${entry.name} is missing required frontmatter fields.`);
    }

    posts.push({
      ...data,
      tags: Array.isArray(data.tags) ? data.tags : [],
      blocks: parseSimpleBlocks(body),
      sourceFile: entry.name,
      outputFile: `${outputBase}.html`
    });
  }

  posts.sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return a.outputFile.localeCompare(b.outputFile);
  });

  posts.forEach((post, index) => {
    post.next = posts[index + 1] ?? null;
  });

  return posts;
}

async function main() {
  const posts = await loadPosts();

  if (!posts.length) {
    throw new Error("No markdown posts found in blog/posts.");
  }

  await fs.writeFile(ARCHIVE_PATH, renderArchive(posts), "utf8");

  for (const post of posts) {
    await fs.writeFile(path.join(BLOG_DIR, post.outputFile), renderPost(post, posts[0]), "utf8");
  }

  console.log(`Generated ${posts.length} Desk Notes posts and blog.html from markdown sources.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
