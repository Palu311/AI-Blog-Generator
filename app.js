const form = document.querySelector("#generatorForm");
const emptyState = document.querySelector("#emptyState");
const renderedView = document.querySelector("#renderedView");
const markdownView = document.querySelector("#markdownView");
const seoView = document.querySelector("#seoView");
const imageView = document.querySelector("#imageView");
const progressLabel = document.querySelector("#progressLabel");
const progressPercent = document.querySelector("#progressPercent");
const progressBar = document.querySelector("#progressBar");
const engineStatus = document.querySelector("#engineStatus");
const progressSteps = Array.from(document.querySelectorAll("#progressSteps li"));
const insightList = document.querySelector("#insightList");
const scoreRing = document.querySelector("#scoreRing");
const sectionSelect = document.querySelector("#sectionSelect");
const regenSectionBtn = document.querySelector("#regenSectionBtn");
const regenImageBtn = document.querySelector("#regenImageBtn");
const publishStatus = document.querySelector("#publishStatus");
const autosaveStatus = document.querySelector("#autosaveStatus");
const imageUpload = document.querySelector("#imageUpload");
const dropZone = document.querySelector("#dropZone");
const adminImageGrid = document.querySelector("#adminImageGrid");
const libraryStatus = document.querySelector("#libraryStatus");
const imageSearch = document.querySelector("#imageSearch");
const imageCategoryFilter = document.querySelector("#imageCategoryFilter");
const loginScreen = document.querySelector("#loginScreen");
const loginForm = document.querySelector("#loginForm");
const loginStatus = document.querySelector("#loginStatus");
const loginUsername = document.querySelector("#loginUsername");
const loginPassword = document.querySelector("#loginPassword");
const togglePassword = document.querySelector("#togglePassword");
const logoutBtn = document.querySelector("#logoutBtn");
const adminBtn = document.querySelector("#adminBtn");
const adminPanel = document.querySelector("#adminPanel");
const adminOverlay = document.querySelector("#adminOverlay");
const closeAdminBtn = document.querySelector("#closeAdminBtn");
const topicInput = document.querySelector("#topic");
const detailsInput = document.querySelector("#details");
const titleSuggestions = document.querySelector("#titleSuggestions");
const autoContainBtn = document.querySelector("#autoContainBtn");
const regenerateBtn = document.querySelector("#regenerateBtn");
const refreshAdminBtn = document.querySelector("#refreshAdminBtn");
const adminUsersGrid = document.querySelector("#adminUsersGrid");
const adminLogsGrid = document.querySelector("#adminLogsGrid");
const addUserBtn = document.querySelector("#addUserBtn");

const STORAGE_KEY = "editorial-ai-blog-engine-draft";
const AUTH_KEY = "editorial-ai-blog-engine-auth";
const IMAGE_CATEGORIES = [
  "Technology", "Business", "Marketing", "Finance", "Health", "Medical", "Fitness", "Real Estate",
  "Education", "Travel", "Food", "Automobile", "Artificial Intelligence", "Software", "Programming",
  "Lifestyle", "Fashion", "Sports", "News", "Cryptocurrency", "Investment", "Architecture",
  "Construction", "Interior Design", "Photography", "Nature", "Agriculture", "Legal", "Insurance",
  "Government", "Startup", "Social Media", "Entertainment", "Music", "Movies", "Gaming", "Science",
  "Engineering", "Manufacturing", "Uncategorized"
];
const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
let currentPackage = null;
let progressTimer = null;
let imageLibrary = [];
let serverEngine = {
  checked: false,
  available: false,
  aiReady: false
};

const generatorSteps = [
  "Understanding Topic",
  "Research",
  "Structuring",
  "Writing",
  "SEO",
  "Images",
  "Final Review"
];

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

function getField(id) {
  return document.querySelector(`#${id}`).value.trim();
}

function setField(id, value) {
  document.querySelector(`#${id}`).value = value || "";
}

function setLoginLocked(locked) {
  if (!loginScreen) return;
  document.body.classList.toggle("auth-locked", locked);
  loginScreen.hidden = !locked;
  if (locked) window.setTimeout(() => loginUsername?.focus(), 0);
}

async function initializeLogin() {
  if (!loginScreen || !loginForm) return;
  setLoginLocked(true);
  if (sessionStorage.getItem(AUTH_KEY) === "ok") {
    setLoginLocked(false);
    return;
  }
  try {
    const response = await fetch("/api/login-config", { cache: "no-store" });
    const data = await response.json();
    if (!data.loginRequired) {
      sessionStorage.setItem(AUTH_KEY, "ok");
      setLoginLocked(false);
    }
  } catch {
    if (loginStatus) {
      loginStatus.textContent = "Login server not ready.";
      loginStatus.className = "login-status error";
    }
  }
}

async function handleLogin(event) {
  event.preventDefault();
  if (!loginForm) return;
  const button = loginForm.querySelector("button[type='submit']");
  button.disabled = true;
  button.textContent = "Checking...";
  if (loginStatus) {
    loginStatus.textContent = "";
    loginStatus.className = "login-status";
  }
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: loginUsername?.value || "",
        password: loginPassword?.value || ""
      })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.message || "Login failed.");
    sessionStorage.setItem(AUTH_KEY, "ok");
    loginPassword.value = "";
    if (loginStatus) {
      loginStatus.textContent = "Login successful.";
      loginStatus.className = "login-status success";
    }
    setLoginLocked(false);
  } catch (error) {
    if (loginStatus) {
      loginStatus.textContent = error.message || "Invalid login.";
      loginStatus.className = "login-status error";
    }
  } finally {
    button.disabled = false;
    button.textContent = "Login";
  }
}

function handleLogout() {
  sessionStorage.removeItem(AUTH_KEY);
  if (loginForm) loginForm.reset();
  if (loginPassword && togglePassword) {
    loginPassword.type = "password";
    togglePassword.classList.remove("is-visible");
    togglePassword.setAttribute("aria-label", "Show password");
    togglePassword.setAttribute("aria-pressed", "false");
  }
  if (loginStatus) {
    loginStatus.textContent = "Logged out.";
    loginStatus.className = "login-status";
  }
  setLoginLocked(true);
}

function handlePasswordToggle() {
  if (!loginPassword || !togglePassword) return;
  const isVisible = loginPassword.type === "text";
  loginPassword.type = isVisible ? "password" : "text";
  togglePassword.classList.toggle("is-visible", !isVisible);
  togglePassword.setAttribute("aria-label", isVisible ? "Show password" : "Hide password");
  togglePassword.setAttribute("aria-pressed", String(!isVisible));
}

async function openAdminPanel() {
  if (!adminPanel || !adminOverlay) return;
  adminOverlay.hidden = false;
  adminPanel.classList.add("open");
  adminPanel.setAttribute("aria-hidden", "false");
  document.body.classList.add("admin-open");
  await loadAdminData();
  window.setTimeout(() => closeAdminBtn?.focus(), 0);
}

function closeAdminPanel() {
  if (!adminPanel || !adminOverlay) return;
  adminPanel.classList.remove("open");
  adminPanel.setAttribute("aria-hidden", "true");
  adminOverlay.hidden = true;
  document.body.classList.remove("admin-open");
}

function sentenceCase(value) {
  const clean = value.trim().replace(/\s+/g, " ");
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
}

