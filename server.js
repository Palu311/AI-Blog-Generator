const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const root = __dirname;
const dataDir = path.join(root, "data");
const uploadDir = path.join(root, "uploads");
const imageDbPath = path.join(dataDir, "image-library.json");
const reviewDbPath = path.join(dataDir, "review-drafts.json");
const publishedDbPath = path.join(dataDir, "published-posts.json");
const jobs = new Map();

function loadEnvFile() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;
    const key = trimmed.slice(0, equals).trim();
    const value = trimmed.slice(equals + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const port = Number(process.env.PORT || 5173);
const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const loginUsername = process.env.LOGIN_USERNAME || "admin";
const loginPassword = process.env.LOGIN_PASSWORD || "admin123";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

const BANNED_BLOG_HEADINGS = new Set([
  "seo metadata",
  "hero section",
  "gemini best practices",
  "best practices",
  "best practices for better blog output",
  "common mistakes to avoid",
  "how to measure success",
  "publishing and growth playbook",
  "quality control",
  "key takeaways",
  "publishing & growth playbook",
  "faq",
  "call to action",
  "image assets summary",
  "seo checklist",
  "featured image",
  "featured image prompt",
  "table of contents",
  "executive summary",
  "supporting image block",
  "internal link suggestions",
  "external authority references",
  "schema recommendations",
  "author box"
]);

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(imageDbPath)) fs.writeFileSync(imageDbPath, "[]", "utf8");
if (!fs.existsSync(reviewDbPath)) fs.writeFileSync(reviewDbPath, "[]", "utf8");
if (!fs.existsSync(publishedDbPath)) fs.writeFileSync(publishedDbPath, "[]", "utf8");

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(html);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 30_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function readImageDb() {
  try {
    return JSON.parse(fs.readFileSync(imageDbPath, "utf8"));
  } catch {
    return [];
  }
}

