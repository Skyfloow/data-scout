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

  /**
   * Extracts structured product data visually and textually.
   * @param markdown The markdown content
   * @param base64Image The image as base64 jpeg
   * @param prompt The prompt instructing the LLM what to extract
   */
  extractMultimodalProductData(markdown: string, base64Image: string | undefined, promptInfo: string): Promise<any>;

  /**
   * Extracts generic JSON. Useful for self-healing selectors.
   */
  extractGenericJson<T = any>(content: string, prompt: string): Promise<T>;
}
