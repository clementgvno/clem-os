import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { Agent, stepCountIs } from '@convex-dev/agent'

import { components } from './_generated/api'
import { itemTools } from './agentTools'
import { BASE_INSTRUCTIONS } from './lib/instructions'

// OpenRouter model slug, e.g. `z-ai/glm-5.3-flash`, `anthropic/claude-haiku-4.5`.
// Browse the catalogue at https://openrouter.ai/models — the slug there is
// what goes in this env var, and it is NOT the provider's own model id.
const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL ?? 'z-ai/glm-5.3-flash'

export function getModel() {
  // The provider reads OPENROUTER_API_KEY from the Convex env on its own.
  return createOpenRouter().chat(OPENROUTER_MODEL)
}

export const chatAgent = new Agent(components.agent, {
  name: 'clem-os',
  languageModel: getModel(),
  // Per-message system prompt (route/org context) is layered on top at
  // stream time via `buildInstructions` in convex/chat.ts.
  instructions: BASE_INSTRUCTIONS,
  tools: itemTools,
  // Room for a multi-step loop: tool call → approval → resume → final answer.
  stopWhen: stepCountIs(10),
})