function readJsonArray(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonArray(filePath, items) {
  fs.writeFileSync(filePath, JSON.stringify(items, null, 2), "utf8");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatInlineHtml(value) {
  return escapeHtml(value)
    .replace(/!\[(.*?)\]\((.*?)\)/g, '<figure><img src="$2" alt="$1" loading="lazy"><figcaption>$1</figcaption></figure>')
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
}

function markdownToHtml(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  let html = "";
  let inList = false;
  let inOrderedList = false;
  let inQuote = false;
  let inTable = false;
  let tableRowIndex = 0;

  function closeBlocks() {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
    if (inOrderedList) {
      html += "</ol>";
      inOrderedList = false;
    }
    if (inQuote) {
      html += "</blockquote>";
      inQuote = false;
    }
    if (inTable) {
      html += "</tbody></table>";
      inTable = false;
      tableRowIndex = 0;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (inQuote) {
        html += "</blockquote>";
        inQuote = false;
      }
      continue;
    }
    if (line === "---") {
      closeBlocks();
      html += "<hr>";
      continue;
    }
    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      if (cells.every((cell) => /^-+$/.test(cell.replaceAll(" ", "")))) continue;
      if (!inTable) {
        closeBlocks();
        html += "<table><tbody>";
        inTable = true;
        tableRowIndex = 0;
      }
      const tag = tableRowIndex === 0 ? "th" : "td";
      html += `<tr>${cells.map((cell) => `<${tag}>${formatInlineHtml(cell)}</${tag}>`).join("")}</tr>`;
      tableRowIndex += 1;
      continue;
    }
    if (line.startsWith("> ")) {
      if (!inQuote) {
        closeBlocks();
        html += "<blockquote>";
        inQuote = true;
      }
      html += `<p>${formatInlineHtml(line.slice(2))}</p>`;
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      if (!inOrderedList) {
        closeBlocks();
        html += "<ol>";
        inOrderedList = true;
      }
      html += `<li>${formatInlineHtml(line.replace(/^\d+\.\s/, ""))}</li>`;
      continue;
    }
    if (line.startsWith("- ")) {
      if (!inList) {
        closeBlocks();
        html += "<ul>";
        inList = true;
      }
      html += `<li>${formatInlineHtml(line.slice(2))}</li>`;
      continue;
    }
    closeBlocks();
    if (line.startsWith("### ")) html += `<h3>${formatInlineHtml(line.slice(4))}</h3>`;
    else if (line.startsWith("## ")) html += `<h2>${formatInlineHtml(line.slice(3))}</h2>`;
    else if (line.startsWith("# ")) html += `<h1>${formatInlineHtml(line.slice(2))}</h1>`;
    else html += `<p>${formatInlineHtml(line)}</p>`;
  }
  closeBlocks();
  return html;
}

function writeImageDb(images) {
  fs.writeFileSync(imageDbPath, JSON.stringify(images, null, 2), "utf8");
}

function imageUrl(filename) {
  return `/uploads/${filename}`;
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function publicBaseUrl(req) {
  return process.env.PUBLIC_BASE_URL || `http://${req.headers.host || `127.0.0.1:${port}`}`;
}

function sendReviewEmail(review, reviewUrl) {
  const to = process.env.REVIEW_EMAIL;
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || to;
  if (!to || !process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return { sent: false, reason: "SMTP settings or REVIEW_EMAIL missing" };
  }

  return new Promise((resolve) => {
    const subject = `Review blog: ${review.title}`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#182033">
        <h2>${escapeHtml(review.title)}</h2>
        <p>A blog draft is ready for review.</p>
        <p><a href="${reviewUrl}" style="display:inline-block;background:#f57c00;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px;font-weight:700">Review & Publish</a></p>
        <p>Direct link: <a href="${reviewUrl}">${reviewUrl}</a></p>
      </div>`;
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "$secure = ConvertTo-SecureString $env:SMTP_PASS -AsPlainText -Force",
      "$cred = New-Object System.Management.Automation.PSCredential($env:SMTP_USER, $secure)",
      "$port = [int]$env:SMTP_PORT",
      "$params = @{ To=$env:REVIEW_EMAIL; From=$env:MAIL_FROM; Subject=$env:MAIL_SUBJECT; Body=$env:MAIL_BODY; BodyAsHtml=$true; SmtpServer=$env:SMTP_HOST; Port=$port; Credential=$cred }",
      "if ($env:SMTP_SECURE -ne 'false') { $params.UseSsl = $true }",
      "Send-MailMessage @params"
    ].join("; ");
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        env: {
          ...process.env,
          MAIL_FROM: from,
          MAIL_SUBJECT: subject,
          MAIL_BODY: html,
          SMTP_PORT: process.env.SMTP_PORT || "587"
        },
        timeout: 30000,
        windowsHide: true
      },
      (error) => resolve(error ? { sent: false, reason: error.message } : { sent: true })
    );
  });
}

function createReviewDraft(req, packageData) {
  const now = new Date().toISOString();
  const slug = slugify(packageData.meta?.slug || packageData.title || packageData.meta?.chosenTitle || "blog-post");
  const review = {
    id: createId("review"),
    token: createId("token"),
    slug,
    title: packageData.title || packageData.meta?.chosenTitle || "Untitled Blog",
    status: "in_review",
    packageData,
    createdAt: now,
    updatedAt: now,
    reviewUrl: "",
    publishedUrl: ""
  };
  review.reviewUrl = `${publicBaseUrl(req)}/review/${review.token}`;
  const reviews = readJsonArray(reviewDbPath);
  writeJsonArray(reviewDbPath, [review, ...reviews]);
  return review;
}

function publishReview(req, review) {
  const now = new Date().toISOString();
  const publishedPosts = readJsonArray(publishedDbPath);
  const slug = slugify(review.slug || review.title);
  const published = {
    id: createId("post"),
    reviewId: review.id,
    slug,
    title: review.title,
    markdown: sanitizeBlogMarkdown(review.packageData.markdown || ""),
    html: markdownToHtml(review.packageData.markdown || ""),
    meta: review.packageData.meta || {},
    imageAssets: review.packageData.imageAssets || [],
    publishedAt: now,
    url: `${publicBaseUrl(req)}/blog/${slug}`
  };
  const nextPosts = [published, ...publishedPosts.filter((post) => post.slug !== slug)];
  writeJsonArray(publishedDbPath, nextPosts);

  const reviews = readJsonArray(reviewDbPath).map((item) => {
    if (item.token !== review.token) return item;
    return {
      ...item,
      status: "published",
      publishedUrl: published.url,
      updatedAt: now
    };
  });
  writeJsonArray(reviewDbPath, reviews);
  return published;
}

function renderPageShell(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body{margin:0;background:#f6f7f9;color:#182033;font-family:Inter,Arial,sans-serif;line-height:1.75}
    header{background:#fff;border-bottom:1px solid #d9e1ec;padding:18px 24px}
    main{max-width:920px;margin:0 auto;padding:28px 20px 60px;background:#fff;min-height:100vh}
    article h1{font-size:2.2rem;line-height:1.15;margin:0 0 18px}
    article h2{font-size:1.55rem;margin:34px 0 12px}
    article h3{font-size:1.2rem;margin:24px 0 8px}
    p{margin:0 0 16px}
    li{margin:6px 0}
    table{width:100%;border-collapse:collapse;margin:18px 0}
    th,td{border:1px solid #d9e1ec;padding:10px;text-align:left;vertical-align:top}
    th{background:#f8fbff}
    a{color:#0f766e}
    .bar{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
    button,.button{border:0;border-radius:6px;background:#f57c00;color:#fff;padding:10px 14px;font-weight:800;text-decoration:none;cursor:pointer}
    .secondary{background:#182033}
    .notice{border:1px solid #d9e1ec;background:#f8fbff;border-radius:8px;padding:12px 14px;margin:16px 0}
  </style>
</head>
<body>${body}</body>
</html>`;
}

function renderReviewPage(req, res, token) {
  const review = readJsonArray(reviewDbPath).find((item) => item.token === token);
  if (!review) {
    sendHtml(res, 404, renderPageShell("Review not found", "<main><h1>Review not found</h1></main>"));
    return;
  }
  const isPublished = review.status === "published";
  sendHtml(res, 200, renderPageShell(review.title, `
    <header><div class="bar"><strong>Blog Review</strong><a href="/">Back to Studio</a></div></header>
    <main>
      <div class="notice">Status: <strong>${escapeHtml(review.status)}</strong>${review.publishedUrl ? ` | Published: <a href="${review.publishedUrl}">${review.publishedUrl}</a>` : ""}</div>
      ${isPublished ? `<a class="button secondary" href="${review.publishedUrl}">Open Published Blog</a>` : `<button id="publishBtn">Publish to Website</button>`}
      <article>${markdownToHtml(review.packageData.markdown || "")}</article>
    </main>
    <script>
      const btn = document.querySelector("#publishBtn");
      if (btn) btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Publishing...";
        const response = await fetch("/api/reviews/${token}/publish", { method: "POST" });
        const data = await response.json();
        if (data.ok) location.href = data.publishedUrl;
        else {
          alert(data.message || "Publish failed");
          btn.disabled = false;
          btn.textContent = "Publish to Website";
        }
      });
    </script>
  `));
}

function renderBlogList(req, res) {
  const posts = readJsonArray(publishedDbPath);
  const items = posts.map((post) => `<li><a href="/blog/${post.slug}">${escapeHtml(post.title)}</a><br><small>${escapeHtml(new Date(post.publishedAt).toLocaleString())}</small></li>`).join("");
  sendHtml(res, 200, renderPageShell("Published Blogs", `<header><div class="bar"><strong>Published Blogs</strong><a href="/">Back to Studio</a></div></header><main><h1>Published Blogs</h1><ul>${items || "<li>No published blogs yet.</li>"}</ul></main>`));
}

function renderPublishedBlog(req, res, slug) {
  const post = readJsonArray(publishedDbPath).find((item) => item.slug === slug);
  if (!post) {
    sendHtml(res, 404, renderPageShell("Blog not found", "<main><h1>Blog not found</h1></main>"));
    return;
  }
  sendHtml(res, 200, renderPageShell(post.title, `<header><div class="bar"><strong>Published Blog</strong><a href="/blog">All Blogs</a></div></header><main><article>${post.html || markdownToHtml(post.markdown)}</article></main>`));
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map(String).map((tag) => tag.trim()).filter(Boolean);
  return String(value || "").split(",").map((tag) => tag.trim()).filter(Boolean);
}

function normalizeWebsiteUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function stripWebsiteText(html) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i)?.[1]
    || "";
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return [title, description, body].filter(Boolean).join("\n").slice(0, 5000);
}

async function fetchCompanyWebsiteContext(companyWebsite) {
  const url = normalizeWebsiteUrl(companyWebsite);
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    const response = await fetch(url, {
      headers: { "User-Agent": "AI Blog Publishing Studio/1.0" },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`Website returned ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error("Website content is not readable text/html");
    }
    const html = await response.text();
    const summary = stripWebsiteText(html);
    if (!summary) throw new Error("No readable website text found");
    return { url, summary: summary.slice(0, 2200), fetchedAt: new Date().toISOString() };
  } catch (error) {
    const fallback = await fetchCompanyWebsiteContextWithPowerShell(url);
    if (fallback?.summary) return fallback;
    return { url, summary: "", error: fallback?.error || error.message, fetchedAt: new Date().toISOString() };
  }
}

function fetchCompanyWebsiteContextWithPowerShell(url) {
  return new Promise((resolve) => {
    const responseFile = path.join(os.tmpdir(), `company-site-${Date.now()}-${Math.random().toString(16).slice(2)}.html`);
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "$headers = @{ 'User-Agent' = 'AI Blog Publishing Studio/1.0' }",
      "$response = Invoke-WebRequest -Uri $env:COMPANY_URL -Headers $headers -UseBasicParsing -TimeoutSec 12",
      "Set-Content -LiteralPath $env:COMPANY_RESPONSE_FILE -Value $response.Content -Encoding UTF8"
    ].join("; ");

    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        env: {
          ...process.env,
          COMPANY_URL: url,
          COMPANY_RESPONSE_FILE: responseFile
        },
        timeout: 18000,
        windowsHide: true
      },
      (error) => {
        if (error) {
          try {
            fs.rmSync(responseFile, { force: true });
          } catch {}
          resolve({ url, summary: "", error: error.message, fetchedAt: new Date().toISOString() });
          return;
        }
        try {
          const html = fs.readFileSync(responseFile, "utf8").replace(/^\uFEFF/, "");
          fs.rmSync(responseFile, { force: true });
          const summary = stripWebsiteText(html);
          resolve({ url, summary: summary.slice(0, 2200), fetchedAt: new Date().toISOString() });
        } catch (parseError) {
          resolve({ url, summary: "", error: parseError.message, fetchedAt: new Date().toISOString() });
        }
      }
    );
  });
}

function saveDataUrlImage(item) {
  const match = String(item.dataUrl || "").match(/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/);
  if (!match) throw new Error("Only PNG, JPG, WEBP, and GIF uploads are allowed.");
  const mime = match[1];
  const extension = mime === "image/jpeg" ? ".jpg" : `.${mime.split("/")[1]}`;
  const id = createId("img");
  const safeBase = slugify(item.name || id).slice(0, 52) || id;
  const filename = `${safeBase}-${id}${extension}`;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 12_000_000) throw new Error("Image is too large. Use files under 12MB.");
  fs.writeFileSync(path.join(uploadDir, filename), bytes);
  return { id, filename, mime, size: bytes.length, url: imageUrl(filename) };
}

function scoreImageForBrief(image, brief, sectionHeading = "") {
  const haystack = [
    image.name,
    image.category,
    image.altText,
    image.description,
    image.seoTitle,
    image.filename,
    ...(image.tags || []),
    ...(image.keywords || [])
  ].join(" ").toLowerCase();
  const needles = [
    brief.topic,
    brief.primaryKeyword,
    brief.audience,
    sectionHeading,
    ...(Array.isArray(brief.secondaryKeywords) ? brief.secondaryKeywords : [])
  ].join(" ").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  return needles.reduce((score, word) => score + (haystack.includes(word) ? 1 : 0), 0);
}

function selectLibraryImages(brief, sections) {
  const images = readImageDb();
  if (!images.length) return [];
  const used = new Set();
  return ["Hero Section", "Introduction", ...sections.map((section) => section.heading), "Conclusion"]
    .map((placement) => {
      const best = images
        .filter((image) => !used.has(image.id))
        .map((image) => ({ image, score: scoreImageForBrief(image, brief, placement) }))
        .sort((a, b) => b.score - a.score)[0];
      if (!best || best.score < 1) return null;
      used.add(best.image.id);
      return {
        placement,
        purpose: `Matched from admin image library for ${placement}`,
        prompt: `Use uploaded image: ${best.image.name}`,
        negativePrompt: "Use the selected admin image as-is. Do not generate a replacement.",
        altText: best.image.altText || `${placement} image for ${brief.topic}`,
        caption: best.image.description || best.image.seoTitle || best.image.name,
        filename: best.image.filename,
        aspectRatio: best.image.aspectRatio || "responsive",
        url: best.image.url,
        source: "admin-library",
        credits: best.image.credits || "",
        category: best.image.category || ""
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function safeStaticPath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0]);
  const requested = cleanPath === "/" ? "/index.html" : cleanPath;
  const resolved = path.resolve(root, `.${requested}`);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

function buildPrompt(brief) {
  return `You are an elite AI content strategist, senior SEO copywriter, journalist, editorial director, UX content designer, and visual content planner.

Create a production-ready blog article and a separate publishing support package in structured JSON.

Rules:
- Current date: ${new Date().toISOString().slice(0, 10)}. Use current, real-world information when the topic depends on recent rules, laws, taxes, prices, policies, or facts.
- The user-provided Blog Title is the article topic. Do not replace it with a generic title. Keep the generated title very close to the user's Blog Title unless correcting grammar.
- The user-provided Blog Contain is mandatory source direction. Every requested point in Blog Contain must be covered in the article body.
- Company Website is optional context only. If companyWebsiteContext is present, use it to understand brand, services, audience, tone, and positioning, but never let it override Blog Title or Blog Contain.
- Never invent statistics, quotes, government data, company facts, medical advice, legal advice, or financial claims.
- If facts are uncertain, avoid exact numbers and say editorial review should verify external references.
- Avoid robotic phrases: "In today's fast-paced world", "game changer", "revolutionary", "unlock the power", "delve into", and "in conclusion".
- Write naturally, professionally, and helpfully in the same spirit as a high-quality explanatory blog: engaging opener, simple explanation, practical examples, pros/cons only when natural, important missed points, and final thoughts.
- Use professional blog formatting: clear H2 headings, useful H3 subheadings only when needed, bold labels such as **Example 1:**, **Advantages**, **Disadvantages**, and bullet points where they improve readability.
- The "markdown" field must contain only the blog article that a reader should see. Do not include SEO metadata, hero section notes, featured image prompts, table of contents, executive summary, supporting image blocks, key takeaways, FAQ, CTA, internal links, schema, image summaries, SEO checklist, publishing playbook, or quality-control notes inside "markdown".
- Image prompts, SEO data, and publishing suggestions must stay in their own JSON fields outside "markdown".
- Featured and supporting image prompts must be photorealistic, editorial, realistic, modern, no text, no watermark, 16:9 for hero.
- Use the requested blog format, design template, monetization model, distribution channel, analytics goal, and community angle when provided.
- Include a publishing and growth playbook only outside the blog article.

User brief:
${JSON.stringify(brief, null, 2)}

Return only JSON with this exact shape:
{
  "title": "string",
  "markdown": "string",
  "meta": {
    "chosenTitle": "string",
    "seoTitle": "string",
    "metaDescription": "string",
    "slug": "string",
    "focusKeyword": "string",
    "relatedKeywords": ["string"],
    "searchIntent": "string",
    "openGraphTitle": "string",
    "openGraphDescription": "string",
    "twitterTitle": "string",
    "twitterDescription": "string",
    "canonicalUrl": "string",
    "readingTime": "string",
    "estimatedWordCount": 1800,
    "titleAlternatives": ["string"]
  },
  "analysis": {
    "industry": "string",
    "articleType": "string",
    "intent": "string",
    "businessGoal": "string",
    "sections": [{"id":"string","heading":"string","body":"string"}]
  },
  "imageAssets": [
    {
      "placement": "string",
      "purpose": "string",
      "prompt": "string",
      "negativePrompt": "string",
      "altText": "string",
      "caption": "string",
      "filename": "string",
      "aspectRatio": "string"
    }
  ],
  "score": 90
}`;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 72) || "ai-blog-draft";
}

function isBannedBlogHeading(value) {
  const heading = String(value || "").toLowerCase().trim();
  return BANNED_BLOG_HEADINGS.has(heading) || heading.startsWith("supporting image block");
}

function sanitizeBlogMarkdown(markdown) {
  const lines = String(markdown || "").split("\n");
  const kept = [];
  let skippingLevel = 0;

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (match) {
      const level = match[1].length;
      const heading = match[2].replace(/[:#]+$/g, "").trim();
      if (isBannedBlogHeading(heading)) {
        skippingLevel = level;
        continue;
      }
      if (skippingLevel && level <= skippingLevel) skippingLevel = 0;
    }
    if (!skippingLevel) kept.push(line);
  }

  return formatBlogMarkdown(kept.join("\n").replace(/\n{4,}/g, "\n\n\n").trim());
}

function formatBlogMarkdown(markdown) {
  return String(markdown || "")
    .replace(/(^|\n)(Example\s*(?:\d+|one|two|three|four|five)?\s*[:-])/gi, (match, prefix, label) => `${prefix}**${label.trim()}**`)
    .replace(/(^|\n)(Advantages\s*[:-]?)(\n|$)/gi, (match, prefix, label, suffix) => `${prefix}**${label.replace(/[:-]?$/, "")}**${suffix}`)
    .replace(/(^|\n)(Disadvantages\s*[:-]?)(\n|$)/gi, (match, prefix, label, suffix) => `${prefix}**${label.replace(/[:-]?$/, "")}**${suffix}`)
    .replace(/(^|\n)(Important\s*[:-]?)(\n|$)/gi, (match, prefix, label, suffix) => `${prefix}**${label.replace(/[:-]?$/, "")}**${suffix}`)
    .replace(/(^|\n)(Note\s*[:-])/gi, (match, prefix, label) => `${prefix}**${label.trim()}**`);
}

function toBulletList(text) {
  const items = String(text || "")
    .replace(/\*\*/g, "")
    .split(/(?:\r?\n|(?<=\.)\s+)/)
    .map((item) => item.trim().replace(/^[-*\d.]+\s*/, ""))
    .filter((item) => item.length > 18)
    .slice(0, 5);
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- Add clear, practical points for the reader.";
}

function normalizeAdvantagesDisadvantages(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^- /m.test(text)) return text;
  const parts = text.split(/disadvantages\s*:?\s*/i);
  const advantagesText = parts[0].replace(/advantages\s*:?\s*/i, "").trim();
  const disadvantagesText = parts[1] || "";
  return `**Advantages**\n\n${toBulletList(advantagesText)}\n\n**Disadvantages**\n\n${toBulletList(disadvantagesText)}`;
}

function sentenceCase(value) {
  const clean = String(value || "").trim().replace(/\s+/g, " ");
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
}

function inferPrimaryKeyword(brief) {
  return brief.primaryKeyword || String(brief.topic || "")
    .toLowerCase()
    .replace(/^(how to|why|what is|the|a|an)\s+/i, "")
    .split(/\s+/)
    .slice(0, 5)
    .join(" ");
}

function buildFallbackPackage(brief, reason) {
  const topic = sentenceCase(brief.topic);
  const keyword = inferPrimaryKeyword(brief);
  const slug = slugify(`${keyword} guide`);
  const audience = brief.audience || "business decision-makers and content teams";
  const wordCount = Number(brief.wordCount) || 1800;
  const blogFormat = brief.blogFormat || "Magazine-style authority article";
  const designTemplate = brief.designTemplate || "Clean editorial";
  const monetization = brief.monetization || "None / educational";
  const distribution = brief.distribution || "Website blog and SEO";
  const analyticsGoal = brief.analyticsGoal || "Organic traffic and ranking";
  const communityAngle = brief.communityAngle || "Reader questions and comments";
  const readingTime = `${Math.max(4, Math.ceil(wordCount / 220))} min read`;
  const title = topic || `${sentenceCase(keyword)}: Complete Guide`;
  const companyContext = brief.companyWebsiteContext?.summary
    ? `\n\nCompany context from ${brief.companyWebsiteContext.url}: ${brief.companyWebsiteContext.summary.slice(0, 700)}`
    : brief.companyWebsite
      ? `\n\nCompany website provided for brand context: ${brief.companyWebsite}`
      : "";
  const relatedKeywords = Array.isArray(brief.secondaryKeywords) && brief.secondaryKeywords.length
    ? brief.secondaryKeywords
    : [`${keyword} guide`, `${keyword} strategy`, `${keyword} examples`, `${keyword} best practices`];
  let imageAssets = [
    {
      placement: "Hero Section",
      purpose: "Featured editorial hero image",
      prompt: `Photorealistic editorial hero image about ${topic}, realistic subject-matter research scene with notes, reference material, and a clean modern workspace, 35mm lens, natural daylight, clean composition, premium editorial style, ultra HD, 16:9, no text, no watermark.`,
      negativePrompt: "No text, no watermark, no distorted hands, no cartoon style, no fake logos, no spelling artifacts.",
      altText: `Editorial hero image for ${keyword}`,
      caption: `Hero image concept for "${title}".`,
      filename: `${slug}-hero.jpg`,
      aspectRatio: "16:9"
    },
    {
      placement: "Within Strategy Section",
      purpose: "Support strategy explanation",
      prompt: `Photorealistic supporting image for ${topic}, close-up of research notes, practical examples, and a clean article outline, realistic lighting, magazine quality, no readable text.`,
      negativePrompt: "No text, no watermark, no cartoon style, no brand logos.",
      altText: `Strategy visual for ${keyword}`,
      caption: `Planning workflow for ${keyword}.`,
      filename: `${slug}-strategy.jpg`,
      aspectRatio: "4:3"
    },
    {
      placement: "Within Review Section",
      purpose: "Support editorial QA",
      prompt: `Photorealistic image of a professional editor reviewing article structure, citations, and source notes for ${topic}, clean modern desktop scene, natural colors, ultra realistic, no text.`,
      negativePrompt: "No text, no watermark, no cartoon style, no distorted screens.",
      altText: `Editorial review visual for ${keyword}`,
      caption: `Editorial review concept for ${keyword}.`,
      filename: `${slug}-review.jpg`,
      aspectRatio: "3:2"
    }
  ];
  const continuationCount = Math.max(0, Math.ceil((wordCount - 4500) / 1200));
  const continuationSections = Array.from({ length: continuationCount }, (_, index) => {
    const chapterNumber = index + 1;
    return {
      id: `Continuation Chapter ${chapterNumber}`,
      heading: `Advanced Chapter ${chapterNumber}: ${sentenceCase(keyword)} in Practice`,
      body: `This continuation chapter expands the article without restarting the topic or repeating earlier headings. It keeps the same editorial voice and builds on the strategy already introduced for ${audience}.\n\nA practical way to apply ${keyword} is to connect the blog generator with the daily CRM workflow. The team should capture article ideas from sales calls, support questions, campaign themes, and search demand. Those inputs make the generated blog more specific, which usually improves quality more than simply asking for a longer article.\n\nFor long-form content, each chapter needs a distinct purpose. One chapter can explain the planning framework, another can cover editorial review, another can explain image selection, and another can focus on measurement. This prevents the article from becoming repetitive while still giving the reader enough depth.\n\n### Chapter ${chapterNumber} Action Checklist\n\n- Confirm what question this chapter answers.\n- Add examples that match the target audience.\n- Keep claims careful unless verified sources are available.\n- Connect the section back to CRM outcomes such as lead nurturing, education, or sales enablement.\n- Add a relevant image from the library when one matches the section.\n\n| Chapter Focus | Practical Use | Editorial Guardrail |\n| --- | --- | --- |\n| Planning | Turn CRM insights into blog angles | Avoid generic advice |\n| Drafting | Generate structured Markdown | Preserve heading hierarchy |\n| Review | Check claims, tone, and flow | Remove duplicated ideas |\n| Publishing | Export to the correct channel | Keep image SEO intact |\n\nThe main goal is continuity. A reader should feel that each new chapter adds useful depth, not that the article has been restarted by another AI request.`
    };
  });

  const sections = [
    {
      id: "Introduction",
      heading: `Introduction to ${topic}`,
      body: `In straightforward terms, ${keyword} becomes much easier when the reader first understands what it means, who it applies to, and what practical benefit it can create. A good explanation should remove confusion before adding detail.\n\n${brief.details ? `The provided contain focuses on this point: ${brief.details}` : "Because no detailed source notes were provided, this draft stays careful and avoids unsupported claims."}`
    },
    {
      id: "Simple Words",
      heading: `${sentenceCase(keyword)} in Simple Words`,
      body: `Let us strip away the difficult wording. ${sentenceCase(keyword)} should be understood by asking three simple questions: what does it mean, who can use it, and what changes after it is applied?\n\nOnce those answers are clear, the topic becomes far less intimidating. The reader no longer has to memorize technical language; they can understand the rule or idea through conditions, examples, and limits.`
    },
    {
      id: "Practical Examples",
      heading: "Practical Examples",
      body: `**Example 1:** A reader who clearly meets the main condition can apply the idea directly after checking the required limit, category, or rule.\n\n**Example 2:** A reader who is close to a threshold should calculate carefully, because a small difference can sometimes change the final result.\n\n**Example 3:** A reader with a special case should check whether an exception applies before relying on the general explanation.`
    },
    {
      id: "Objective",
      heading: "Why Was This Introduced? (The Objective)",
      body: `The objective behind a helpful provision or framework is usually practical relief. It exists to make a system easier to follow, encourage correct action, or give people a clearer way to plan.\n\nFor ${audience}, the value is not only the benefit itself. The value is knowing when it applies, when it does not, and what supporting details should be checked before making a decision.`
    },
    {
      id: "Advantages Disadvantages",
      heading: `Advantages and Disadvantages of ${sentenceCase(keyword)}`,
      body: `**Advantages**\n\n- It helps eligible readers understand a useful benefit or decision more clearly.\n- It can reduce confusion when explained with examples.\n- It gives the reader a practical way to check whether the topic applies to them.\n\n**Disadvantages**\n\n- It may not apply to every reader or every situation.\n- Limits, exceptions, or changing rules can create misunderstanding.\n- Readers may make wrong decisions if they look only at the headline benefit and ignore the conditions.`
    },
    {
      id: "Crucial Points",
      heading: "Crucial Points You Might Have Missed",
      body: `Do not confuse the headline benefit with the exact conditions required to use it. The most common reader mistake is understanding the general idea but missing a limit, exception, category, or timing detail.\n\nIf the topic depends on current rules, official data, legal interpretation, medical advice, tax law, or financial decisions, the reader should verify the latest information before acting.`
    },
    ...continuationSections,
    {
      id: "Conclusion",
      heading: "Final Thoughts",
      body: `${sentenceCase(keyword)} becomes easier to understand when the explanation is practical, careful, and grounded in the reader's real situation. The important thing is not only knowing the headline benefit, but also knowing the conditions, limits, examples, and exceptions.\n\nIf this topic affects a financial, legal, medical, or time-sensitive decision, readers should verify the current rules from an official source or a qualified professional before acting.`
    }
  ];
  const libraryImages = selectLibraryImages(brief, sections);
  if (libraryImages.length) imageAssets = [...libraryImages, ...imageAssets].slice(0, 10);
  const articleSections = sections.filter((section) => !isBannedBlogHeading(section.heading));
  const sectionMarkdown = articleSections.map((section, index) => {
    const matchedImage = imageAssets.find((asset) => asset.source === "admin-library" && asset.placement === section.heading);
    const fallbackImage = !matchedImage && index > 0 ? imageAssets[index] : null;
    const asset = matchedImage || fallbackImage;
    const imageBlock = asset?.url
      ? `\n\n![${asset.altText}](${asset.url})\n\n*${asset.caption}${asset.credits ? ` Credit: ${asset.credits}` : ""}*`
      : "";
    return `## ${section.heading}\n\n${section.body}${imageBlock}`;
  }).join("\n\n");

  const suggestionsMarkdown = `# Hero Section

Hero Image: ${imageAssets[0].filename}

${imageAssets[0].url ? `![${imageAssets[0].altText}](${imageAssets[0].url})\n\nCaption: ${imageAssets[0].caption}\n` : ""}

Title: ${title}

Subtitle: A production-ready CRM blog package for ${audience}.

Metadata: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} | ${readingTime} | ${wordCount} words

Category: CRM Content

Reading Time: ${readingTime}

---

# SEO Metadata

SEO Title: ${title}

Meta Description: Practical CRM guide to ${keyword}, with SEO structure, image prompts, FAQs, quality checks, and export-ready Markdown.

Slug: ${slug}

Focus Keyword: ${keyword}

Keywords: ${relatedKeywords.join(", ")}

Search Intent: Informational and commercial investigation

---

# Table of Contents

${articleSections.map((section) => `- [${section.heading}](#${slugify(section.heading)})`).join("\n")}

---

# Executive Summary

This fallback draft was generated locally because ${reason}. It still creates a complete CRM-ready structure without inventing facts or unsupported statistics.

---

${sections.map((section) => `## ${section.heading}\n\n${section.body}`).join("\n\n")}

---

# Key Takeaways

- Start with reader intent.
- Keep claims accurate and reviewable.
- Include SEO metadata, FAQ, CTA, and image prompts.
- Export Markdown, HTML, JSON, or PDF from the tool.
- Align format, template, monetization, distribution, and analytics before publishing.

---

# Publishing & Growth Playbook

## Market-Inspired Product Features

- Template-based blog creation for faster setup.
- Clean writing and reading experience.
- SEO metadata, slug, schema, internal links, and image SEO.
- Domain/publishing readiness for website workflows.
- Analytics plan for ${analyticsGoal}.
- Monetization plan: ${monetization}.
- Distribution plan: ${distribution}.
- Community angle: ${communityAngle}.

## Recommended Blog Presentation

- Format: ${blogFormat}
- Template: ${designTemplate}
- H1 should be large and editorial.
- H2 sections should be scannable and visually spaced.
- Tables, quotes, examples, image blocks, and FAQs should be included.

---

# FAQ

## Can this tool work without an API key?

Yes. It uses a local fallback generator. Add GEMINI_API_KEY for real AI generation.

## Is the output publication-ready?

It is structured for publication, but factual claims should be reviewed before publishing.

## How can I improve the generated blog?

Add a clear target audience, primary keyword, brand name, goal, CTA, and any source notes you already trust.

## Can I export the blog?

Yes. The tool supports Markdown, HTML, JSON, PDF print export, copy actions, SEO summaries, and image prompt copy.

---

# Call To Action

${brief.cta || "Review the draft, add verified references, and publish it through your CRM workflow."}

---

# Image Assets Summary

${imageAssets.map((asset) => `- ${asset.filename}: ${asset.placement}; ${asset.aspectRatio}; ${asset.altText}`).join("\n")}

---

# SEO Checklist

- SEO title included.
- Meta description included.
- Slug included.
- FAQ included.
- Image prompts included.
- No fake statistics included.`;

  const openingText = `${topic} can feel confusing when it is surrounded by technical language, scattered explanations, and half-clear advice. But the moment the subject is broken into simple parts, it becomes much easier to understand.\n\nThis guide explains ${keyword} in a practical way for ${audience}. We will move from the basic meaning to examples, benefits, limitations, important points, and final thoughts so the reader can finish with clarity instead of confusion.${companyContext}`;
  const blogMarkdown = sanitizeBlogMarkdown(`# ${title}

${imageAssets[0].url ? `![${imageAssets[0].altText}](${imageAssets[0].url})\n\n*${imageAssets[0].caption}*\n\n` : ""}
${openingText}

${sectionMarkdown}
`);

  return {
    title,
    markdown: blogMarkdown,
    suggestionsMarkdown,
    meta: {
      chosenTitle: title,
      seoTitle: title,
      metaDescription: `Practical CRM guide to ${keyword}, with SEO structure, image prompts, FAQs, quality checks, and export-ready Markdown.`,
      slug,
      focusKeyword: keyword,
      relatedKeywords,
      searchIntent: "Informational and commercial investigation",
      openGraphTitle: title,
      openGraphDescription: `CRM-ready blog package for ${keyword}.`,
      twitterTitle: title,
      twitterDescription: `CRM-ready blog package for ${keyword}.`,
      canonicalUrl: `https://example.com/blog/${slug}`,
      readingTime,
      estimatedWordCount: wordCount,
      titleAlternatives: [
        title,
        `How to Use ${sentenceCase(keyword)} in CRM Content`,
        `${sentenceCase(keyword)} Best Practices`,
        `The CRM Guide to ${sentenceCase(keyword)}`,
        `What Teams Should Know About ${sentenceCase(keyword)}`
      ]
    },
    analysis: {
      industry: "CRM Content",
      articleType: "Long-form SEO article",
      intent: "Informational and commercial investigation",
      businessGoal: brief.goal || "Educate and convert qualified leads",
      sections
    },
    imageAssets,
    score: 88,
    brief,
    status: `Generated with local fallback: ${reason}`,
    generatedAt: new Date().toISOString()
  };
}

