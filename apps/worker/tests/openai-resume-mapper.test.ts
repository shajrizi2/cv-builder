import type OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import { OpenAiResumeMapper } from '../src/ai/openai-resume-mapper.js';
import { ResumeImportProcessingError } from '../src/imports/import-error.js';

function mapperWith(parse: ReturnType<typeof vi.fn>): OpenAiResumeMapper {
  return new OpenAiResumeMapper('configured-model', 'private-key', 100, {
    responses: { parse },
  } as unknown as OpenAI);
}

describe('OpenAiResumeMapper safe failure classification', () => {
  it('classifies provider requests and timeouts as retryable without exposing details', async () => {
    const mapper = mapperWith(vi.fn().mockRejectedValue(new Error('private-key private resume')));
    const error = await mapper.map('private resume').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ResumeImportProcessingError);
    expect(error).toMatchObject({ code: 'AI_PROVIDER_ERROR', retryable: true });
    expect(String(error)).not.toContain('private-key');
    expect(String(error)).not.toContain('private resume');
  });

  it('classifies missing structured output as non-retryable', async () => {
    const error = await mapperWith(vi.fn().mockResolvedValue({ output_parsed: null }))
      .map('resume')
      .catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: 'AI_INVALID_RESPONSE', retryable: false });
  });

  it('classifies invalid structured output as non-retryable', async () => {
    const error = await mapperWith(vi.fn().mockResolvedValue({ output_parsed: { summary: 42 } }))
      .map('resume')
      .catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: 'AI_INVALID_RESPONSE', retryable: false });
  });
});
