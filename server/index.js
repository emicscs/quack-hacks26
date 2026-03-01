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

const DESCRIBE_PROMPT = `You are describing mathematical function(s) for a blind user. Your goal is to help them understand the shape of the graph(s)—how the curve(s) look and behave in space. Do not mention colors; they are not relevant.

For a single function, include:
1. The type of function (e.g. linear, quadratic, exponential, trigonometric, rational).
2. The shape: direction (e.g. "curves upward", "slopes down left to right"), steepness, bends, symmetry (e.g. "symmetric about the y-axis"), and any peaks, valleys, or flat regions.
3. Domain and range or bounds if relevant (e.g. "x from 0 to 10", "y is always positive").
4. Any asymptotes or behavior at infinity (e.g. "vertical asymptote at x equals zero", "goes to infinity as x increases").
5. One or two other key traits (e.g. "parabola opening upward", "oscillates between minus 1 and 1").

For multiple functions, describe each curve's shape and type briefly, then how they relate: where they cross, which curve is above or below the other in different regions. Use "the first curve", "the second curve", or spoken forms like "y equals x squared" to distinguish them.

Output rules:
- Write only in plain spoken language. Do not use LaTeX, math notation, or dollar signs (no $...$). Do not include symbols like ^ for exponents or subscripts. Spell everything out for speech (e.g. "x squared", "sine of x", "y equals 2 x plus 3").
- Write in a way that is natural to read aloud. Use "x" and "y" and simple words. For one function keep it to about 3 to 5 sentences; for several functions, a bit longer is fine.`;

app.post("/api/describe", async (req, res) => {
  const { equation, equations, imageBase64 } = req.body;

  // Support single equation or array of equations (equations takes precedence if both sent)
  const equationList = Array.isArray(equations) && equations.length > 0
    ? equations
    : equation != null
      ? [typeof equation === "string" ? equation : String(equation)]
      : [];

  if (equationList.length === 0 || !imageBase64) {
    return res.status(400).json({ error: "Missing equation(s) or imageBase64" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return res.status(500).json({
      error: "Server is missing GEMINI_API_KEY. Add it to server/.env (see server/.env.example).",
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const equationBlurb =
      equationList.length === 1
        ? `Equation: ${equationList[0]}`
        : `Equations:\n${equationList.map((eq, i) => `${i + 1}) ${eq}`).join("\n")}`;

    const contents = [
      {
        inlineData: {
          mimeType: "image/png",
          data: imageBase64.replace(/^data:image\/\w+;base64,/, ""),
        },
      },
      {
        text: `${equationBlurb}\n\n${DESCRIBE_PROMPT}`,
      },
    ];

    // Debug: log request (equations only; do not log full base64)
    console.log("[describe] request equations:", equationList.length, equationList);
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