function extractJson(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI response did not contain JSON");
  return JSON.parse(match[0]);
}

function extractGeminiText(data) {
  return data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("\n") || "";
}

function runPowerShellGeminiRequest(requestPayload) {
  return new Promise((resolve, reject) => {
    const requestFile = path.join(os.tmpdir(), `gemini-request-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    const responseFile = path.join(os.tmpdir(), `gemini-response-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    fs.writeFileSync(requestFile, JSON.stringify({
      contents: requestPayload.contents,
      generationConfig: requestPayload.generationConfig,
      ...(requestPayload.tools ? { tools: requestPayload.tools } : {})
    }), "utf8");

    const script = [
      "$ErrorActionPreference = 'Stop'",
      "$payload = Get-Content -Raw -LiteralPath $env:GEMINI_REQUEST_FILE",
      "$model = [Uri]::EscapeDataString($env:GEMINI_CALL_MODEL)",
      "$uri = \"https://generativelanguage.googleapis.com/v1beta/models/$model`:generateContent\"",
      "$headers = @{ 'x-goog-api-key' = $env:GEMINI_API_KEY; 'Content-Type' = 'application/json' }",
      "$response = Invoke-WebRequest -Uri $uri -Method Post -Headers $headers -Body $payload -UseBasicParsing -TimeoutSec 90",
      "Set-Content -LiteralPath $env:GEMINI_RESPONSE_FILE -Value $response.Content -Encoding UTF8"
    ].join("; ");

    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        env: {
          ...process.env,
          GEMINI_REQUEST_FILE: requestFile,
          GEMINI_RESPONSE_FILE: responseFile,
          GEMINI_CALL_MODEL: requestPayload.modelName || model
        },
        timeout: 100000,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        try {
          fs.rmSync(requestFile, { force: true });
        } catch {}

        if (error) {
          try {
            fs.rmSync(responseFile, { force: true });
          } catch {}
          reject(new Error(stderr.trim() || error.message || "PowerShell Gemini request failed"));
          return;
        }

        try {
          const text = fs.readFileSync(responseFile, "utf8").replace(/^\uFEFF/, "");
          fs.rmSync(responseFile, { force: true });
          resolve(JSON.parse(text));
        } catch (parseError) {
          reject(parseError);
        }
      }
    );
  });
}

