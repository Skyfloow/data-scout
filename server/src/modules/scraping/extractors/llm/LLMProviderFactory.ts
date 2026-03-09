import { ILLMProvider } from './ILLMProvider';
import { GeminiProvider } from './GeminiProvider';

export type LLMProviderType = 'gemini' | 'openai' | 'anthropic';

export class LLMProviderFactory {
  static createProvider(type: LLMProviderType = 'gemini'): ILLMProvider {
    switch (type) {
      case 'gemini':
        return new GeminiProvider();
      // Add other providers here in the future
      case 'openai':
      case 'anthropic':
        throw new Error(`Provider ${type} is not yet implemented.`);
      default:
        throw new Error(`Unknown LLM provider: ${type}`);
    }
  }
}
