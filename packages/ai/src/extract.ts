import { createHash } from 'node:crypto';
import { extractionOutputSchema, type ExtractionOutput } from './schemas.js';
import { ExtractionInputError, type ExtractionInput, type ExtractionProvider } from './provider.js';
export const MAX_EXTRACTION_CHARACTERS = 50_000;
export function prepareExtractionInput(input: ExtractionInput) { if (!input.text.trim()) throw new ExtractionInputError(); const text = input.text.slice(0, MAX_EXTRACTION_CHARACTERS); return { input: { ...input, text }, truncated: text.length !== input.text.length, inputHash: createHash('sha256').update(JSON.stringify({ ...input, text })).digest('hex') }; }
// Repeated evidence uses the first exact occurrence, making offsets deterministic.
export function validateEvidence(output: ExtractionOutput, text: string) { return { ...output, claims: output.claims.map((claim) => { const start = text.indexOf(claim.evidenceText); if (start < 0) throw new Error('INVALID_EVIDENCE'); return { ...claim, evidenceStart: start, evidenceEnd: start + claim.evidenceText.length }; }) }; }
export async function extractClaims(provider: ExtractionProvider, input: ExtractionInput) { const prepared = prepareExtractionInput(input); const result = await provider.extract(prepared.input); const parsed = extractionOutputSchema.safeParse(result.output); if (!parsed.success) throw new Error('INVALID_AI_OUTPUT'); return { ...validateEvidence(parsed.data, prepared.input.text), ...prepared, usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens } }; }
