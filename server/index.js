import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from server directory so it works whether you run from repo root or server/
config({ path: path.join(__dirname, ".env") });

import express from "express";
import { GoogleGenAI } from "@google/genai";
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "..")));

const DESCRIBE_PROMPT = `You are describing a mathematical function for a blind user. Given the equation and an image of its graph, provide a short, clear spoken description. Include:
1. The type of function (e.g. linear, quadratic, exponential, trigonometric, rational).
2. Domain and range or bounds if relevant (e.g. "x from 0 to 10", "y is always positive").
3. Any asymptotes or behavior at infinity (e.g. "vertical asymptote at x equals zero", "goes to infinity as x increases").
4. One or two other key traits (e.g. "parabola opening upward", "oscillates between minus 1 and 1").
Write in a way that is natural to read aloud. Use "x" and "y" and simple words. Keep it to about 3 to 5 sentences.`;

app.post("/api/describe", async (req, res) => {
  const { equation, imageBase64 } = req.body;

  if (!equation || !imageBase64) {
    return res.status(400).json({ error: "Missing equation or imageBase64" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return res.status(500).json({
      error: "Server is missing GEMINI_API_KEY. Add it to server/.env (see server/.env.example).",
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const contents = [
      {
        inlineData: {
          mimeType: "image/png",
          data: imageBase64.replace(/^data:image\/\w+;base64,/, ""),
        },
      },
      {
        text: `Equation: f(x) = ${equation}\n\n${DESCRIBE_PROMPT}`,
      },
    ];

    // Debug: log request (equation only; do not log full base64)
    console.log("[describe] request equation:", equation);
    console.log("[describe] image base64 length:", imageBase64.length);

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents,
    });

    const text =
      response?.text ??
      (response?.candidates?.[0]?.content?.parts || [])
        .map((p) => p?.text)
        .filter(Boolean)
        .join(" ") ??
      "";
    if (!text) {
      console.log("[describe] no text in response:", JSON.stringify(response, null, 2));
      return res.status(502).json({ error: "No description returned from API" });
    }

    const description = text.trim();
    // Debug: log result
    console.log("[describe] success – description length:", description.length);
    console.log("[describe] description (full):", description);

    res.json({ description });
  } catch (err) {
    console.error("[describe] Gemini error:", err.message);
    console.error("[describe] full error:", err);
    res.status(500).json({
      error: err.message || "Failed to generate description",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
