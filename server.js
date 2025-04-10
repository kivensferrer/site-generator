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

function slugify(text) {
  return text.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "");
}

app.post("/generate", async (req, res) => {
  try {
    const context = req.body.context;
    if (!context) return res.status(400).json({ error: "Missing context" });

    const slug = slugify(context);
    const filename = `${slug}.md`;
    const path = `${PAGES_DIR}/${filename}`;

    console.log("🧠 Sending prompt to GPT...");

    const prompt = `Generate YAML Front Matter for a Jekyll PAGE (not a blog post).
Use layout 'dark', include title, description, and permalink like /${slug}/.
Only return the YAML front matter (start and end with ---).`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
    });

    const frontMatter = completion.choices[0].message.content.trim();
    const body = `This page was generated from the context: "${context}".`;

    const content = `${frontMatter}\n\n${body}`;
    const base64Content = Buffer.from(content).toString("base64");

    console.log("📦 Committing to GitHub:", path);

    await octokit.repos.createOrUpdateFileContents({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path,
      message: `Add new page: ${filename}`,
      content: base64Content,
      branch: BRANCH,
    });

    const liveUrl = `https://${REPO_OWNER}.github.io/${REPO_NAME}/${slug}/`;
    console.log("✅ Page live at:", liveUrl);
    res.json({ url: liveUrl });

  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: "Page generation failed" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
