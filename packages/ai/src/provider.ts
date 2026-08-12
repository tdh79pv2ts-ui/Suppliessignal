import { entityTypes, extractionOutputSchema } from './schemas.js';
import { CLAIM_EXTRACTION_PROMPT } from './prompt.js';

export type ExtractionInput = { title: string; text: string; publishedAt?: string; sourceName: string };
export type ProviderResult = { output: unknown; inputTokens?: number; outputTokens?: number };
export interface ExtractionProvider { readonly name: string; readonly model: string; extract(input: ExtractionInput): Promise<ProviderResult>; }
export class AIProviderError extends Error { constructor(public readonly code: 'AI_TIMEOUT'|'AI_RATE_LIMITED'|'AI_PROVIDER_ERROR', message: string, public readonly transient: boolean) { super(message); } }
export class FakeExtractionProvider implements ExtractionProvider {
  readonly name = 'fake'; readonly model = 'deterministic-fixture';
  constructor(private readonly response: unknown | ((input: ExtractionInput) => unknown)) {}
  async extract(input: ExtractionInput) { return { output: typeof this.response === 'function' ? this.response(input) : this.response }; }
}
export class OpenAIExtractionProvider implements ExtractionProvider {
  readonly name = 'openai';
  constructor(readonly model: string, private readonly apiKey: string, private readonly timeoutMs = 30_000) {}
  async extract(input: ExtractionInput): Promise<ProviderResult> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', signal: controller.signal, headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: this.model, instructions: CLAIM_EXTRACTION_PROMPT, input: JSON.stringify(input), text: { format: { type: 'json_schema', name: 'claim_extraction', strict: true, schema: zodLikeJsonSchema } } }) });
      if (response.status === 429) throw new AIProviderError('AI_RATE_LIMITED', 'AI provider rate limited the request', true);
      if (!response.ok) throw new AIProviderError('AI_PROVIDER_ERROR', 'AI provider request failed', response.status >= 500);
      const data = await response.json() as { output_text?: string; output?: { content?: { type?: string; text?: string }[] }[]; usage?: { input_tokens?: number; output_tokens?: number } };
      const outputText=data.output_text??data.output?.flatMap((item)=>item.content??[]).find((item)=>item.type==='output_text')?.text;
      return { output: JSON.parse(outputText ?? ''), ...(data.usage?.input_tokens !== undefined ? { inputTokens: data.usage.input_tokens } : {}), ...(data.usage?.output_tokens !== undefined ? { outputTokens: data.usage.output_tokens } : {}) };
    } catch (error) { if (error instanceof AIProviderError) throw error; if (controller.signal.aborted) throw new AIProviderError('AI_TIMEOUT', 'AI provider timed out', true); throw new AIProviderError('AI_PROVIDER_ERROR', 'AI provider response was invalid', false); }
    finally { clearTimeout(timer); }
  }
}
// Kept beside the Zod validator; provider output is validated again with extractionOutputSchema.
const nullableString={type:['string','null']} as const;
const nullableConfidence={type:['number','null'],minimum:0,maximum:1} as const;
const entitySchema={type:'object',additionalProperties:false,required:['entityType','name','normalizedName','role','confidence'],properties:{entityType:{type:'string',enum:entityTypes},name:{type:'string'},normalizedName:nullableString,role:nullableString,confidence:nullableConfidence}} as const;
const locationSchema={type:'object',additionalProperties:false,required:['name','country','region','city','confidence'],properties:{name:{type:'string'},country:nullableString,region:nullableString,city:nullableString,confidence:nullableConfidence}} as const;
const zodLikeJsonSchema = { type: 'object', additionalProperties: false, required: ['articleRelevant','claims'], properties: { articleRelevant: { type: 'boolean' }, claims: { type: 'array', maxItems: 25, items: { type: 'object', additionalProperties: false, required: ['claimType','assertionMode','statement','confidence','occurredAt','validFrom','validUntil','evidenceText','entities','locations'], properties: { claimType: { type: 'string', enum: extractionOutputSchema.shape.claims.element.shape.claimType.options }, assertionMode: { type: 'string', enum: extractionOutputSchema.shape.claims.element.shape.assertionMode.options }, statement: { type: 'string' }, confidence: { type: 'number', minimum: 0, maximum: 1 }, occurredAt: nullableString, validFrom: nullableString, validUntil: nullableString, evidenceText: { type: 'string' }, entities: { type: 'array', maxItems:25, items: entitySchema }, locations: { type: 'array', maxItems:25, items: locationSchema } } } } } } as const;
