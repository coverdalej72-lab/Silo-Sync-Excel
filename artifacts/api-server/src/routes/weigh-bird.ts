import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

router.post("/api/weigh-bird", async (req, res) => {
  try {
    const { imageBase64, ageDays, breed, shedNum } = req.body as {
      imageBase64: string;
      ageDays?: number;
      breed?: string;
      shedNum?: number;
    };

    if (!imageBase64) {
      res.status(400).json({ error: "imageBase64 is required" });
      return;
    }

    const breedInfo = breed ? ` The breed is ${breed}.` : " The breed is likely Ross 308 or Cobb 500 broiler.";
    const ageInfo = ageDays ? ` The birds are approximately ${ageDays} days old.` : "";
    const shedInfo = shedNum ? ` This is from Shed ${shedNum}.` : "";

    const systemPrompt = `You are an expert poultry assessor helping an Australian broiler chicken farmer estimate live bird weight from a photo.
Your job is to examine the image and estimate the bird's live weight in kilograms.
Use visual cues: body size, frame width, breast fullness, feather coverage, leg thickness, and any reference objects visible (hands, crates, feeders).
${breedInfo}${ageInfo}${shedInfo}

Respond ONLY with a valid JSON object in this exact format:
{
  "estimatedWeightKg": <number with 2 decimal places>,
  "confidenceLevel": "<low|medium|high>",
  "weightRangeMin": <number>,
  "weightRangeMax": <number>,
  "visualCues": "<brief description of what you based the estimate on>",
  "notes": "<any important caveats or observations>"
}

Weight guidance for broiler chickens by age:
- 28 days: ~1.4-1.7 kg
- 32 days: ~1.8-2.1 kg  
- 35 days: ~2.1-2.4 kg
- 38 days: ~2.4-2.7 kg
- 42 days: ~2.7-3.1 kg
- 45 days: ~3.0-3.5 kg
- 49 days: ~3.3-3.8 kg

If you cannot see a bird clearly, set estimatedWeightKg to null and explain in notes.
Always report confidence as "low" if no reference object is visible for scale.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      max_completion_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: systemPrompt,
            },
            {
              type: "image_url",
              image_url: {
                url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "";

    // Parse the JSON response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "AI did not return valid JSON", raw });
      return;
    }

    const result = JSON.parse(jsonMatch[0]);
    res.json(result);
  } catch (err) {
    console.error("weigh-bird error:", err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