function titleCase(value) {
  const acronyms = new Set(["ai", "seo", "crm", "ux", "cta", "faq", "api", "saas"]);
  return sentenceCase(value)
    .split(" ")
    .map((word) => {
      const clean = word.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (acronyms.has(clean)) return word.toUpperCase();
      return word.length <= 3 ? word : word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 72);
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function copyText(value) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

const COPY_STYLE_PROPERTIES = [
  "font-family", "font-size", "font-weight", "font-style", "line-height", "color",
  "background-color", "text-align", "text-decoration", "letter-spacing",
  "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border-top", "border-right", "border-bottom", "border-left", "border-radius",
  "border-collapse", "vertical-align", "display", "list-style-type",
  "width", "max-width"
];

function inlineComputedStyles(root) {
  const elements = [root, ...Array.from(root.querySelectorAll("*"))];
  elements.forEach((element) => {
    const computed = window.getComputedStyle(element);
    COPY_STYLE_PROPERTIES.forEach((property) => {
      const value = computed.getPropertyValue(property);
      if (value && value !== "auto" && value !== "normal") element.style.setProperty(property, value);
    });
    element.style.animation = "none";
    element.style.transition = "none";
  });
}

function buildCopyHtml(markdown) {
  const width = Math.max(760, renderedView.clientWidth || 920);
  const source = document.createElement("article");
  source.className = "prose active";
  source.innerHTML = markdownToHtml(markdown);
  source.style.position = "fixed";
  source.style.left = "-10000px";
  source.style.top = "0";
  source.style.width = `${width}px`;
  source.style.maxHeight = "none";
  source.style.overflow = "visible";
  source.style.background = "#ffffff";
  document.body.appendChild(source);
  inlineComputedStyles(source);
  source.style.position = "";
  source.style.left = "";
  source.style.top = "";
  source.style.maxHeight = "none";
  source.style.overflow = "visible";
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${source.outerHTML}</body></html>`;
  const text = source.innerText;
  source.remove();
  return { html, text };
}

async function copyRichBlog(packageData) {
  const { html, text } = buildCopyHtml(packageData.markdown);
  if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" })
      })
    ]);
    return "rich";
  }
  await copyText(text || packageData.markdown);
  return "plain";
}

function downloadWordFile(packageData) {
  const slug = packageData.meta?.slug || slugify(packageData.title || packageData.meta?.chosenTitle || "blog");
  const { html } = buildCopyHtml(packageData.markdown);
  const wordHtml = `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(packageData.meta?.chosenTitle || packageData.title || "Blog")}</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
</head>
<body>${html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] || html}</body>
</html>`;
  download(`${slug}.doc`, wordHtml, "application/msword;charset=utf-8");
}

function downloadPdfFile(packageData) {
  const { html } = buildCopyHtml(packageData.markdown);
  const title = escapeHtml(packageData.meta?.chosenTitle || packageData.title || "Blog");
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showToast("Popup blocked. Allow popups to download PDF.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    @page { margin: 18mm; }
    body { background: #ffffff; margin: 0; }
    article { max-width: none !important; width: auto !important; max-height: none !important; overflow: visible !important; }
  </style>
</head>
<body>${html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] || html}
<script>window.onload = () => { setTimeout(() => { window.print(); }, 250); };</script>
</body>
</html>`);
  printWindow.document.close();
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2200);
}

function setEngineStatus(message, state = "") {
  if (!engineStatus) return;
  engineStatus.textContent = message;
  engineStatus.className = `engine-status ${state}`.trim();
}

async function checkServerEngine() {
  if (window.location.protocol === "file:") {
    serverEngine = { checked: true, available: false, aiReady: false };
    setEngineStatus("File mode: local fallback generator ready. For AI mode, run npm start.", "fallback");
    return;
  }

  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const data = await response.json();
    serverEngine = {
      checked: true,
      available: Boolean(data.ok),
      aiReady: Boolean(data.aiReady)
    };
    setEngineStatus(
      data.aiReady ? `Gemini server ready (${data.model}).` : "Local server ready. Add GEMINI_API_KEY for real AI generation; fallback works now.",
      data.aiReady ? "ready" : "fallback"
    );
  } catch {
    serverEngine = { checked: true, available: false, aiReady: false };
    setEngineStatus("Server not detected. Local fallback generator ready.", "fallback");
  }
}

async function generateWithServer(brief) {
  if (!serverEngine.available) return null;
  const jobResponse = await fetch("/api/generate-job", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brief })
  });
  if (jobResponse.status === 202) {
    const { jobId } = await jobResponse.json();
    return await pollGenerationJob(jobId, brief);
  }
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brief })
  });
  const data = await response.json();
  if (data.ok && data.packageData) return normalizeServerPackage(data.packageData, brief);
  return null;
}

async function pollGenerationJob(jobId, brief) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
    const data = await response.json();
    const job = data.job;
    if (!job) break;
    if (progressLabel) progressLabel.textContent = job.message || "Generating...";
    if (progressPercent) progressPercent.textContent = `${job.progress || 0}%`;
    if (progressBar) progressBar.style.width = `${job.progress || 0}%`;
    progressSteps.forEach((step, index) => {
      const doneCount = Math.floor(((job.progress || 0) / 100) * progressSteps.length);
      step.classList.toggle("done", index < doneCount);
      step.classList.toggle("active", index === doneCount);
    });
    if (job.status === "complete") return normalizeServerPackage(job.packageData, brief);
    if (job.status === "failed") throw new Error(job.error || "Generation failed");
    await new Promise((resolve) => window.setTimeout(resolve, 900));
  }
  throw new Error("Generation timed out");
}

function normalizeServerPackage(packageData, brief) {
  const local = buildPackage(brief);
  return {
    ...local,
    ...packageData,
    brief,
    meta: { ...local.meta, ...(packageData.meta || {}) },
    analysis: { ...local.analysis, ...(packageData.analysis || {}) },
    imageAssets: Array.isArray(packageData.imageAssets) && packageData.imageAssets.length ? packageData.imageAssets : local.imageAssets,
    markdown: sanitizeBlogMarkdown(packageData.markdown || local.markdown),
    suggestionsMarkdown: packageData.suggestionsMarkdown || local.suggestionsMarkdown,
    score: Number(packageData.score) || local.score,
    status: packageData.status || "Generated with AI and ready for editorial review",
    generatedAt: packageData.generatedAt || new Date().toISOString()
  };
}

function collectBrief() {
  const topic = getField("topic");
  const details = getField("details");
  const primaryKeyword = getField("primaryKeyword") || inferPrimaryKeyword(topic);
  const secondaryKeywords = splitList(getField("secondaryKeywords"));
  const wordCount = Number(getField("wordCount")) || 1800;

  return {
    topic: normalizeTitleText(topic) || topic,
    details,
    companyWebsite: getField("companyWebsite"),
    primaryKeyword,
    secondaryKeywords: secondaryKeywords.length ? secondaryKeywords : inferSecondaryKeywords(topic, primaryKeyword),
    country: getField("country") || "United States",
    audience: getField("audience") || inferAudience(topic),
    brand: getField("brand"),
    tone: cleanSetting(getField("tone")),
    goal: cleanSetting(getField("goal")),
    cta: getField("cta"),
    language: getField("language") || "English",
    blogFormat: cleanSetting(getField("blogFormat")),
    designTemplate: cleanSetting(getField("designTemplate")),
    monetization: cleanSetting(getField("monetization"), "None"),
    distribution: cleanSetting(getField("distribution")),
    analyticsGoal: cleanSetting(getField("analyticsGoal")),
    communityAngle: getField("communityAngle"),
    adaptiveFormat: getAdaptiveContentStyle(topic),
    wordCount: Math.max(wordCount, 700)
  };
}

