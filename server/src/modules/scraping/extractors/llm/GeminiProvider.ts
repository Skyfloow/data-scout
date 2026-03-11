import { GoogleGenAI } from '@google/genai';
import { ILLMProvider, ILLMExtractionResult } from './ILLMProvider';
import { config } from '../../../../config';
import { logger as baseLogger } from '../../../../utils/logger';

const logger = baseLogger.child({ module: 'GeminiProvider' });

export class GeminiProvider implements ILLMProvider {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }

  async extractProductData(content: string, prompt: string): Promise<ILLMExtractionResult> {
    if (!config.geminiApiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    
    const fullPrompt = `${prompt}\n\nHere is the content to extract from:\n${content.slice(0, 800000)}`; // limit just in case
    
    logger.info('Calling Gemini 2.5 Flash for fallback extraction...');
    
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: fullPrompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1, // low temperature for deterministic extraction
      }
    });

    if (!response.text) {
      throw new Error('Gemini returned empty response');
    }

    try {
      const parsed = JSON.parse(response.text);
      return {
        title: parsed.title,
        metrics: parsed.metrics || parsed
      };
    } catch (e) {
      logger.error({ responseText: response.text }, 'Failed to parse Gemini JSON response');
      throw new Error(`Failed to parse Gemini response as JSON`);
    }
  }

  async extractMultimodalProductData(markdown: string, base64Image: string | undefined, prompt: string): Promise<ILLMExtractionResult> {
    if (!config.geminiApiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    
    logger.info('Calling Gemini 2.5 Flash for multimodal fallback extraction...');
    
    const contents: any[] = [];
    
    if (base64Image) {
      contents.push({
        inlineData: {
          data: base64Image.replace(/^data:image\/\w+;base64,/, ''),
          mimeType: 'image/jpeg'
        }
      });
    }

    contents.push({
      text: `${prompt}\n\nHere is the markdown content to extract from:\n${markdown.slice(0, 800000)}`
    });
    
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1, // low temperature for deterministic extraction
      }
    });

    if (!response.text) {
      throw new Error('Gemini multimodal returned empty response');
    }

    try {
      const parsed = JSON.parse(response.text);
      return {
        title: parsed.title,
        metrics: parsed.metrics || parsed
      };
    } catch (e) {
      logger.error({ responseText: response.text }, 'Failed to parse Gemini multimodal JSON response');
      throw new Error(`Failed to parse Gemini multimodal response as JSON`);
    }
  }

  async extractGenericJson<T = any>(content: string, prompt: string): Promise<T> {
    if (!config.geminiApiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    
    const fullPrompt = `${prompt}\n\nContent:\n${content.slice(0, 800000)}`;
    
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: fullPrompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      }
    });

    if (!response.text) {
      throw new Error('Gemini generic JSON returned empty response');
    }

    try {
      return JSON.parse(response.text) as T;
    } catch (e) {
      logger.error({ responseText: response.text }, 'Failed to parse Gemini generic JSON response');
      throw new Error(`Failed to parse Gemini generic response as JSON`);
    }
  }
}