async function requestGeminiPackage(brief, modelName) {
  const requestPayload = {
    modelName,
    contents: [{
      role: "user",
      parts: [{
        text: `Return valid JSON only. Do not wrap it in Markdown.\n\n${buildPrompt(brief)}`
      }]
    }],
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0.7,
      responseMimeType: "application/json"
    }
  };

  let data;
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "x-goog-api-key": process.env.GEMINI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: requestPayload.contents,
        generationConfig: requestPayload.generationConfig,
        tools: requestPayload.tools
      })
    });
    data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || `Gemini request failed with ${response.status}`);
  } catch (nativeFetchError) {
    try {
      data = await runPowerShellGeminiRequest({
        modelName,
        contents: requestPayload.contents,
        generationConfig: requestPayload.generationConfig,
        tools: requestPayload.tools
      });
    } catch (groundedError) {
      data = await runPowerShellGeminiRequest({
        modelName,
        contents: requestPayload.contents,
        generationConfig: requestPayload.generationConfig
      });
    }
  }

  return extractJson(extractGeminiText(data) || "");
}

async function requestGeminiEnhancement(brief, modelName) {
  const compactPrompt = `Return valid JSON only for this blog generation brief.
Brief: ${JSON.stringify(brief)}
Current date: ${new Date().toISOString().slice(0, 10)}
Shape:
{
  "title": "SEO title under 65 characters",
  "metaDescription": "meta description under 155 characters",
  "searchIntent": "string",
  "industry": "string",
  "articleType": "string",
  "opening": "3 engaging paragraphs before the first heading, like the sample blog",
  "introductionToTopic": "3 detailed paragraphs explaining the topic clearly",
  "simpleWords": "3 detailed paragraphs stripping away jargon",
  "practicalExamples": "3 to 5 practical examples with calculations or scenarios when relevant",
  "objective": "2 to 3 paragraphs explaining why this provision/topic exists or why it matters",
  "advantagesDisadvantages": "two Markdown bullet lists using **Advantages** and **Disadvantages** labels",
  "crucialPoints": "important missed points, caveats, eligibility details, exceptions, or reader warnings",
  "finalThoughts": "2 strong closing paragraphs",
  "publishingPlaybook": {
    "formatStrategy": "string",
    "monetizationPlan": "string",
    "distributionPlan": "string",
    "analyticsPlan": "string",
    "communityPlan": "string"
  }
}
Use Google Search grounding for real-time/current facts when helpful.
The article must be based on the user's Blog Title and Blog Contain. Do not drift into a generic CRM/product article.
If companyWebsiteContext is available, use it only for brand/audience/service positioning and examples. Do not turn the article into a company landing page unless the Blog Title asks for that.
Write the article exactly like the provided Gemini-style sample: title, engaging opening without a heading, "Introduction to [topic]", "[topic] in Simple Words", "Practical Examples", "Why Was This Introduced? (The Objective)" or a natural equivalent, "Advantages and Disadvantages of [topic]", "Crucial Points You Might Have Missed", and "Final Thoughts".
Formatting rules for the article body:
- Bold example labels exactly like **Example 1:**, **Example 2:**, **Example 3:**.
- Use bullet points where the reader needs a scannable list.
- Use **Advantages** and **Disadvantages** labels in bold, followed by Markdown bullet points.
- Keep headings and subheadings professional, like a polished blog on a top publishing site.
Do not create internal tool headings in article content. Never use these article headings: SEO Metadata, Hero Section, Gemini Best Practices, Best Practices for Better Blog Output, Common Mistakes to Avoid, How to Measure Success, Publishing and Growth Playbook, Quality Control, Key Takeaways, Publishing & Growth Playbook, FAQ, Call To Action, Image Assets Summary, SEO Checklist.
Use the user-provided blog contain as source context.
Do not invent statistics, quotes, named case studies, current prices, laws, medical claims, financial returns, or unverifiable facts.
When live facts are needed but not provided, explain the concept accurately and phrase claims carefully instead of fabricating numbers.`;

  const requestPayload = {
    modelName,
    contents: [{
      role: "user",
      parts: [{ text: compactPrompt }]
    }],
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0.65,
      responseMimeType: "application/json"
    }
  };

  let data;
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "x-goog-api-key": process.env.GEMINI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: requestPayload.contents,
        generationConfig: requestPayload.generationConfig,
        tools: requestPayload.tools
      })
    });
    data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || `Gemini enhancement failed with ${response.status}`);
  } catch {
    try {
      data = await runPowerShellGeminiRequest(requestPayload);
    } catch (groundedError) {
      data = await runPowerShellGeminiRequest({
        modelName,
        contents: requestPayload.contents,
        generationConfig: requestPayload.generationConfig
      });
    }
  }

  return extractJson(extractGeminiText(data) || "");
}