function splitList(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function cleanSetting(value, fallback = "") {
  const clean = String(value || "").trim();
  if (!clean || clean.toLowerCase() === "n/a" || clean.toLowerCase() === "none") return fallback;
  return clean;
}

function getAdaptiveContentStyle(topic) {
  const lower = topic.toLowerCase();
  if (/\b(best|top|ideas|tips|examples|tools|list)\b/.test(lower)) return "ranked list sections, short paragraphs, bullet points, and comparison tables";
  if (/\bhow to|guide|tutorial|steps|setup|create|build\b/.test(lower)) return "step-by-step headings, ordered lists, short explanations, and practical checkpoints";
  if (/\bvs|versus|compare|comparison|difference\b/.test(lower)) return "comparison tables, pros and cons, decision criteria, and summary bullets";
  if (/\bwhat is|meaning|explain|beginner|introduction\b/.test(lower)) return "plain-language paragraphs, examples, definitions, and short unordered lists";
  if (/\bcase study|story|journey|experience\b/.test(lower)) return "narrative paragraphs, subheadings, timeline points, and lessons learned";
  if (/\bnews|update|latest|trend|2026|2027\b/.test(lower)) return "news-style summary, context paragraphs, bullet takeaways, and careful caveats";
  return "mixed editorial formatting with headings, subheadings, paragraphs, bullets, numbered lists, and tables only where useful";
}

function normalizeTitleText(value) {
  return sentenceCase(String(value || "")
    .replace(/\bifi\b/gi, "if")
    .replace(/\bteh\b/gi, "the")
    .replace(/\bthigns\b/gi, "things")
    .replace(/\bblogg?\b/gi, "blog")
    .replace(/\bautometically\b/gi, "automatically")
    .replace(/\bformate?\b/gi, "format")
    .replace(/\s+/g, " ")
    .trim());
}

function updateTitleSuggestions() {
  if (!titleSuggestions || !topicInput) return;
  const raw = topicInput.value.trim();
  if (!raw) {
    titleSuggestions.classList.remove("active");
    titleSuggestions.innerHTML = "";
    return;
  }
  const corrected = normalizeTitleText(raw);
  const suggestions = [];
  if (corrected && corrected !== raw) suggestions.push({ label: "Correct spelling/grammar", value: corrected });
  if (raw.length > 90) suggestions.push({ label: "Shorter SEO title", value: `${corrected.slice(0, 74).replace(/\s+\S*$/, "")}` });
  const titleWords = corrected.split(/\s+/).filter(Boolean);
  if (titleWords.length < 4) suggestions.push({ label: "More specific title", value: `${corrected}: Complete Guide` });
  if (!suggestions.length) {
    titleSuggestions.classList.remove("active");
    titleSuggestions.innerHTML = "";
    return;
  }
  titleSuggestions.innerHTML = suggestions.map((item) => `
    <div class="suggestion-item">
      <span><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</span>
      <button type="button" data-title-suggestion="${escapeHtml(item.value)}">Use</button>
    </div>
  `).join("");
  titleSuggestions.classList.add("active");
}

async function generateAutoContain() {
  const title = getField("topic");
  if (!title) return showToast("Add a blog title first.");
  const button = autoContainBtn;
  button.disabled = true;
  button.textContent = "Writing contain...";
  try {
    const response = await fetch("/api/auto-contain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title })
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.message || "Auto contain failed.");
    setField("details", data.details);
    saveDraft();
    showToast("Blog contain generated from title.");
  } catch (error) {
    setField("details", buildLocalAutoContain(title));
    saveDraft();
    showToast(error.message || "Local contain generated.");
  } finally {
    button.disabled = false;
    button.textContent = "AI Auto Blog Contain";
  }
}

function buildLocalAutoContain(title) {
  const style = getAdaptiveContentStyle(title);
  return `Write deeply and specifically about the exact blog title "${normalizeTitleText(title)}". Do not write generic content. Every section should directly explain, expand, compare, prove, or answer this title. Use adaptive formatting: ${style}. Include the main meaning, reader intent, title-specific headings, useful subheadings, practical examples, important points, mistakes or caveats when useful, advantages and disadvantages only when relevant, and a clear final thought. Use tables only where comparison helps, ordered lists for steps, unordered lists for points, and paragraph length based on the title.`;
}

function inferPrimaryKeyword(topic) {
  return topic
    .toLowerCase()
    .replace(/^(how to|why|what is|the|a|an)\s+/i, "")
    .split(/\s+/)
    .slice(0, 5)
    .join(" ");
}

function inferSecondaryKeywords(topic, primaryKeyword) {
  const base = primaryKeyword || inferPrimaryKeyword(topic);
  return [
    `${base} guide`,
    `${base} best practices`,
    `${base} strategy`,
    `${base} examples`
  ];
}

function inferAudience(topic) {
  const lower = topic.toLowerCase();
  if (lower.includes("seo") || lower.includes("marketing")) return "Marketing managers, founders, and content teams";
  if (lower.includes("crm") || lower.includes("sales")) return "Sales leaders, RevOps teams, and CRM administrators";
  if (lower.includes("health") || lower.includes("clinic")) return "Healthcare operators and patient experience teams";
  if (lower.includes("finance") || lower.includes("investment")) return "Finance professionals and research-led business readers";
  if (lower.includes("real estate")) return "Real estate brokers, property marketers, and agency owners";
  return "Business decision-makers, practitioners, and informed beginners";
}

function inferIndustry(topic) {
  const lower = topic.toLowerCase();
  if (lower.includes("crm") || lower.includes("sales")) return "CRM and revenue operations";
  if (lower.includes("seo") || lower.includes("content") || lower.includes("marketing")) return "Digital marketing";
  if (lower.includes("ai") || lower.includes("software") || lower.includes("automation")) return "Technology";
  if (lower.includes("real estate") || lower.includes("property")) return "Real estate";
  if (lower.includes("health") || lower.includes("clinic") || lower.includes("medical")) return "Healthcare";
  if (lower.includes("finance") || lower.includes("investment") || lower.includes("bank")) return "Finance";
  return "Business strategy";
}

function inferArticleType(topic, goal) {
  const lower = `${topic} ${goal}`.toLowerCase();
  if (lower.includes(" vs ") || lower.includes("comparison")) return "Comparison guide";
  if (lower.includes("how to")) return "How-to guide";
  if (lower.includes("best") || lower.includes("top")) return "Listicle and best-practice guide";
  if (lower.includes("beginner")) return "Beginner guide";
  if (lower.includes("expert") || lower.includes("advanced")) return "Expert guide";
  return "Long-form SEO article";
}

function inferIntent(topic) {
  const lower = topic.toLowerCase();
  if (lower.includes("best") || lower.includes("software") || lower.includes("tool")) return "Commercial investigation";
  if (lower.includes("how") || lower.includes("guide") || lower.includes("what")) return "Informational";
  if (lower.includes("price") || lower.includes("demo") || lower.includes("service")) return "Transactional research";
  return "Educational and problem-aware";
}

function buildTitleAlternatives(brief) {
  const base = titleCase(brief.primaryKeyword);
  const audienceWord = brief.audience.split(/[,\s]+/).find((word) => word.length > 5) || "Teams";
  const titles = [
    sentenceCase(brief.topic),
    `${base}: A Practical Guide for ${audienceWord}`,
    `How to Approach ${base} Without the Guesswork`,
    `${base}: Complete Guide`,
    `The Professional Guide to ${base}`,
    `What ${audienceWord} Need to Know About ${base}`
  ].filter(Boolean);
  return titles.map((title) => title.length <= 80 ? title : sentenceCase(brief.topic)).slice(0, 5);
}

function estimateReadingTime(words) {
  return `${Math.max(4, Math.ceil(words / 220))} min read`;
}

function buildImageAssets(brief, title, sectionNames) {
  const count = Math.min(8, Math.max(3, Math.round(brief.wordCount / 520)));
  const filenames = slugify(brief.primaryKeyword || brief.topic);
  const supportingSections = sectionNames.slice(0, count);
  return supportingSections.map((section, index) => {
    const placement = index === 0 ? "After Executive Summary" : `Within ${section}`;
    return {
      placement,
      purpose: index === 0 ? "Featured hero image" : `Support the reader while scanning ${section}`,
      prompt: buildImagePrompt(brief, title, section, index),
      negativePrompt: "No text, no watermark, no fake interface copy, no distorted hands, no cartoon styling, no surreal lighting, no brand logos unless provided, no spelling artifacts.",
      altText: `${section} visual for ${brief.primaryKeyword}`,
      caption: `${section} concept for "${title}".`,
      filename: `${filenames}-${index === 0 ? "hero" : `section-${index}`}.jpg`,
      aspectRatio: index === 0 ? "16:9" : index % 2 ? "4:3" : "3:2"
    };
  });
}

function buildImagePrompt(brief, title, section, index) {
  const setting = brief.brand ? `${brief.brand} editorial workspace` : "premium editorial business workspace";
  const lens = index === 0 ? "35mm lens, eye-level camera angle" : "50mm lens, natural documentary angle";
  const mood = index === 0 ? "confident, modern, trustworthy" : "focused, practical, clear";
  return `Photorealistic ${brief.language} editorial image for "${title}", focused on ${section.toLowerCase()} in ${brief.country}. Scene: ${setting} with realistic professionals reviewing source notes, content outlines, dashboards, and publication assets related to ${brief.topic}. Camera: ${lens}. Lighting: soft daylight with balanced contrast. Composition: clean foreground subject, layered but uncluttered background, natural colors, premium SaaS editorial feel. Mood: ${mood}. Quality: ultra HD, magazine quality, realistic textures, no visible text.`;
}

function buildMetadata(brief, title, titles, imageAssets) {
  const slug = slugify(title);
  const words = brief.wordCount;
  const metaDescription = `A practical, SEO-friendly guide to ${brief.primaryKeyword} for ${brief.audience.toLowerCase()}, with clear strategy, examples, FAQs, and next steps.`;
  return {
    titleAlternatives: titles,
    chosenTitle: title,
    seoTitle: title.length <= 60 ? title : `${title.slice(0, 57)}...`,
    metaDescription: metaDescription.slice(0, 158),
    slug,
    focusKeyword: brief.primaryKeyword,
    relatedKeywords: brief.secondaryKeywords,
    searchIntent: inferIntent(brief.topic),
    openGraphTitle: title,
    openGraphDescription: metaDescription.slice(0, 150),
    twitterTitle: title.slice(0, 70),
    twitterDescription: metaDescription.slice(0, 150),
    canonicalUrl: `https://example.com/blog/${slug}`,
    readingTime: estimateReadingTime(words),
    estimatedWordCount: words,
    imageFilename: imageAssets[0].filename
  };
}

function buildSections(brief) {
  const industry = inferIndustry(brief.topic);
  const articleType = inferArticleType(brief.topic, brief.goal);
  const intent = inferIntent(brief.topic);
  const audience = brief.audience;
  const keyword = brief.primaryKeyword;
  const sourceNote = brief.details
    ? `The user-provided brief emphasizes: ${brief.details}`
    : `Because no source notes were provided, this draft avoids unsupported statistics and uses careful, evergreen guidance.`;
  const companyNote = brief.companyWebsiteContext
    ? `\n\nCompany website context to keep in mind: ${brief.companyWebsiteContext.summary}`
    : brief.companyWebsite
      ? `\n\nCompany website provided for brand context: ${brief.companyWebsite}`
      : "";

  return {
    industry,
    articleType,
    intent,
    opening: `${brief.topic} can feel confusing when it is surrounded by technical language, scattered explanations, and half-clear advice. But the moment the subject is broken into simple parts, it becomes much easier to understand.\n\nThis guide explains ${keyword} in a practical way for ${audience.toLowerCase()}. We will move from the basic meaning to examples, benefits, limitations, important points, and final thoughts so the reader can finish with clarity instead of confusion.${companyNote}`,
    readerPainPoints: [
      "Too much generic advice and not enough practical context",
      "Concern about making claims that cannot be verified",
      "Pressure to publish useful content quickly without damaging trust"
    ],
    businessGoal: brief.goal,
    sections: [
      {
        id: "Introduction",
        heading: `Introduction to ${brief.topic}`,
        body: `In straightforward terms, ${keyword} is a topic the reader should understand through meaning, eligibility, use cases, limits, and practical examples. A good blog should not throw jargon at the reader. It should make the idea feel simple enough to explain to someone else.\n\n${sourceNote} The article therefore uses the provided contain as context and avoids unsupported statistics, fake examples, or unverifiable claims.`
      },
      {
        id: "Simple Words",
        heading: `${titleCase(keyword)} in Simple Words`,
        body: `Let us strip away the difficult wording. ${titleCase(keyword)} should be understood by asking three simple questions: what does it mean, who does it apply to, and what result can it create?\n\nOnce those three answers are clear, the reader can understand the topic without feeling lost. This is the same reason strong explanatory blogs use short sections, direct examples, and plain language instead of heavy technical paragraphs.`
      },
      {
        id: "Practical Examples",
        heading: "Practical Examples",
        body: `**Example 1:** A reader who clearly meets the main condition can apply the idea directly after checking the required limit, category, or rule.\n\n**Example 2:** A reader who is close to a threshold should calculate carefully, because small differences can sometimes change the final result.\n\n**Example 3:** A reader with a special case should check whether an exception applies before relying on the general explanation.`
      },
      {
        id: "Objective",
        heading: "Why Was This Introduced? (The Objective)",
        body: `The objective behind a helpful rule, process, or provision is usually practical relief. It exists to make a system easier to follow, encourage correct action, or give people a clearer way to plan.\n\nFor ${audience.toLowerCase()}, the value is not only the benefit itself. The value is knowing when it applies, when it does not, and what supporting details should be checked before making a decision.`
      },
      {
        id: "Advantages Disadvantages",
        heading: `Advantages and Disadvantages of ${titleCase(keyword)}`,
        body: `**Advantages**\n\n- It helps eligible readers understand a useful benefit or decision more clearly.\n- It can reduce confusion when explained with examples.\n- It gives the reader a practical way to check whether the topic applies to them.\n\n**Disadvantages**\n\n- It may not apply to every reader or every situation.\n- Limits, exceptions, or changing rules can create misunderstanding.\n- Readers may make wrong decisions if they look only at the headline benefit and ignore the conditions.`
      },
      {
        id: "Crucial Points",
        heading: "Crucial Points You Might Have Missed",
        body: `Do not confuse the headline benefit with the exact conditions required to use it. The most common reader mistake is understanding the general idea but missing a limit, exception, category, or timing detail.\n\nIf the topic depends on current rules, official data, legal interpretation, medical advice, tax law, or financial decisions, the reader should verify the latest information before acting.`
      },
      {
        id: "Conclusion",
        heading: "Final Thoughts",
        body: `${titleCase(keyword)} becomes easier to understand when it is explained in plain language, supported with examples, and balanced with both benefits and limitations. The goal is not to make the topic sound complicated. The goal is to help the reader feel confident.\n\nUse this blog as a clear starting point. If the topic affects a personal, legal, tax, medical, or financial decision, confirm the latest details from an official or qualified source before taking action.`
      }
    ]
  };
}

function buildMarkdown(brief, meta, analysis, imageAssets) {
  const brandAuthor = brief.brand ? `${brief.brand} Editorial Team` : "Editorial Strategy Team";
  const toc = analysis.sections.map((section) => `- [${section.heading}](#${slugify(section.heading)})`).join("\n");
  const imageBlocks = imageAssets.slice(1).map((asset) => {
    return `\n> **Supporting Image Block**\n> Placement: ${asset.placement}\n> Image Prompt: ${asset.prompt}\n> Negative Prompt: ${asset.negativePrompt}\n> Alt Text: ${asset.altText}\n> Caption: ${asset.caption}\n> Filename: ${asset.filename}\n`;
  });

  const mainContent = analysis.sections.map((section, index) => {
    const imageBlock = imageBlocks[index - 1] || "";
    const heading = section.heading === "Introduction" ? "# Introduction" : `## ${section.heading}`;
    return `${heading}\n\n${section.body}${imageBlock}`;
  }).join("\n\n");

  const faq = [
    [`What is the main purpose of this article?`, `It helps ${brief.audience.toLowerCase()} understand ${brief.primaryKeyword} and decide what to do next.`],
    [`Can this be published immediately?`, `It is structured for publication, but any factual, legal, medical, financial, or time-sensitive claim should be reviewed before publishing.`],
    [`How should the images be used?`, `Use the featured image for the hero section and place supporting images near the related sections for visual context.`],
    [`How does this support SEO?`, `It matches ${meta.searchIntent.toLowerCase()} intent, uses a clean heading hierarchy, adds FAQ opportunities, and includes image SEO guidance.`]
  ];

  return `# Hero Section

Hero Image: ${imageAssets[0].filename}

Title: ${meta.chosenTitle}

Subtitle: A practical, human-written guide for ${brief.audience.toLowerCase()} who need clear thinking, credible structure, and useful next steps.

Metadata: ${today} | ${meta.readingTime} | ${meta.estimatedWordCount} words

Category: ${analysis.industry}

Reading Time: ${meta.readingTime}

Author: ${brandAuthor}

Publish Date: ${today}

Breadcrumb: Home > Blog > ${analysis.industry} > ${meta.chosenTitle}

---

# SEO Metadata

SEO Title: ${meta.seoTitle}

Meta Description: ${meta.metaDescription}

Slug: ${meta.slug}

Focus Keyword: ${meta.focusKeyword}

Keywords: ${meta.relatedKeywords.join(", ")}

Search Intent: ${meta.searchIntent}

Open Graph Title: ${meta.openGraphTitle}

Open Graph Description: ${meta.openGraphDescription}

Twitter Title: ${meta.twitterTitle}

Twitter Description: ${meta.twitterDescription}

Canonical URL Suggestion: ${meta.canonicalUrl}

Reading Time: ${meta.readingTime}

Estimated Word Count: ${meta.estimatedWordCount}

---

# Table of Contents

${toc}

---

# Executive Summary

${meta.chosenTitle} is designed as a ${analysis.articleType.toLowerCase()} for ${brief.audience.toLowerCase()}. It addresses ${meta.searchIntent.toLowerCase()} search intent, explains why the topic matters, gives a practical workflow, identifies common mistakes, and closes with a relevant CTA.

The article avoids invented statistics and unsupported claims. Add external citations during editorial review when publishing time-sensitive facts, legal interpretations, financial claims, medical guidance, or company-specific data.

---

${mainContent}

---

# Key Takeaways

- ${titleCase(brief.primaryKeyword)} content should start with reader intent.
- Useful structure matters more than inflated claims.
- Tables, examples, FAQs, and image prompts make the article easier to publish inside a CRM workflow.
- Any hard statistic or sensitive claim needs verified sourcing before publication.
- The CTA should feel like a natural next step for ${brief.audience.toLowerCase()}.

---

# Publishing & Growth Playbook

## Format Strategy

- **Blog Format:** ${brief.blogFormat || "Magazine-style authority article"}
- **Design Template:** ${brief.designTemplate || "Clean editorial"}
- **Distribution:** ${brief.distribution || "Website blog and SEO"}
- **Community Angle:** ${brief.communityAngle || "Reader questions and comments"}

## Monetization Plan

${brief.monetization || "None / educational"} should be handled naturally. If the article includes ads, sponsorships, affiliate links, gated resources, or lead-generation CTAs, disclose the relationship clearly and keep the reader value first.

## Analytics Plan

Track ${brief.analyticsGoal || "organic traffic and ranking"} with practical signals such as impressions, clicks, scroll depth, CTA clicks, newsletter signups, assisted conversions, and returning-reader engagement.

---

# FAQ

${faq.map(([question, answer]) => `## ${question}\n\n${answer}`).join("\n\n")}

---

# Conclusion

${analysis.sections.find((section) => section.id === "Conclusion").body}

---

# Call To Action

${brief.cta}. If you are planning content around ${brief.primaryKeyword}, use this draft as the editorial base, add verified references, and adapt the final copy to your brand voice before publishing.

---

# Internal Link Suggestions

- /blog/${meta.slug}
- /resources/content-strategy
- /case-studies
- /contact

---

# External Authority References

- Add official reports, primary research, government pages, product documentation, or reputable industry publications during editorial review.
- Do not cite unverified statistics or quote unnamed experts.
- For medical, legal, or financial topics, include a professional review before publication.

---

# Schema Recommendations

- BlogPosting schema
- FAQPage schema
- BreadcrumbList schema
- ImageObject schema for featured and supporting images

---

# Image Assets Summary

${imageAssets.map((asset) => `- ${asset.filename}: ${asset.placement}; ${asset.aspectRatio}; ${asset.altText}`).join("\n")}

---

# SEO Checklist

- H1 includes the primary topic.
- SEO title stays near search-result length.
- Meta description is concise and benefit-led.
- H2/H3 hierarchy is scannable.
- FAQ section supports long-tail search.
- Image prompts include alt text, captions, filenames, and aspect ratios.
- No unsupported statistics, fake quotes, or invented company facts.
- CTA connects naturally to the reader's intent.
- Draft is mobile-friendly with short paragraphs, lists, and tables.`;
}

function buildArticleMarkdown(brief, meta, analysis, imageAssets) {
  const articleSections = analysis.sections.filter((section) => !isBannedBlogHeading(section.heading));
  const mainContent = articleSections.map((section) => {
    const heading = section.heading === "Introduction" ? "## Introduction" : `## ${section.heading}`;
    return `${heading}\n\n${section.body}`;
  }).join("\n\n");

  return sanitizeBlogMarkdown(`# ${meta.chosenTitle}

${analysis.opening ? `${analysis.opening}\n\n` : ""}
${mainContent}
`);
}

