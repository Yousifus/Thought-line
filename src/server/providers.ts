// Builds the model providers from config: local is always kind 'local', cloud is kind 'cloud', a fixture replaces local.
import { openAICompatible } from '../core';
import type { ModelProvider } from '../core';
import type { Config } from './config';
import { fixtureProvider } from './fixtureProvider';

export function buildProviders(config: Config): { local: ModelProvider; cloud?: ModelProvider } {
  const local = config.fixtureAnalysisPath
    ? fixtureProvider(config.fixtureAnalysisPath)
    : openAICompatible({ baseUrl: config.local.baseUrl, model: config.local.model, kind: 'local' });
  const cloud = config.cloud
    ? openAICompatible({ baseUrl: config.cloud.baseUrl, model: config.cloud.model, kind: 'cloud', apiKey: config.cloud.apiKey })
    : undefined;
  return cloud ? { local, cloud } : { local };
}
