export interface ILLMExtractionResult {
  title?: string;
  metrics: Record<string, any>;
}

export interface ILLMProvider {
  /**
   * Extracts structured product data from HTML or text.
   * @param content The stripped HTML or markdown content
   * @param prompt The prompt instructing the LLM what to extract
   */
  extractProductData(content: string, prompt: string): Promise<ILLMExtractionResult>;
}