function buildPackage(brief) {
  const analysis = buildSections(brief);
  const sectionNames = ["Hero Section", ...analysis.sections.map((section) => section.heading)];
  const titles = buildTitleAlternatives(brief);
  const chosenTitle = titles[0];
  const imageAssets = buildImageAssets(brief, chosenTitle, sectionNames);
  const meta = buildMetadata(brief, chosenTitle, titles, imageAssets);
  const markdown = buildArticleMarkdown(brief, meta, analysis, imageAssets);
  const suggestionsMarkdown = buildMarkdown(brief, meta, analysis, imageAssets);
  const score = scorePackage(brief, analysis, imageAssets);

  return {
    brief,
    analysis,
    meta,
    imageAssets,
    markdown,
    suggestionsMarkdown,
    score,
    status: "Ready for editorial review",
    generatedAt: new Date().toISOString()
  };
}

function scorePackage(brief, analysis, imageAssets) {
  let score = 82;
  if (brief.details.length > 80) score += 4;
  if (brief.secondaryKeywords.length >= 3) score += 3;
  if (brief.brand) score += 2;
  if (imageAssets.length >= 4) score += 2;
  if (analysis.articleType.includes("Long-form")) score += 2;
  return Math.min(score, 96);
}

function formatInline(value) {
  return escapeHtml(value)
    .replace(/!\[(.*?)\]\((.*?)\)/g, '<figure class="blog-image"><img src="$2" alt="$1" loading="lazy"><figcaption>$1</figcaption></figure>')
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
}

