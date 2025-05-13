// Error protection
process.on("uncaughtException", err => console.error("💥 Uncaught Exception:", err));
process.on("unhandledRejection", err => console.error("💥 Unhandled Rejection:", err));

require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const OpenAI = require("openai");
const { Octokit } = require("@octokit/rest");
const dayjs = require("dayjs");
const frontmatter = require("./frontmatter.json");
const fs = require("fs");
const schema = JSON.parse(fs.readFileSync("frontmatter.json", "utf-8"));
const ejs = require("ejs");
const yaml = require("js-yaml");
const { Liquid } = require("liquidjs");

const requiredFields = frontmatter.required.map(f => `- ${f}`).join("\n");
const optionalFields = frontmatter.optional.map(f => `- ${f}`).join("\n");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(bodyParser.json());
app.use(express.static("public")); // Serves frontend

// OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// GitHub setup
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const REPO_OWNER = "kivensferrer";
const REPO_NAME = "site-generator";
const BRANCH = "main";
const PAGES_DIR = "site-pages";
const LAYOUTS = schema.templates;

function slugify(text) {
  return text.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "");
}

app.post("/generate-old", async (req, res) => {
  try {
    const context = req.body.context;
    if (!context) return res.status(400).json({ error: "Missing context" });

    const slugBase = slugify(context);
    const date = dayjs().format("YYYY-MM-DD");
    const createdUrls = [];

    for (const layout of LAYOUTS) {
      const slug = `${slugBase}-${layout}`;
      const filename = `${slug}.md`;
      const path = `${PAGES_DIR}/${filename}`;

      const prompt = `Generate YAML Front Matter for a Jekyll page.
    REQUIRED FIELDS:
    ${requiredFields}

    OPTIONAL FIELDS:
    ${optionalFields}

    Use layout: "${layout}", and generate a permalink like "/${slug}/".
    Return ONLY the front matter.
    Context: ${context}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
      });

      const frontMatter = completion.choices[0].message.content.trim();
      const body = `This page was generated from the context: "${context}" using the "${layout}" layout.`;

      const content = `${frontMatter}`;
      const base64Content = Buffer.from(content).toString("base64");

      console.log(`📦 Committing (${layout}) → ${path}`);

      await octokit.repos.createOrUpdateFileContents({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path,
        message: `Add ${layout} layout page: ${filename}`,
        content: base64Content,
        branch: BRANCH,
      });

      const liveUrl = `https://${REPO_OWNER}.github.io/${REPO_NAME}/${slug}/`;
      createdUrls.push({ layout, url: liveUrl });
    }

    console.log("✅ All pages created:", createdUrls);
    res.json({ pages: createdUrls });

  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: "Page generation failed" });
  }
});

app.post("/generate-new", async (req, res) => {
  try {
    const context = req.body.context;
    if (!context) return res.status(400).json({ error: "Missing context" });

    const slugBase = slugify(context);
    const date = dayjs().format("YYYY-MM-DD");
    const createdUrls = [];

    // Load frontmatter schema
    const requiredFields = schema.required.map(f => `- ${f}`).join("\n");
    const optionalFields = schema.optional.map(f => `- ${f}`).join("\n");

    for (const layout of schema.templates) {
      const slug = `${slugBase}-${layout}`;
      const filename = `${slug}.md`;
      const path = `${PAGES_DIR}/${filename}`;

      // Updated prompt to ensure minimum requirements and working images
      const prompt = `Generate YAML Front Matter for a Jekyll page.
FIELDS TO INCLUDE:
- title: The title of the page.
- company_name: The name of the company.
- tagline: A short tagline for the company.
- services: A list of at least 3 services, each with a title, description, and a working image URL.
- products: A list of at least 3 products, each with a title, description, and a working image URL.
- team: A list of at least 4 team members, each with a name, role, a working image URL, LinkedIn URL, and Twitter URL.
- impact: A list of at least 3 impact metrics, each with a metric (e.g., "100+") and a label (e.g., "Projects Completed").
- footer_text: Text to display in the footer.
- permalink: A permalink for the page.

Use layout: "${layout}", and generate a permalink like "/${slug}/".
Ensure all image URLs are valid and working.
Return ONLY the front matter.
Context: ${context}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
      });

      const frontMatter = completion.choices[0].message.content.trim();
      const body = `This page was generated from the context: "${context}" using the "${layout}" layout.`;

      const content = `${frontMatter}`;
      const base64Content = Buffer.from(content).toString("base64");

      console.log(`📦 Committing (${layout}) → ${path}`);

      await octokit.repos.createOrUpdateFileContents({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path,
        message: `Add ${layout} layout page: ${filename}`,
        content: base64Content,
        branch: BRANCH,
      });

      const liveUrl = `https://${REPO_OWNER}.github.io/${REPO_NAME}/${slug}/`;
      createdUrls.push({ layout, url: liveUrl });
    }

    console.log("✅ All pages created:", createdUrls);
    res.json({ pages: createdUrls });

  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: "Page generation failed" });
  }
});

app.post("/generate-html", async (req, res) => {
  try {
    const { layout, frontmatter } = req.body;

    // Validate input
    if (!layout || !frontmatter) {
      return res.status(400).json({ error: "Missing layout or frontmatter path" });
    }

    // Fetch the latest commit from the repository
    const { data: latestCommit } = await octokit.repos.getBranch({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      branch: BRANCH,
    });

    const latestCommitSha = latestCommit.commit.sha;

    console.log(`✅ Latest commit SHA: ${latestCommitSha}`);

    // Fetch the latest tree of the repository
    const { data: tree } = await octokit.git.getTree({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      tree_sha: latestCommitSha,
      recursive: true, // Fetch all files recursively
    });

    console.log("✅ Repository tree fetched");

    // Update the local files (_layouts and site-pages) based on the tree
    for (const file of tree.tree) {
      if (file.type === "blob" && (file.path.startsWith("_layouts/") || file.path.startsWith("site-pages/"))) {
        const { data: fileContent } = await octokit.git.getBlob({
          owner: REPO_OWNER,
          repo: REPO_NAME,
          file_sha: file.sha,
        });

        const localPath = `./${file.path}`;
        fs.mkdirSync(require("path").dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, Buffer.from(fileContent.content, "base64").toString("utf-8"));

        console.log(`✅ Updated file: ${file.path}`);
      }
    }

    console.log("✅ All relevant files updated locally");

    const templatePath = `./_layouts/${layout}`;
    const frontmatterPath = `./site-pages/${frontmatter}`;

    // Check if the layout file exists
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ error: `Layout file not found: ${layout}` });
    }

    // Check if the frontmatter file exists
    if (!fs.existsSync(frontmatterPath)) {
      return res.status(404).json({ error: `Frontmatter file not found: ${frontmatter}` });
    }

    // Load and parse the frontmatter file
    const frontmatterContent = fs.readFileSync(frontmatterPath, "utf-8");
    const frontmatterData = yaml.load(frontmatterContent);

    // Load the layout template
    const template = fs.readFileSync(templatePath, "utf-8");

    // Create a LiquidJS engine
    const engine = new Liquid();

    // Render the Liquid template with the frontmatter data
    const html = await engine.parseAndRender(template, { page: frontmatterData });

    // Return the generated HTML
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: "HTML generation failed" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
