process.on("uncaughtException", (err) => {
    console.error("💥 Uncaught Exception:", err);
  });
  process.on("unhandledRejection", (err) => {
    console.error("💥 Unhandled Rejection:", err);
  });

require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const OpenAI = require("openai");
const { Octokit } = require("@octokit/rest");
const dayjs = require("dayjs");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(bodyParser.json());
app.use(express.static("public")); // Serves your frontend

// Setup OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

// Setup GitHub API
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// Your GitHub repo details
const REPO_OWNER = "kivensferrer";
const REPO_NAME = "site-generator";
const BRANCH = "main"; // or "master"
const POSTS_DIR = "_posts";

function slugify(text) {
  return text.toLowerCase().replace(/[^\w]+/g, "-");
}

// Routes
app.post("/generate", async (req, res) => {
  try {
    const context = req.body.context;
    if (!context) return res.status(400).json({ error: "Missing context" });

    // Step 1: Ask ChatGPT for Front Matter
    const prompt = `Generate only YAML Front Matter for a Jekyll blog post. Use layout "dark".
Include title, description, and today's date. Context: ${context}`;

    const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
    });
  

    const frontMatter = completion.choices[0].message.content.trim();
    if (!completion.choices || !completion.choices[0]) {
        throw new Error("GPT response did not contain choices!");
    }
    const body = `This post was generated using the context: "${context}"`;

    const content = `${frontMatter}\n\n${body}`;
    const slug = slugify(context);
    const date = dayjs().format("YYYY-MM-DD");
    const filename = `${date}-${slug}.md`;
    const path = `${POSTS_DIR}/${filename}`;

    // Step 2: Push to GitHub
    const { data: { sha: latestSha } } = await octokit.repos.getBranch({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      branch: BRANCH,
    });

    const base64Content = Buffer.from(content).toString("base64");

    await octokit.repos.createOrUpdateFileContents({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path,
      message: `Add new post: ${filename}`,
      content: base64Content,
      branch: BRANCH,
    });

    // Step 3: Respond with the live URL
    const postSlug = filename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");
    const postUrl = `https://${REPO_OWNER}.github.io/${REPO_NAME}/${postSlug}`;
    res.json({ url: postUrl });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: "Failed to generate post" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