function markdownToHtml(markdown) {
  const lines = markdown.split("\n");
  let html = "";
  let inList = false;
  let inOrderedList = false;
  let inTable = false;
  let tableRowIndex = 0;
  let inQuote = false;

  function closeBlocks() {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
    if (inOrderedList) {
      html += "</ol>";
      inOrderedList = false;
    }
    if (inTable) {
      html += "</tbody></table>";
      inTable = false;
      tableRowIndex = 0;
    }
    if (inQuote) {
      html += "</blockquote>";
      inQuote = false;
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
      html += `<tr>${cells.map((cell) => `<${tag}>${formatInline(cell)}</${tag}>`).join("")}</tr>`;
      tableRowIndex += 1;
      continue;
    }

    if (line.startsWith("> ")) {
      if (!inQuote) {
        closeBlocks();
        html += "<blockquote>";
        inQuote = true;
      }
      html += `<p>${formatInline(line.slice(2))}</p>`;
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      if (!inOrderedList) {
        closeBlocks();
        html += "<ol>";
        inOrderedList = true;
      }
      html += `<li>${formatInline(line.replace(/^\d+\.\s/, ""))}</li>`;
      continue;
    }

    if (line.startsWith("- ")) {
      if (!inList) {
        closeBlocks();
        html += "<ul>";
        inList = true;
      }
      html += `<li>${formatInline(line.slice(2))}</li>`;
      continue;
    }

    closeBlocks();
    if (line.startsWith("#### ")) html += `<h4>${formatInline(line.slice(5))}</h4>`;
    else if (line.startsWith("### ")) html += `<h3>${formatInline(line.slice(4))}</h3>`;
    else if (line.startsWith("## ")) html += `<h2>${formatInline(line.slice(3))}</h2>`;
    else if (line.startsWith("# ")) html += `<h1>${formatInline(line.slice(2))}</h1>`;
    else html += `<p>${formatInline(line)}</p>`;
  }

  closeBlocks();
  return html;
}

function render(packageData) {
  packageData.markdown = sanitizeBlogMarkdown(packageData.markdown);
  currentPackage = packageData;
  emptyState.style.display = "none";
  renderedView.innerHTML = markdownToHtml(packageData.markdown);
  markdownView.textContent = packageData.markdown;
  seoView.innerHTML = markdownToHtml(buildSeoSummary(packageData));
  imageView.innerHTML = packageData.imageAssets.map(renderImageCard).join("");
  updateInsights(packageData);
  updateSectionControls(packageData);
  saveDraft();
}

function renderImageCard(asset, index) {
  const visual = asset.url
    ? `<img class="image-preview-photo" src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.altText || `Image ${index + 1}`)}">`
    : `<div class="image-placeholder">Image ${index + 1}</div>`;
  return `<article class="image-card" data-image-index="${index}" tabindex="0" aria-label="Open master image prompt for image ${index + 1}">
    ${visual}
    <div class="image-card-body">
      <div class="image-card-title-row">
        <h3>${escapeHtml(asset.filename)}</h3>
        <button class="copy-prompt-btn" type="button" title="Copy master image prompt" aria-label="Copy master image prompt">
          <span aria-hidden="true"></span>
        </button>
      </div>
      <p class="image-card-hint">Click image to open prompt. Copy icon copies prompt.</p>
      <p><strong>Placement:</strong> ${escapeHtml(asset.placement)}</p>
      <p><strong>Caption:</strong> ${escapeHtml(asset.caption)}</p>
    </div>
  </article>`;
}

function getImagePromptModal() {
  let modal = document.querySelector("#imagePromptModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "imagePromptModal";
  modal.className = "image-prompt-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="image-prompt-backdrop" data-close-prompt></div>
    <section class="image-prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="imagePromptTitle">
      <div class="image-prompt-header">
        <div>
          <p class="eyebrow">Image Master Prompt</p>
          <h2 id="imagePromptTitle"></h2>
        </div>
        <div class="image-prompt-actions">
          <button type="button" data-copy-modal-prompt>Copy Prompt</button>
          <button type="button" data-close-prompt>Close</button>
        </div>
      </div>
      <pre class="image-prompt-full"></pre>
    </section>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", async (event) => {
    if (event.target.closest("[data-close-prompt]")) closeImagePromptModal();
    if (event.target.closest("[data-copy-modal-prompt]")) {
      const prompt = modal.querySelector(".image-prompt-full").textContent;
      await copyText(prompt);
      showToast("Master image prompt copied.");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeImagePromptModal();
  });
  return modal;
}

