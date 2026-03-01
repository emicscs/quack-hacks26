import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { appendFileSync } from "fs";
// #region agent log
const __dbgLog = (loc, msg, data, hId) => { try { appendFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'debug-6f9547.log'), JSON.stringify({sessionId:'6f9547',location:loc,message:msg,data,timestamp:Date.now(),hypothesisId:hId})+'\n'); } catch(e){} };
// #endregion

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

// ── Voice-command endpoint ──────────────────────────────────────────────────
const VOICE_COMMAND_PROMPT = `You are a voice-command interpreter for Audible Math, an app that helps blind users explore math graphs with sound.

The user spoke a command into their microphone. Your job is to figure out what action they want, and return ONLY a JSON object (no markdown, no backticks, no explanation) matching one of the action schemas below.

Available actions:

1. **add_function** – Graph a function.
   { "action": "add_function", "expression": "<math expression like x^2, sin(x), e^x>" }
   Trigger phrases: "add function …", "graph …", "plot …", "set function to …", "change function to …", "type in …"

2. **set_step_size** – Change the cursor step size.
   { "action": "set_step_size", "value": <positive number> }
   Trigger phrases: "set step size to …", "make step size smaller/bigger", "step size …"
   If they say "smaller" without a number, halve the current step. If "bigger"/"larger", double it.
   Use "relative": "smaller" or "relative": "larger" when no exact number is given:
   { "action": "set_step_size", "relative": "smaller" }

3. **set_sound_duration** – Change max sound duration in seconds.
   { "action": "set_sound_duration", "value": <positive number in seconds> }
   Trigger phrases: "set sound duration …", "make sound longer/shorter"
   Same relative rules: { "action": "set_sound_duration", "relative": "shorter" } or "longer"

4. **toggle_critical_points** – Turn "stop at critical points" on or off.
   { "action": "toggle_critical_points", "enabled": true/false }
   Trigger phrases: "stop at critical points", "turn on/off critical points", "enable/disable critical points"

5. **describe_graph** – Trigger the "describe graph" feature (Gemini vision description read aloud).
   { "action": "describe_graph" }
   Trigger phrases: "describe the graph", "what does the graph look like", "tell me about the graph", "describe function"

6. **navigate** – Move the cursor left or right by a certain number of steps.
   { "action": "navigate", "direction": "left" or "right", "steps": <number, default 1> }
   Trigger phrases: "go left", "move right", "go left 5 steps", "step right"

7. **read_position** – Read the current x,y coordinates aloud.
   { "action": "read_position" }
   Trigger phrases: "where am I", "what's the current position", "read position", "current point"

8. **select_example** – Pick a function from the examples dropdown.
   { "action": "select_example", "name": "<one of: sin(x), x^2, 1/x, sqrt(x), e^x>" }
   Trigger phrases: "show me sine", "try x squared", "example square root"

9. **unknown** – The command doesn't match any action.
   { "action": "unknown", "message": "<brief friendly explanation of what you can do>" }

Rules:
- Return ONLY valid JSON. No markdown code fences, no extra text.
- For add_function, normalize the expression: "x squared" → "x^2", "sine of x" → "sin(x)", "e to the x" → "e^x", "square root of x" → "sqrt(x)", "one over x" → "1/x", "two x squared plus 3" → "2*x^2+3", etc.
- Be generous in interpretation. "Make it smaller" in context of step size → set_step_size relative smaller.
- If ambiguous, pick the most likely action.`;

app.post("/api/voice-command", async (req, res) => {
  // #region agent log
  __dbgLog('server/index.js:voice-command-entry','voice-command endpoint hit',{hasBody:!!req.body,bodyKeys:req.body?Object.keys(req.body):[],envKeyExists:!!process.env.GEMINI_API_KEY,envKeyLength:process.env.GEMINI_API_KEY?process.env.GEMINI_API_KEY.length:0,envKeyPrefix:process.env.GEMINI_API_KEY?process.env.GEMINI_API_KEY.substring(0,8):'NONE',dotenvPath:path.join(__dirname,'.env')},'H1-H2-H3');
  // #endregion
  const { transcript, context } = req.body;

  if (!transcript) {
    return res.status(400).json({ error: "Missing transcript" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  // #region agent log
  __dbgLog('server/index.js:apikey-check','API key check',{apiKey:apiKey?'present('+apiKey.length+')':'MISSING',isPlaceholder:apiKey==='your_gemini_api_key_here',willReject:!apiKey||apiKey==='your_gemini_api_key_here'},'H1');
  // #endregion
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    return res.status(500).json({ error: "Server is missing GEMINI_API_KEY." });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    let contextBlurb = "";
    if (context) {
      contextBlurb = `\n\nCurrent app state:\n- Current function: ${context.currentFunction || "none"}\n- Step size: ${context.stepSize ?? "?"}\n- Sound duration: ${context.soundDuration ?? "?"}s\n- Stop at critical points: ${context.stopAtCritical ? "on" : "off"}\n- Cursor position: x=${context.cursorX ?? "?"}, y=${context.cursorY ?? "?"}`;
    }

    const userMessage = `User said: "${transcript}"${contextBlurb}`;

    console.log("[voice-command] transcript:", transcript);
    console.log("[voice-command] context:", JSON.stringify(context));

    let text = "";
    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: userMessage,
          config: {
            systemInstruction: VOICE_COMMAND_PROMPT,
          },
        });
        text = (response?.text ?? "").trim();
        break;
      } catch (retryErr) {
        console.warn(`[voice-command] attempt ${attempt + 1} failed:`, retryErr.message);
        if (attempt === MAX_RETRIES) throw retryErr;
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    console.log("[voice-command] raw Gemini response:", text);

    // Strip markdown fences if Gemini wraps in ```json ... ```
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("[voice-command] JSON parse failed:", parseErr.message, "raw:", cleaned);
      return res.json({ action: "unknown", message: "I didn't understand that. Try saying something like 'add function x squared' or 'make the step size smaller'." });
    }

    console.log("[voice-command] parsed action:", JSON.stringify(parsed));
    res.json(parsed);
  } catch (err) {
    console.error("[voice-command] Gemini error:", err.message);
    res.status(500).json({ error: err.message || "Voice command failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  // #region agent log
  __dbgLog('server/index.js:startup','Server started with instrumented code',{port:PORT,hasGeminiKey:!!process.env.GEMINI_API_KEY,geminiKeyLen:process.env.GEMINI_API_KEY?process.env.GEMINI_API_KEY.length:0,envPath:path.join(__dirname,'.env')},'H4');
  // #endregion
});
