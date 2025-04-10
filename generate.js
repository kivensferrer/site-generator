const fs = require("fs");
const path = require("path");
const dayjs = require("dayjs");
const { Configuration, OpenAIApi } = require("openai");

// Setup OpenAI
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Util to generate safe file name
const slugify = str => str.toLowerCase().replace(/[^\w]+/g, "-");

async function generatePost(context, layout = "dark") {
  const prompt = `Generate only YAML Front Matter for a Jekyll blog post using layout "${layout}".
Include title, description, and today's date. Context: ${context}`;

  const res = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: prompt }],
  });

  const frontMatter = res.data.choices[0].message.content.trim();

  const body = `This post was generated using the context: "${context}"`;

  const fullContent = `${frontMatter}\n\n${body}`;

  const date = dayjs().format("YYYY-MM-DD");
  const filename = `${date}-${slugify(context)}.md`;
  const filepath = path.join(__dirname, "_posts", filename);

  fs.writeFileSync(filepath, fullContent);
  console.log("✅ Post generated:", filepath);
}

generatePost("Why sunflower microgreens are perfect for summer salads");
