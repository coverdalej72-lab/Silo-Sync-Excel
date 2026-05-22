import { Router } from "express";
import { ai } from "@workspace/integrations-gemini-ai";

const router = Router();

const INGHAM_PROMPT = `You are reading an Ingham's Despatch Docket — an Australian poultry feed delivery document.

Extract these fields and return ONLY a valid JSON object (no markdown, no explanation):

{
  "feedType": "Product name only, without product code — e.g. 'Gourmet Broiler Grower' from 'F116 GOURMET BROILER GROWER'. Capitalise properly.",
  "productCode": "The product code, e.g. 'F116'",
  "amount": <Net Weight in tonnes as a number, e.g. 28.16>,
  "unit": "t",
  "deliveryDate": "The 'Date Req' field as YYYY-MM-DD, e.g. '2026-05-18'",
  "orderNumber": "The Order No value",
  "customerName": "The Customer Name",
  "siteCode": "The Site code",
  "deliveryInstructions": "The Delivery Instructions text exactly as printed, e.g. '5 B 10, 6 B 5, 7 B 13'",
  "truckRego": "The Truck Rego value",
  "outloadingBin": "The Outloading Bin value"
}

Use null for any field you cannot read clearly.`;

router.post("/scan-docket/ingham", async (req, res) => {
  const { imageData, mimeType } = req.body as { imageData?: string; mimeType?: string };

  if (!imageData || !mimeType) {
    res.status(400).json({ error: "imageData and mimeType are required" });
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                data: imageData,
                mimeType,
              },
            },
            { text: INGHAM_PROMPT },
          ],
        },
      ],
      config: { maxOutputTokens: 8192 },
    });

    const raw = response.text ?? "";
    // Strip any markdown fences Gemini might add
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      res.status(422).json({ error: "Could not parse AI response", raw });
      return;
    }

    res.json({ ok: true, fields: parsed });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
