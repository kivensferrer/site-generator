// Error protection
process.on("uncaughtException", err => console.error("💥 Uncaught Exception:", err));
process.on("unhandledRejection", err => console.error("💥 Unhandled Rejection:", err));

require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const OpenAI = require("openai");
const { Octokit } = require("@octokit/rest");
const dayjs = require("dayjs");

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
const LAYOUTS = ["dark", "light", "default"];

function slugify(text) {
  return text.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "");
}

app.post("/generate", async (req, res) => {
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

      const prompt = `Generate rich YAML Front Matter for a Jekyll page.
Required fields: layout ("${layout}"), title, description, author, date (today), tags, category, permalink (based on context and layout), and optional fields: cover_image and cta.
Use layout: "${layout}" and permalink: "/${slug}/".
Return ONLY the front matter, starting and ending with "---".
Context: ${context}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
      });

      const frontMatter = completion.choices[0].message.content.trim();
      const body = `This page was generated from the context: "${context}" using the "${layout}" layout.`;

      const content = `${frontMatter}\n\n${body}`;
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

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