function openImagePromptModal(asset, index) {
  const modal = getImagePromptModal();
  modal.querySelector("#imagePromptTitle").textContent = `Image ${index + 1}: ${asset.filename}`;
  modal.querySelector(".image-prompt-full").textContent = buildChatGptImagePrompt(asset, index);
  modal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeImagePromptModal() {
  const modal = document.querySelector("#imagePromptModal");
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
}

function buildChatGptImagePrompt(asset, index) {
  const imageNumber = index + 1;
  const title = currentPackage?.meta?.chosenTitle || currentPackage?.brief?.topic || "the blog post";
  const keyword = currentPackage?.meta?.focusKeyword || currentPackage?.brief?.primaryKeyword || title;
  const audience = currentPackage?.brief?.audience || "blog readers";
  const country = currentPackage?.brief?.country || "";
  const placement = asset.placement || (imageNumber === 1 ? "Hero Section" : "Blog Section");
  const aspectRatio = asset.aspectRatio || (imageNumber === 1 ? "16:9" : "4:3");
  const locationText = country ? ` in ${country}` : "";
  const scene = asset.prompt || `a realistic editorial scene that clearly represents "${title}" for ${audience}`;
  const avoid = asset.negativePrompt || "text, watermark, logo, blurry image, distorted hands, fake UI, spelling, cartoon style, unrealistic objects";
  return `Please generate this image now: a photorealistic editorial blog image for the article titled "${title}".

The image must visually match this exact title and topic: ${keyword}. It is for the ${placement} of the blog, in ${aspectRatio} aspect ratio, for ${audience}${locationText}.

Scene to create: ${scene}

Make it look like a premium website/blog image: realistic people or objects only if they fit the title, natural lighting, clean professional composition, sharp details, modern editorial style, trustworthy and high quality.

Do not include any readable text, captions, words, signs, UI text, logos, watermark, or spelling inside the image. Avoid ${avoid}.

Create one new image from scratch. No existing/reference image is needed.`;
}

function buildSeoSummary(packageData) {
  const { meta, analysis, brief, imageAssets, score } = packageData;
  const suggestions = packageData.suggestionsMarkdown
    ? `\n\n---\n\n# Editorial Suggestions\n\n${packageData.suggestionsMarkdown}`
    : "";
  return `# SEO Metadata

- **SEO Title:** ${meta.seoTitle}
- **Meta Description:** ${meta.metaDescription}
- **Slug:** ${meta.slug}
- **Focus Keyword:** ${meta.focusKeyword}
- **Keywords:** ${meta.relatedKeywords.join(", ")}
- **Search Intent:** ${meta.searchIntent}
- **Article Type:** ${analysis.articleType}
- **Target Audience:** ${brief.audience}
- **Canonical URL:** ${meta.canonicalUrl}
- **Reading Time:** ${meta.readingTime}
- **Estimated Word Count:** ${meta.estimatedWordCount}
- **Quality Score:** ${score}/100

## Title Alternatives

${meta.titleAlternatives.map((title) => `- ${title}`).join("\n")}

## Image SEO

${imageAssets.map((asset) => `- ${asset.filename}: ${asset.altText}`).join("\n")}

## Schema Recommendations

- BlogPosting
- FAQPage
- BreadcrumbList
- ImageObject${suggestions}`;
}

function updateInsights(packageData) {
  if (!scoreRing || !insightList) return;
  const { meta, analysis, imageAssets, score } = packageData;
  scoreRing.textContent = score;
  insightList.innerHTML = `
    <div><dt>Search Intent</dt><dd>${escapeHtml(meta.searchIntent)}</dd></div>
    <div><dt>Article Type</dt><dd>${escapeHtml(analysis.articleType)}</dd></div>
    <div><dt>Reading Time</dt><dd>${escapeHtml(meta.readingTime)}</dd></div>
    <div><dt>Images Planned</dt><dd>${imageAssets.length}</dd></div>
  `;
}

function updateSectionControls(packageData) {
  if (!sectionSelect || !regenSectionBtn || !regenImageBtn) return;
  sectionSelect.disabled = false;
  regenSectionBtn.disabled = false;
  regenImageBtn.disabled = false;
  sectionSelect.innerHTML = packageData.analysis.sections
    .map((section) => `<option value="${escapeHtml(section.id)}">${escapeHtml(section.heading)}</option>`)
    .join("");
}

function resetInsights() {
  if (!insightList) return;
  insightList.innerHTML = `
    <div><dt>Search Intent</dt><dd>Waiting for brief</dd></div>
    <div><dt>Article Type</dt><dd>Auto-selected</dd></div>
    <div><dt>Reading Time</dt><dd>--</dd></div>
    <div><dt>Images Planned</dt><dd>--</dd></div>
  `;
}

function resetProgress() {
  window.clearInterval(progressTimer);
  if (progressLabel) progressLabel.textContent = "Ready to generate";
  if (progressPercent) progressPercent.textContent = "0%";
  if (progressBar) progressBar.style.width = "0%";
  progressSteps.forEach((step) => step.classList.remove("active", "done"));
}

function runProgress() {
  resetProgress();
  if (progressLabel) progressLabel.textContent = "Generating publish-ready blog...";
  if (progressPercent) progressPercent.textContent = "8%";
  if (progressBar) progressBar.style.width = "8%";
  if (progressSteps[0]) progressSteps[0].classList.add("active");
}

function finishProgress() {
  window.clearInterval(progressTimer);
  progressSteps.forEach((step) => {
    step.classList.remove("active");
    step.classList.add("done");
  });
  if (progressLabel) progressLabel.textContent = "Blog ready";
  if (progressPercent) progressPercent.textContent = "100%";
  if (progressBar) progressBar.style.width = "100%";
}

async function generate() {
  const brief = collectBrief();
  if (!brief.topic) {
    showToast("Add a blog title first.");
    return;
  }

  const generateButton = form.querySelector("button[type='submit']");
  generateButton.disabled = true;
  generateButton.classList.add("loading");
  generateButton.dataset.originalText = generateButton.textContent;
  generateButton.textContent = "Generating...";
  if (regenerateBtn) regenerateBtn.disabled = true;
  runProgress();
  let packageData = null;
  try {
    packageData = await generateWithServer(brief);
  } catch (error) {
    setEngineStatus(`AI server issue: ${error.message}. Fallback generator used.`, "fallback");
  }
  render(packageData || buildPackage(brief));
  if (regenerateBtn) regenerateBtn.hidden = false;
  finishProgress();
  generateButton.disabled = false;
  generateButton.classList.remove("loading");
  generateButton.textContent = generateButton.dataset.originalText || "Generate Blog";
  if (regenerateBtn) regenerateBtn.disabled = false;
}

function regenerateSelectedSection() {
  if (!currentPackage || !sectionSelect) return;
  const selectedId = sectionSelect.value;
  const section = currentPackage.analysis.sections.find((item) => item.id === selectedId);
  if (!section) return;
  section.body = `${section.body}\n\nEditorial refresh: This section has been tightened to make the guidance more specific for ${currentPackage.brief.audience.toLowerCase()} while preserving the no-hallucination rule. Add verified examples before publishing if this topic depends on current facts.`;
  currentPackage.markdown = buildArticleMarkdown(currentPackage.brief, currentPackage.meta, currentPackage.analysis, currentPackage.imageAssets);
  currentPackage.suggestionsMarkdown = buildMarkdown(currentPackage.brief, currentPackage.meta, currentPackage.analysis, currentPackage.imageAssets);
  render(currentPackage);
  showToast("Selected section regenerated.");
}

function regenerateImagePrompt() {
  if (!currentPackage) return;
  const asset = currentPackage.imageAssets[0];
  asset.prompt = `${asset.prompt} Add a stronger editorial focal point, refined production design, realistic depth of field, and a premium CRM publishing atmosphere.`;
  currentPackage.suggestionsMarkdown = buildMarkdown(currentPackage.brief, currentPackage.meta, currentPackage.analysis, currentPackage.imageAssets);
  render(currentPackage);
  showToast("Featured image prompt regenerated.");
}

function saveDraft() {
  const payload = {
    fields: {
      topic: getField("topic"),
      details: getField("details"),
      companyWebsite: getField("companyWebsite"),
      primaryKeyword: getField("primaryKeyword"),
      secondaryKeywords: getField("secondaryKeywords"),
      country: getField("country"),
      audience: getField("audience"),
      brand: getField("brand"),
      tone: getField("tone"),
      goal: getField("goal"),
      cta: getField("cta"),
      language: getField("language"),
      blogFormat: getField("blogFormat"),
      designTemplate: getField("designTemplate"),
      monetization: getField("monetization"),
      distribution: getField("distribution"),
      analyticsGoal: getField("analyticsGoal"),
      communityAngle: getField("communityAngle"),
      wordCount: getField("wordCount")
    },
    packageData: currentPackage
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  autosaveStatus.textContent = `Draft saved locally at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function restoreDraft() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const draft = JSON.parse(raw);
    Object.entries(draft.fields || {}).forEach(([id, value]) => setField(id, value));
    if (draft.packageData) render(draft.packageData);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function startNewDraftOnLoad() {
  localStorage.removeItem(STORAGE_KEY);
  currentPackage = null;
  if (autosaveStatus) autosaveStatus.textContent = "New draft";
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  generate();
});

topicInput?.addEventListener("input", updateTitleSuggestions);
titleSuggestions?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-title-suggestion]");
  if (!button) return;
  setField("topic", button.dataset.titleSuggestion);
  updateTitleSuggestions();
  saveDraft();
});
autoContainBtn?.addEventListener("click", generateAutoContain);
loginForm?.addEventListener("submit", handleLogin);
logoutBtn?.addEventListener("click", handleLogout);
togglePassword?.addEventListener("click", handlePasswordToggle);

form.addEventListener("input", () => {
  window.clearTimeout(form.saveTimer);
  form.saveTimer = window.setTimeout(saveDraft, 250);
});

regenerateBtn?.addEventListener("click", generate);
if (regenSectionBtn) regenSectionBtn.addEventListener("click", regenerateSelectedSection);
if (regenImageBtn) regenImageBtn.addEventListener("click", regenerateImagePrompt);

document.querySelector("#sampleBtn").addEventListener("click", () => {
  setField("topic", "Section 87A of The Income Tax Act.");
  setField("details", "Write the detailed understanding of Section 87A of the Income Tax Act with simple explanation, eligibility, old and new tax regime examples, advantages, disadvantages, crucial points, and final thoughts.");
  setField("companyWebsite", "");
  setField("primaryKeyword", "Section 87A of the Income Tax Act");
  setField("secondaryKeywords", "Section 87A rebate, income tax rebate India, new tax regime Section 87A, old tax regime Section 87A");
  setField("country", "India");
  setField("audience", "Indian taxpayers, salaried employees, freelancers, and small business owners");
  setField("brand", "");
  setField("cta", "");
  setField("language", "English");
  setField("blogFormat", "Complete explanatory guide");
  setField("designTemplate", "Clean editorial");
  setField("monetization", "None / educational");
  setField("distribution", "Website blog and SEO");
  setField("analyticsGoal", "Engagement and reading depth");
  setField("communityAngle", "Reader questions and comments");
  setField("wordCount", "1800");
  saveDraft();
  showToast("Sample brief loaded.");
});

document.querySelector("#publishedBlogsBtn").addEventListener("click", () => {
  window.open("/blog", "_blank");
});

document.querySelector("#newDraftBtn").addEventListener("click", () => {
  form.reset();
  currentPackage = null;
  localStorage.removeItem(STORAGE_KEY);
  renderedView.innerHTML = "";
  markdownView.textContent = "";
  seoView.innerHTML = "";
  imageView.innerHTML = "";
  emptyState.style.display = "grid";
  if (scoreRing) scoreRing.textContent = "--";
  resetInsights();
  if (sectionSelect) {
    sectionSelect.disabled = true;
    sectionSelect.innerHTML = '<option value="">Generate a blog first</option>';
  }
  if (regenSectionBtn) regenSectionBtn.disabled = true;
  if (regenImageBtn) regenImageBtn.disabled = true;
  if (regenerateBtn) regenerateBtn.hidden = true;
  if (publishStatus) publishStatus.textContent = "Publishing queue idle.";
  resetProgress();
  showToast("New draft started.");
});

adminBtn?.addEventListener("click", openAdminPanel);
closeAdminBtn?.addEventListener("click", closeAdminPanel);
adminOverlay?.addEventListener("click", closeAdminPanel);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeAdminPanel();
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".output-view").forEach((view) => view.classList.remove("active"));
    tab.classList.add("active");
    const targetId = tab.dataset.tab === "images" ? "imageView" : `${tab.dataset.tab}View`;
    document.querySelector(`#${targetId}`).classList.add("active");
  });
});

