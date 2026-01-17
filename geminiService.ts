
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, ItemInstance, ModelMode, ItemMetadata } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function analyzeItems(
  batchImageBase64: string, 
  metadata: ItemMetadata,
  modelMode: ModelMode = ModelMode.PRO
): Promise<AnalysisResult> {
  const startTime = Date.now();
  const itemName = metadata.name || "items";
  
  const systemPrompt = `You are a high-precision instance segmentation model.
Your task is to identify and segment every individual "${itemName}" in the provided batch image.

${modelMode === ModelMode.FLASH ? 'OPTIMIZATION MODE: Prioritize speed. Simplify masks to 8-10 points.' : 'ACCURACY MODE: Detailed masks (15+ points).'}

For each item detected:
1. Provide a bounding box in normalized coordinates [ymin, xmin, ymax, xmax] (0-1000).
2. Provide a simplified polygon mask representing the boundary.
3. Assign a confidence score (0.0 to 1.0).
4. Estimate the 2D area in pixels relative to the image size.

Return the data as a clean JSON object.`;

  const contents: any[] = [
    { inlineData: { data: batchImageBase64, mimeType: 'image/jpeg' } },
    { text: `Detect and segment all ${itemName} in this batch image.` }
  ];

  // If we have a sample image, provide it as few-shot context
  if (metadata.sampleImage) {
    const sampleBase64 = metadata.sampleImage.split(',')[1];
    contents.unshift({ 
      text: `For reference, here is what a single "${itemName}" looks like:` 
    }, { 
      inlineData: { data: sampleBase64, mimeType: 'image/jpeg' } 
    });
  }

  const response = await ai.models.generateContent({
    model: modelMode,
    contents: { parts: contents },
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                boundingBox: { 
                  type: Type.ARRAY, 
                  items: { type: Type.NUMBER }
                },
                mask: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      x: { type: Type.NUMBER },
                      y: { type: Type.NUMBER }
                    }
                  }
                },
                confidence: { type: Type.NUMBER },
                areaPx: { type: Type.NUMBER },
                label: { type: Type.STRING }
              },
              required: ["id", "boundingBox", "mask", "confidence", "areaPx"]
            }
          }
        },
        required: ["items"]
      }
    }
  });

  const rawResult = JSON.parse(response.text);
  const latencyMs = Date.now() - startTime;
  
  const items: ItemInstance[] = rawResult.items;
  const totalCount = items.length;
  const avgConf = items.reduce((acc, s) => acc + s.confidence, 0) / (totalCount || 1);
  const totalArea = items.reduce((acc, s) => acc + s.areaPx, 0);

  return {
    items,
    imageWidth: 0,
    imageHeight: 0,
    performance: {
      latencyMs,
      modelName: modelMode === ModelMode.PRO ? "Standard (FP32)" : "Quantized (INT8)",
      estimatedModelSizeMb: modelMode === ModelMode.PRO ? 450 : 28.4
    },
    summary: {
      totalCount,
      averageConfidence: avgConf,
      totalAreaPx: totalArea
    }
  };
}
