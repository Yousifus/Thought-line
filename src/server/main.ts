// Entry point: load .env, check the config (exit non-zero if unsafe), wire store, providers and app, and listen.
import 'dotenv/config';
import { loadConfig } from './config';
import type { Config } from './config';
import { buildApp } from './app';
import { fileStore } from './fileStore';
import { buildProviders } from './providers';
import { serialQueue } from './queue';
import { createService } from './service';

function fail(message: string): never {
  console.error(`Thought-line will not start: ${message}`);
  process.exit(1);
}

let config: Config;
try {
  config = loadConfig(process.env);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

const service = createService({
  store: fileStore(config.dataDir),
  providers: buildProviders(config),
  maxChars: config.maxChars,
  queue: serialQueue(),
});

const server = buildApp(config, service).listen(config.port, config.host, () => {
  console.log(`Thought-line listening on http://${config.host}:${config.port}`);
  if (config.fixtureAnalysisPath) console.log(`Using the canned analysis in ${config.fixtureAnalysisPath}; no model will be called.`);
});

server.on('error', err => fail(err instanceof Error ? err.message : String(err)));