document.querySelector("[data-copy]").addEventListener("click", async () => {
  if (!currentPackage) return showToast("Generate a blog first.");
  const mode = await copyRichBlog(currentPackage);
  showToast(mode === "rich" ? "Styled blog copied." : "Blog copied as Markdown.");
});

document.querySelector("[data-download-word]")?.addEventListener("click", () => {
  if (!currentPackage) return showToast("Generate a blog first.");
  downloadWordFile(currentPackage);
  showToast("Word file downloaded.");
});

document.querySelector("[data-download-pdf]")?.addEventListener("click", () => {
  if (!currentPackage) return showToast("Generate a blog first.");
  downloadPdfFile(currentPackage);
});

imageView?.addEventListener("click", async (event) => {
  const card = event.target.closest(".image-card");
  if (!card || !currentPackage) return;
  const index = Number(card.dataset.imageIndex);
  const asset = currentPackage.imageAssets[index];
  if (!asset) return;
  if (event.target.closest(".copy-prompt-btn")) {
    await copyText(buildChatGptImagePrompt(asset, index));
    showToast("Master image prompt copied.");
    return;
  }
  openImagePromptModal(asset, index);
});

imageView?.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest(".image-card");
  if (!card || !currentPackage) return;
  event.preventDefault();
  const index = Number(card.dataset.imageIndex);
  const asset = currentPackage.imageAssets[index];
  if (!asset) return;
  openImagePromptModal(asset, index);
});

document.querySelector("[data-copy-seo]")?.addEventListener("click", async () => {
  if (!currentPackage) return showToast("Generate a blog first.");
  await copyText(buildSeoSummary(currentPackage));
  showToast("SEO package copied.");
});

document.querySelector("[data-copy-images]")?.addEventListener("click", async () => {
  if (!currentPackage) return showToast("Generate a blog first.");
  const imageText = currentPackage.imageAssets.map((asset, index) => {
    return `Image ${index + 1}: ${asset.filename}
Placement: ${asset.placement}
Aspect Ratio: ${asset.aspectRatio}
Prompt: ${asset.prompt}
Negative Prompt: ${asset.negativePrompt}
Alt Text: ${asset.altText}
Caption: ${asset.caption}`;
  }).join("\n\n---\n\n");
  await copyText(imageText);
  showToast("Image prompts copied.");
});

document.querySelectorAll("[data-export]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!currentPackage) return showToast("Generate a blog first.");
    const slug = currentPackage.meta.slug || "blog-package";
    const type = button.dataset.export;
    if (type === "json") download(`${slug}.json`, JSON.stringify(currentPackage, null, 2), "application/json");
    if (type === "md") download(`${slug}.md`, currentPackage.markdown, "text/markdown");
    if (type === "html") {
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(currentPackage.meta.chosenTitle)}</title><style>body{font-family:Arial,sans-serif;line-height:1.65;max-width:860px;margin:40px auto;color:#182033;padding:0 20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d9e1ec;padding:8px}blockquote{border-left:4px solid #0f766e;padding-left:12px;color:#344054}</style></head><body>${markdownToHtml(currentPackage.markdown)}</body></html>`;
      download(`${slug}.html`, html, "text/html");
    }
    if (type === "pdf") window.print();
  });
});

document.querySelector("#publishBtn")?.addEventListener("click", async () => {
  if (!currentPackage) return showToast("Generate a blog first.");
  const button = document.querySelector("#publishBtn");
  button.disabled = true;
  button.textContent = "Sending...";
  try {
    const response = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageData: currentPackage })
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.message || "Review submit failed");
    await copyText(data.reviewUrl);
    showToast(data.emailSent ? "Review email sent. Link copied." : "Review link copied. SMTP email not configured.");
    window.open(data.reviewUrl, "_blank");
  } catch (error) {
    showToast(error.message || "Review submit failed.");
  } finally {
    button.disabled = false;
    button.textContent = "Publish";
  }
});

