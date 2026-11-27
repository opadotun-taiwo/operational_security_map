// AI providers for the daily incident collection. Switch with the AI_PROVIDER variable
// ("openai" or "anthropic") and AI_MODEL; no code changes needed.
//
// Each provider does two steps:
//   research(prompt)  -> plain-text notes from a live web search
//   extract(prompt)   -> JSON matching EXTRACTION_SCHEMA
// (Two steps because Claude's web search citations can't be combined with JSON output.)

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { EXTRACTION_SCHEMA } from './pipeline.js';

const NIGERIA = { type: 'approximate', country: 'NG' };

function openaiProvider({ model, reasoning }) {
  const client = new OpenAI(); // reads OPENAI_API_KEY
  const reasoningParam = reasoning ? { effort: reasoning } : undefined;

  return {
    name: `OpenAI ${model}`,

    async research(prompt) {
      const response = await client.responses.create({
        model,
        reasoning: reasoningParam,
        tools: [{ type: 'web_search', search_context_size: 'high', user_location: NIGERIA }],
        input: prompt
      });
      return response.output_text;
    },

    async extract(prompt) {
      const response = await client.responses.create({
        model,
        reasoning: reasoningParam,
        max_output_tokens: 32000,
        text: { format: { type: 'json_schema', name: 'security_incidents', schema: EXTRACTION_SCHEMA, strict: true } },
        input: prompt
      });
      if (response.status === 'incomplete') {
        throw new Error(`Extraction incomplete: ${response.incomplete_details?.reason || 'unknown reason'}`);
      }
      return JSON.parse(response.output_text);
    }
  };
}

// Models that accept server-side refusal fallbacks ("default" routing)
const CLAUDE_FALLBACK_MODELS = ['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'];
const CLAUDE_EFFORT = { none: 'low', minimal: 'low', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' };

function anthropicProvider({ model, reasoning }) {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const effort = CLAUDE_EFFORT[reasoning] || undefined;
  const useFallbacks = CLAUDE_FALLBACK_MODELS.includes(model);

  // On a safety decline, let the API re-run the request on a fallback model
  const create = (params) => (useFallbacks
    ? client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : client.messages.create(params));

  const textOf = (message) => message.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();

  return {
    name: `Anthropic ${model}`,

    async research(prompt) {
      const messages = [{ role: 'user', content: prompt }];
      const tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 15, user_location: NIGERIA }];
      // A long search can pause; send the turn back so the server continues it
      for (let turn = 0; turn < 5; turn++) {
        const message = await create({ model, max_tokens: 16000, output_config: effort ? { effort } : undefined, tools, messages });
        if (message.stop_reason === 'refusal') throw new Error('Claude declined the research request');
        if (message.stop_reason !== 'pause_turn') return textOf(message);
        messages.push({ role: 'assistant', content: message.content });
      }
      throw new Error('Web search did not finish after 5 continuations');
    },

    async extract(prompt) {
      const message = await create({
        model,
        max_tokens: 32000,
        output_config: { ...(effort ? { effort } : {}), format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
        messages: [{ role: 'user', content: prompt }]
      });
      if (message.stop_reason === 'refusal') throw new Error('Claude declined the extraction request');
      if (message.stop_reason === 'max_tokens') throw new Error('Extraction hit the output limit');
      return JSON.parse(textOf(message));
    }
  };
}

export function createProvider({ provider, model, reasoning }) {
  const name = String(provider || 'openai').toLowerCase();
  if (!model) throw new Error('AI_MODEL is not set');
  if (name === 'openai') return openaiProvider({ model, reasoning });
  if (name === 'anthropic' || name === 'claude') return anthropicProvider({ model, reasoning });
  throw new Error(`Unknown AI_PROVIDER "${provider}" (use "openai" or "anthropic")`);
}
