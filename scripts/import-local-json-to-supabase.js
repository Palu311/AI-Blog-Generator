const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function loadEnvFile() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;
    const key = trimmed.slice(0, equals).trim();
    const value = trimmed.slice(equals + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function readItems(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.value)) return parsed.value;
  return [];
}

function reviewToRow(review) {
  return {
    id: review.id,
    token: review.token,
    slug: review.slug,
    title: review.title,
    status: review.status || "in_review",
    package_data: review.packageData || {},
    review_url: review.reviewUrl || "",
    published_url: review.publishedUrl || "",
    created_at: review.createdAt || new Date().toISOString(),
    updated_at: review.updatedAt || new Date().toISOString()
  };
}

function postToRow(post) {
  return {
    id: post.id,
    review_id: post.reviewId || null,
    slug: post.slug,
    title: post.title,
    markdown: post.markdown || "",
    html: post.html || "",
    meta: post.meta || {},
    image_assets: post.imageAssets || [],
    url: post.url || "",
    published_at: post.publishedAt || new Date().toISOString()
  };
}

function imageToRow(image) {
  return {
    id: image.id,
    name: image.name || image.filename || image.id,
    filename: image.filename || "",
    url: image.url || "",
    mime: image.mime || "",
    size: image.size || 0,
    category: image.category || "Uncategorized",
    alt_text: image.altText || "",
    description: image.description || "",
    seo_title: image.seoTitle || "",
    credits: image.credits || "",
    aspect_ratio: image.aspectRatio || "responsive",
    tags: image.tags || [],
    keywords: image.keywords || [],
    source: image.source || "",
    featured: Boolean(image.featured),
    usage_count: image.usageCount || 0,
    upload_date: image.uploadDate || new Date().toISOString(),
    last_modified: image.lastModified || new Date().toISOString()
  };
}

async function upsertRows(table, rows) {
  if (!rows.length) {
    console.log(`${table}: no rows`);
    return;
  }
  const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/${table}?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify(rows)
  });
  if (!response.ok) throw new Error(`${table}: ${await response.text()}`);
  console.log(`${table}: imported ${rows.length} rows`);
}

async function main() {
  loadEnvFile();
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Fill SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.");
  }

  await upsertRows("review_drafts", readItems("data/review-drafts.json").map(reviewToRow));
  await upsertRows("published_posts", readItems("data/published-posts.json").map(postToRow));
  await upsertRows("image_library", readItems("data/image-library.json").map(imageToRow));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