function populateCategoryFilter() {
  if (!imageCategoryFilter) return;
  imageCategoryFilter.innerHTML = '<option value="">All Categories</option>' + IMAGE_CATEGORIES
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function loadImageLibrary() {
  if (!adminImageGrid || !imageSearch || !imageCategoryFilter) return;
  try {
    const response = await fetch("/api/images", { cache: "no-store" });
    const data = await response.json();
    imageLibrary = data.images || [];
    renderImageLibrary();
  } catch {
    if (libraryStatus) libraryStatus.textContent = "Image library API unavailable.";
  }
}

async function uploadImages(files) {
  const validFiles = Array.from(files).filter((file) => /^image\/(png|jpeg|webp|gif)$/.test(file.type));
  if (!validFiles.length) return showToast("Select PNG, JPG, WEBP, or GIF images.");
  if (libraryStatus) libraryStatus.textContent = `Uploading ${validFiles.length} image(s)...`;
  const images = await Promise.all(validFiles.map(async (file) => ({
    name: file.name,
    dataUrl: await fileToDataUrl(file),
    category: getField("adminCategory") || "Uncategorized",
    tags: getField("adminTags"),
    keywords: getField("adminTags"),
    altText: getField("adminAlt") || file.name.replace(/\.[^.]+$/, ""),
    description: getField("adminAlt"),
    seoTitle: file.name.replace(/\.[^.]+$/, ""),
    credits: getField("adminCredits"),
    source: getField("adminCredits")
  })));
  const response = await fetch("/api/images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ images })
  });
  const data = await response.json();
  if (!data.ok) {
    if (libraryStatus) libraryStatus.textContent = data.message || "Upload failed.";
    return;
  }
  if (libraryStatus) libraryStatus.textContent = `Uploaded ${data.images.length} image(s).`;
  await loadImageLibrary();
}

function renderImageLibrary() {
  if (!adminImageGrid || !imageSearch || !imageCategoryFilter) return;
  const query = imageSearch.value.trim().toLowerCase();
  const category = imageCategoryFilter.value;
  const filtered = imageLibrary.filter((image) => {
    const text = [image.name, image.category, image.altText, image.description, image.seoTitle, image.credits, ...(image.tags || [])].join(" ").toLowerCase();
    return (!query || text.includes(query)) && (!category || image.category === category);
  });
  adminImageGrid.innerHTML = filtered.map((image) => `
    <article class="library-card" data-id="${escapeHtml(image.id)}">
      <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.altText || image.name)}" loading="lazy">
      <div class="library-card-body">
        <input data-field="name" value="${escapeHtml(image.name || "")}" aria-label="Image name">
        <select data-field="category" aria-label="Category">
          ${IMAGE_CATEGORIES.map((categoryName) => `<option value="${escapeHtml(categoryName)}" ${image.category === categoryName ? "selected" : ""}>${escapeHtml(categoryName)}</option>`).join("")}
        </select>
        <input data-field="tags" value="${escapeHtml((image.tags || []).join(", "))}" aria-label="Tags">
        <input data-field="altText" value="${escapeHtml(image.altText || "")}" aria-label="Alt text">
        <textarea data-field="description" aria-label="Description">${escapeHtml(image.description || "")}</textarea>
        <input data-field="seoTitle" value="${escapeHtml(image.seoTitle || "")}" aria-label="SEO title">
        <input data-field="credits" value="${escapeHtml(image.credits || "")}" aria-label="Credits">
        <div class="card-actions">
          <button type="button" data-save-image>Save</button>
          <button type="button" data-delete-image>Delete</button>
        </div>
      </div>
    </article>
  `).join("");
}

async function saveImageCard(card) {
  const id = card.dataset.id;
  const payload = {};
  card.querySelectorAll("[data-field]").forEach((field) => {
    payload[field.dataset.field] = field.value;
  });
  const response = await fetch(`/api/images/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (data.ok) {
    if (libraryStatus) libraryStatus.textContent = "Image metadata saved.";
    await loadImageLibrary();
  }
}

async function deleteImageCard(card) {
  const id = card.dataset.id;
  const response = await fetch(`/api/images/${id}`, { method: "DELETE" });
  const data = await response.json();
  if (data.ok) {
    if (libraryStatus) libraryStatus.textContent = "Image deleted.";
    await loadImageLibrary();
  }
}

async function loadAdminData() {
  await Promise.all([loadAdminUsers(), loadAdminLogs()]);
}

async function loadAdminUsers() {
  if (!adminUsersGrid) return;
  try {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const data = await response.json();
    const users = data.users || [];
    adminUsersGrid.innerHTML = users.map((user) => `
      <div class="admin-row" data-user-id="${escapeHtml(user.id)}">
        <input data-user-field="username" value="${escapeHtml(user.username || "")}" aria-label="Username">
        <input data-user-field="role" value="${escapeHtml(user.role || "")}" aria-label="Role">
        <input data-user-field="status" value="${escapeHtml(user.status || "")}" aria-label="Status">
        <span>${escapeHtml(new Date(user.lastSeen || user.createdAt || Date.now()).toLocaleString())}</span>
        <button type="button" data-save-user>Save</button>
      </div>
    `).join("") || "<p>No users yet.</p>";
  } catch {
    adminUsersGrid.innerHTML = "<p>User admin API unavailable.</p>";
  }
}

async function loadAdminLogs() {
  if (!adminLogsGrid) return;
  try {
    const response = await fetch("/api/admin/logs", { cache: "no-store" });
    const data = await response.json();
    const logs = data.logs || [];
    adminLogsGrid.innerHTML = logs.map((log) => `
      <div class="admin-row admin-log-row">
        <span>${escapeHtml(new Date(log.time).toLocaleString())}</span>
        <strong>${escapeHtml(log.type || "")}</strong>
        <span>${escapeHtml(log.user || "")}</span>
        <span>${escapeHtml(log.message || "")}</span>
      </div>
    `).join("") || "<p>No logs yet.</p>";
  } catch {
    adminLogsGrid.innerHTML = "<p>Logs API unavailable.</p>";
  }
}

async function addAdminUser() {
  const username = getField("newUserName");
  if (!username) return showToast("Add a username.");
  const payload = {
    username,
    role: getField("newUserRole") || "editor",
    status: getField("newUserStatus") || "active"
  };
  const response = await fetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!data.ok) return showToast(data.message || "User add failed.");
  setField("newUserName", "");
  setField("newUserRole", "");
  setField("newUserStatus", "");
  await loadAdminUsers();
  await loadAdminLogs();
  showToast("User added.");
}

async function saveAdminUser(row) {
  const id = row.dataset.userId;
  const payload = {};
  row.querySelectorAll("[data-user-field]").forEach((field) => {
    payload[field.dataset.userField] = field.value;
  });
  const response = await fetch(`/api/admin/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (data.ok) {
    await loadAdminUsers();
    await loadAdminLogs();
    showToast("User saved.");
  }
}

if (imageUpload) imageUpload.addEventListener("change", () => uploadImages(imageUpload.files));
if (dropZone) {
  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("dragging");
    });
  });
  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("dragging");
    });
  });
  dropZone.addEventListener("drop", (event) => uploadImages(event.dataTransfer.files));
}
if (imageSearch) imageSearch.addEventListener("input", renderImageLibrary);
if (imageCategoryFilter) imageCategoryFilter.addEventListener("change", renderImageLibrary);
if (adminImageGrid) {
  adminImageGrid.addEventListener("click", (event) => {
    const card = event.target.closest(".library-card");
    if (!card) return;
    if (event.target.matches("[data-save-image]")) saveImageCard(card);
    if (event.target.matches("[data-delete-image]")) deleteImageCard(card);
  });
}

document.querySelectorAll(".admin-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".admin-view").forEach((view) => view.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`#admin${titleCase(tab.dataset.adminTab)}View`)?.classList.add("active");
  });
});
refreshAdminBtn?.addEventListener("click", loadAdminData);
addUserBtn?.addEventListener("click", addAdminUser);
adminUsersGrid?.addEventListener("click", (event) => {
  const row = event.target.closest(".admin-row");
  if (row && event.target.matches("[data-save-user]")) saveAdminUser(row);
});

startNewDraftOnLoad();
initializeLogin();
checkServerEngine();
populateCategoryFilter();
loadImageLibrary();
loadAdminData();
