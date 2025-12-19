
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, PubMedArticle } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

export const callGeminiAnalysis = async (inputText: string): Promise<AnalysisResult> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analyze this medical text. 
    Task 1: Detect language. If Japanese, translate to academic English. Else keep as is.
    Task 2: Extract 10-15 MeSH-like keywords.
    Input: """${inputText}"""`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isJapanese: { type: Type.BOOLEAN },
          englishText: { type: Type.STRING },
          meshTerms: { 
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["isJapanese", "englishText", "meshTerms"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

export const callGeminiTitleTranslation = async (articles: PubMedArticle[]): Promise<Record<string, string>> => {
  if (articles.length === 0) return {};
  
  const inputMap = articles.reduce((acc, curr) => ({ ...acc, [curr.id]: curr.title }), {});
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `You are a professional medical translator. 
    Translate the following medical article titles into natural Japanese.
    Ensure technical terms are translated accurately according to standard medical nomenclature.
    Input JSON (PMID as key):
    ${JSON.stringify(inputMap)}`,
    config: {
      responseMimeType: "application/json"
    }
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to parse title translations", e);
    return {};
  }
};

export const callGeminiReview = async (
  targetText: string, 
  articlesData: PubMedArticle[], 
  referenceData: any[]
): Promise<string> => {
  const articlesContext = articlesData.map((a, i) => `
    [Selected Paper ${i+1}]
    PMID: ${a.pmid}
    Title (JP): ${a.titleJa || "N/A"}
    Title (EN): ${a.title}
    Source: ${a.journal} (${a.pubdate})
    Content: ${a.fullText || a.abstract || "Abstract unavailable"}
  `).join("\n\n");

  const refsContext = referenceData.map((r, i) => `
    [Background Reference ${i+1}]
    PMID: ${r.pmid}
    Title: ${r.title}
    Abstract: ${r.abstract || "Abstract unavailable"}
  `).join("\n\n");

  const prompt = `
    Role: Senior Medical Data Scientist & Systematic Review Expert.
    Task: Write a comprehensive literature review report in Japanese.
    
    Context Data:
    1. TARGET IDEA/RESEARCH THEME: """${targetText}"""
    2. SELECTED PRIMARY ARTICLES (Full Text or Abstracts):
    """${articlesContext}"""
    3. CITED KEY REFERENCES (Citation Network Analysis):
    """${refsContext}"""
    
    Report Requirements:
    - Use professional academic Japanese.
    - Synthesize evidence rather than just listing it.
    - Highlighting gaps and future research directions.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      thinkingConfig: { thinkingBudget: 4000 }
    }
  });

  return response.text || "Report generation failed.";
};