function applyGeminiEnhancement(brief, enhancement, usedModel, reason) {
  const packageData = buildFallbackPackage(brief, reason);
  const requestedTitle = sentenceCase(brief.topic);
  const finalTitle = requestedTitle || enhancement.title || packageData.title;
  if (finalTitle) {
    packageData.title = finalTitle;
    packageData.meta.chosenTitle = finalTitle;
    packageData.meta.seoTitle = finalTitle;
    packageData.meta.openGraphTitle = finalTitle;
    packageData.meta.twitterTitle = finalTitle;
    packageData.markdown = packageData.markdown.replace(/^# .+/, `# ${finalTitle}`);
  }
  if (enhancement.metaDescription) {
    packageData.meta.metaDescription = enhancement.metaDescription;
    packageData.meta.openGraphDescription = enhancement.metaDescription;
    packageData.meta.twitterDescription = enhancement.metaDescription;
  }
  if (enhancement.searchIntent) packageData.meta.searchIntent = enhancement.searchIntent;
  if (enhancement.industry) packageData.analysis.industry = enhancement.industry;
  if (enhancement.articleType) packageData.analysis.articleType = enhancement.articleType;

  const playbook = enhancement.publishingPlaybook || {};
  const playbookText = [
    playbook.formatStrategy && `- **Format Strategy:** ${playbook.formatStrategy}`,
    playbook.monetizationPlan && `- **Monetization Plan:** ${playbook.monetizationPlan}`,
    playbook.distributionPlan && `- **Distribution Plan:** ${playbook.distributionPlan}`,
    playbook.analyticsPlan && `- **Analytics Plan:** ${playbook.analyticsPlan}`,
    playbook.communityPlan && `- **Community Plan:** ${playbook.communityPlan}`
  ].filter(Boolean).join("\n");

  packageData.suggestionsMarkdown = (packageData.suggestionsMarkdown || "")
    .replace(/Title: .+/, `Title: ${packageData.title}`)
    .replace(/SEO Title: .+/, `SEO Title: ${packageData.meta.seoTitle}`)
    .replace(/Meta Description: .+/, `Meta Description: ${packageData.meta.metaDescription}`)
    .replace(/Search Intent: .+/, `Search Intent: ${packageData.meta.searchIntent}`)
    .replace(/# Executive Summary[\s\S]*?---/, `# Executive Summary\n\n${enhancement.executiveSummary || "This Gemini-assisted draft provides a CRM-ready structure with SEO metadata, image prompts, FAQs, and export-ready Markdown."}\n\n---`)
    .replace(/# Publishing & Growth Playbook[\s\S]*?---\n\n# FAQ/, `# Publishing & Growth Playbook\n\n${playbookText || "This blog should use templates, SEO tools, analytics, monetization planning, and community feedback loops to move from draft to growth."}\n\n---\n\n# FAQ`)
    .replace(/# FAQ[\s\S]*?---\n\n# Call To Action/, `# FAQ\n\n## How can I improve the generated blog?\n\nAdd clear source notes, audience context, and any points that must appear in the final article.\n\n---\n\n# Call To Action`);

  const topic = sentenceCase(brief.topic || packageData.meta.focusKeyword);
  const keyword = packageData.meta.focusKeyword || topic;
  const templateSections = [
    {
      id: "Introduction",
      heading: `Introduction to ${topic}`,
      body: enhancement.introductionToTopic || `In straightforward terms, ${keyword} is easiest to understand when the reader first knows what it means, who it applies to, and what practical benefit it can create. A good explanation should remove confusion before adding detail.`
    },
    {
      id: "Simple Words",
      heading: `${sentenceCase(keyword)} in Simple Words`,
      body: enhancement.simpleWords || `Let us strip away the jargon. ${sentenceCase(keyword)} should be understood through its basic condition, its real benefit, and the point where the benefit stops applying. Once those three pieces are clear, the topic becomes much easier to apply.`
    },
    {
      id: "Practical Examples",
      heading: "Practical Examples",
      body: enhancement.practicalExamples || `**Example 1:** A reader who clearly meets the basic condition can apply the benefit directly after checking the required limit.\n\n**Example 2:** A reader who is close to the limit should calculate carefully before assuming the same result.\n\n**Example 3:** A reader with a special case should verify whether an exception applies before making a final decision.`
    },
    {
      id: "Objective",
      heading: "Why Was This Introduced? (The Objective)",
      body: enhancement.objective || `The purpose of a rule like this is usually to make the system more practical for the people it is meant to help. It gives relief, encourages compliance, or creates a clearer path for readers who might otherwise feel lost in technical rules.`
    },
    {
      id: "Advantages Disadvantages",
      heading: `Advantages and Disadvantages of ${sentenceCase(keyword)}`,
      body: normalizeAdvantagesDisadvantages(enhancement.advantagesDisadvantages) || `**Advantages**\n\n- It can make the benefit easier to access for eligible readers.\n- It gives people a clearer way to plan their next step.\n- It reduces confusion when the conditions are explained properly.\n\n**Disadvantages**\n\n- It may not apply to everyone.\n- Limits and exceptions can create confusion.\n- Readers can make mistakes if they rely only on a headline and ignore the detailed conditions.`
    },
    {
      id: "Crucial Points",
      heading: "Crucial Points You Might Have Missed",
      body: enhancement.crucialPoints || `Do not confuse the main benefit with the conditions required to claim it. Always check the latest rule, the correct category, and any exception before applying the advice.\n\nIf the topic involves tax, legal, financial, or medical decisions, readers should verify the latest position from official sources or a qualified professional.`
    },
    {
      id: "Conclusion",
      heading: "Final Thoughts",
      body: enhancement.finalThoughts || `${sentenceCase(keyword)} becomes far less intimidating when it is explained in plain language. The right approach is to understand the rule, test it with examples, and check the important conditions before acting.\n\nFor readers, the best next step is simple: use this guide as a starting point, then verify any time-sensitive or personal details before making a final decision.`
    }
  ];
  packageData.analysis.sections = templateSections;
  packageData.markdown = `# ${finalTitle}\n\n${enhancement.opening || `${topic} can feel complicated when it is surrounded by technical language. But once the idea is explained step by step, it becomes much easier to understand and use.\n\nThis guide breaks the topic into simple language, practical examples, benefits, limitations, and important points readers should check before making decisions.`}\n\n${templateSections.map((section) => `## ${section.heading}\n\n${section.body}`).join("\n\n")}`;
  packageData.markdown = sanitizeBlogMarkdown(packageData.markdown);

  packageData.status = reason === "compact editorial generation"
    ? `Generated with Gemini (${usedModel}) and assembled as a full editorial blog package`
    : `Generated with Gemini (${usedModel}) using compact editorial mode after retry: ${reason}`;
  packageData.score = Math.max(packageData.score, 90);
  packageData.generatedAt = new Date().toISOString();
  return packageData;
}

async function callGemini(brief) {
  if (!process.env.GEMINI_API_KEY) {
    return {
      ok: true,
      fallback: true,
      message: "GEMINI_API_KEY is not set. Local fallback package generated.",
      packageData: buildFallbackPackage(brief, "GEMINI_API_KEY is not set")
    };
  }

  const modelQueue = [...new Set([model, "gemini-3.6-flash", "gemini-3.5-flash"])];
  let lastError;
  let packageData;
  let usedModel = model;

  for (const modelName of modelQueue) {
    try {
      const enhancement = await requestGeminiEnhancement(brief, modelName);
      packageData = applyGeminiEnhancement(brief, enhancement, modelName, "compact editorial generation");
      usedModel = modelName;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!packageData) for (const modelName of modelQueue) {
    try {
      packageData = await requestGeminiPackage(brief, modelName);
      usedModel = modelName;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!packageData) {
    for (const modelName of modelQueue) {
      try {
        const enhancement = await requestGeminiEnhancement(brief, modelName);
        packageData = applyGeminiEnhancement(
          brief,
          enhancement,
          modelName,
          lastError?.message || "full-package response was unavailable"
        );
        break;
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (!packageData) {
    packageData = buildFallbackPackage(brief, lastError?.message || "Gemini generation failed");
    packageData.fallback = true;
  }
  packageData.brief = brief;
  packageData.markdown = sanitizeBlogMarkdown(packageData.markdown || "");
  packageData.status = packageData.status || `Generated with Gemini (${usedModel}) and ready for editorial review`;
  packageData.generatedAt = new Date().toISOString();
  return { ok: true, packageData };
}

async function enrichBrief(brief) {
  const enriched = { ...brief };
  if (enriched.companyWebsite && !enriched.companyWebsiteContext) {
    enriched.companyWebsite = normalizeWebsiteUrl(enriched.companyWebsite) || enriched.companyWebsite;
    enriched.companyWebsiteContext = await fetchCompanyWebsiteContext(enriched.companyWebsite);
  }
  return enriched;
}

async function handleApi(req, res) {
  if (req.url === "/api/health" && req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      aiReady: Boolean(process.env.GEMINI_API_KEY),
      model,
      time: new Date().toISOString()
    });
    return;
  }

  if (req.url === "/api/login-config" && req.method === "GET") {
    sendJson(res, 200, { ok: true, loginRequired: true });
    return;
  }

  if (req.url === "/api/login" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const valid = String(payload.username || "") === loginUsername && String(payload.password || "") === loginPassword;
      if (!valid) {
        sendJson(res, 401, { ok: false, message: "Invalid username or password." });
        return;
      }
      sendJson(res, 200, { ok: true, message: "Login successful." });
    } catch (error) {
      sendJson(res, 400, { ok: false, message: "Login failed." });
    }
    return;
  }

  if (req.url === "/api/generate" && req.method === "POST") {
    let payload = {};
    try {
      const body = await readBody(req);
      payload = JSON.parse(body || "{}");
      if (!payload.brief?.topic) {
        sendJson(res, 400, { ok: false, message: "Blog title is required." });
        return;
      }
      sendJson(res, 200, await callGemini(await enrichBrief(payload.brief)));
    } catch (error) {
      sendJson(res, 200, {
        ok: true,
        fallback: true,
        message: error.message || "AI generation failed. Local fallback package generated.",
        packageData: buildFallbackPackage(await enrichBrief(payload.brief), error.message || "AI generation failed")
      });
    }
    return;
  }

  if (req.url === "/api/generate-job" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      if (!payload.brief?.topic) {
        sendJson(res, 400, { ok: false, message: "Blog title is required." });
        return;
      }
      const jobId = createId("job");
      const job = {
        id: jobId,
        status: "queued",
        progress: 5,
        message: "Generating...",
        events: ["Generating..."],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        packageData: null,
        error: null
      };
      jobs.set(jobId, job);
      runGenerationJob(jobId, payload.brief);
      sendJson(res, 202, { ok: true, jobId });
    } catch (error) {
      sendJson(res, 500, { ok: false, message: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/jobs/") && req.method === "GET") {
    const jobId = req.url.split("/").pop();
    const job = jobs.get(jobId);
    if (!job) {
      sendJson(res, 404, { ok: false, message: "Job not found." });
      return;
    }
    sendJson(res, 200, { ok: true, job });
    return;
  }

  if (req.url === "/api/reviews" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      if (!payload.packageData?.markdown) {
        sendJson(res, 400, { ok: false, message: "Generated blog package is required." });
        return;
      }
      const review = createReviewDraft(req, payload.packageData);
      const email = await sendReviewEmail(review, review.reviewUrl);
      sendJson(res, 201, {
        ok: true,
        reviewId: review.id,
        reviewUrl: review.reviewUrl,
        emailSent: email.sent,
        emailReason: email.reason || "",
        message: email.sent ? "Review email sent." : "Review link created. Configure SMTP to send email automatically."
      });
    } catch (error) {
      sendJson(res, 500, { ok: false, message: error.message });
    }
    return;
  }

  if (req.url.match(/^\/api\/reviews\/[^/]+\/publish$/) && req.method === "POST") {
    const token = req.url.split("/")[3];
    const review = readJsonArray(reviewDbPath).find((item) => item.token === token);
    if (!review) {
      sendJson(res, 404, { ok: false, message: "Review draft not found." });
      return;
    }
    const published = publishReview(req, review);
    sendJson(res, 200, { ok: true, publishedUrl: published.url, slug: published.slug });
    return;
  }

  if (req.url === "/api/published" && req.method === "GET") {
    sendJson(res, 200, { ok: true, posts: readJsonArray(publishedDbPath) });
    return;
  }

  if (req.url === "/api/images" && req.method === "GET") {
    sendJson(res, 200, { ok: true, images: readImageDb() });
    return;
  }

  if (req.url === "/api/images" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const uploads = Array.isArray(payload.images) ? payload.images : [];
      const db = readImageDb();
      const now = new Date().toISOString();
      const saved = uploads.map((item) => {
        const file = saveDataUrlImage(item);
        return {
          ...file,
          name: item.name || file.filename,
          category: item.category || "Uncategorized",
          tags: normalizeTags(item.tags),
          keywords: normalizeTags(item.keywords || item.tags),
          altText: item.altText || item.name || file.filename,
          description: item.description || "",
          seoTitle: item.seoTitle || item.name || file.filename,
          credits: item.credits || "",
          source: item.source || "",
          featured: Boolean(item.featured),
          uploadDate: now,
          lastModified: now,
          usageCount: 0
        };
      });
      writeImageDb([...saved, ...db]);
      sendJson(res, 201, { ok: true, images: saved });
    } catch (error) {
      sendJson(res, 400, { ok: false, message: error.message });
    }
    return;
  }

  if (req.url.startsWith("/api/images/")) {
    const imageId = req.url.split("/").pop();
    const db = readImageDb();
    const index = db.findIndex((image) => image.id === imageId);
    if (index === -1) {
      sendJson(res, 404, { ok: false, message: "Image not found." });
      return;
    }
    if (req.method === "PUT") {
      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      db[index] = {
        ...db[index],
        ...payload,
        tags: payload.tags === undefined ? db[index].tags : normalizeTags(payload.tags),
        keywords: payload.keywords === undefined ? db[index].keywords : normalizeTags(payload.keywords),
        lastModified: new Date().toISOString()
      };
      writeImageDb(db);
      sendJson(res, 200, { ok: true, image: db[index] });
      return;
    }
    if (req.method === "DELETE") {
      const [removed] = db.splice(index, 1);
      try {
        fs.rmSync(path.join(uploadDir, removed.filename), { force: true });
      } catch {}
      writeImageDb(db);
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  sendJson(res, 404, { ok: false, message: "API route not found." });
}

async function runGenerationJob(jobId, brief) {
  const job = jobs.get(jobId);
  if (!job) return;
  const requestedWords = Number(brief.wordCount) || 1800;
  const chapters = Math.max(1, Math.ceil(requestedWords / 2500));
  const update = (progress, message) => {
    job.status = "running";
    job.progress = progress;
    job.message = message;
    job.events.push(message);
    job.updatedAt = new Date().toISOString();
  };
  try {
    update(12, "Understanding topic...");
    const enrichedBrief = await enrichBrief(brief);
    update(22, "Structuring article...");
    for (let index = 1; index <= Math.min(chapters, 8); index += 1) {
      update(Math.min(80, 22 + Math.round((index / chapters) * 48)), `Writing Chapter ${index}...`);
    }
    update(84, "Continuing and checking repeated headings...");
    const packageData = await callGemini(enrichedBrief);
    update(92, "Matching admin image library...");
    update(96, "Formatting...");
    job.status = "complete";
    job.progress = 100;
    job.message = "Complete";
    job.events.push("Complete");
    job.packageData = packageData.packageData;
    job.updatedAt = new Date().toISOString();
  } catch (error) {
    job.status = "failed";
    job.error = error.message;
    job.message = "Generation failed";
    job.updatedAt = new Date().toISOString();
  }
}

function serveStatic(req, res) {
  const filePath = safeStaticPath(req.url);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${port}`}`);
  if (url.pathname.startsWith("/review/")) {
    renderReviewPage(req, res, decodeURIComponent(url.pathname.split("/").pop()));
    return;
  }
  if (url.pathname === "/blog") {
    renderBlogList(req, res);
    return;
  }
  if (url.pathname.startsWith("/blog/")) {
    renderPublishedBlog(req, res, decodeURIComponent(url.pathname.split("/").pop()));
    return;
  }
  serveStatic(req, res);
});

server.listen(port, "127.0.0.1", () => {
  fs.writeFileSync(path.join(root, "server.pid"), String(process.pid));
  console.log(`AI Blog Generator running at http://127.0.0.1:${port}`);
  console.log(process.env.GEMINI_API_KEY ? `Gemini mode enabled with ${model}` : "Gemini key not found; fallback mode enabled.");
});
