import { Router, type IRouter } from "express";
import {
  AnalyzeChartBody,
  AnalyzeChartResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const TRADING_VISION_PROMPT = `You are an ultra-fast institutional price action analyzer specializing in M1/M5 binary options and forex scalping. 
Analyze the uploaded screenshot carefully:
- Identify the Asset Name (e.g. XAUUSD, EURUSD, OTC) and Timeframe (M1) automatically from the chart UI.
- Observe the PRESENT/CURRENT running candle: evaluate its body momentum, upper/lower wick rejection, and proximity to key Support & Resistance or Supply/Demand zones.
- Predict the direction of the VERY NEXT candle (RED for Put/Sell, GREEN for Call/Buy).
- Return STRICT JSON only:
{
  "asset": "DETECTED_ASSET",
  "timeframe": "DETECTED_TIMEFRAME",
  "signal": "RED" | "GREEN",
  "confidence": 94,
  "reason": "Brief 1-line technical reason"
}`;

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

router.post("/analysis/chart", async (req, res) => {
  const parsed = AnalyzeChartBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "A valid chart screenshot is required." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ message: "Analysis service is not configured." });
    return;
  }

  try {
    const upstream = await fetch(`${GEMINI_API_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: TRADING_VISION_PROMPT },
              {
                inline_data: {
                  mime_type: parsed.data.mimeType,
                  data: parsed.data.imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!upstream.ok) {
      req.log.error({ status: upstream.status }, "Chart analysis upstream request failed");
      res.status(502).json({ message: "The analysis service is temporarily unavailable." });
      return;
    }

    const payload = (await upstream.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      res.status(502).json({ message: "The analysis service returned no signal." });
      return;
    }

    const cleanText = rawText.replace(/^```json\s*|\s*```$/g, "").trim();
    const result = AnalyzeChartResponse.safeParse(JSON.parse(cleanText));
    if (!result.success) {
      req.log.error({ issues: result.error.issues }, "Chart analysis response failed validation");
      res.status(502).json({ message: "The analysis service returned an invalid signal." });
      return;
    }

    res.json(result.data);
  } catch (error) {
    req.log.error({ err: error }, "Chart analysis request failed");
    res.status(502).json({ message: "The analysis service is temporarily unavailable." });
  }
});

export default router;