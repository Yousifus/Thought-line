// Entry point: load .env, check the config (exit non-zero if unsafe), wire store, providers and app, and listen.
import { config as loadDotenv } from 'dotenv';
import { isWildcardAddress, loadConfig } from './config';
import type { Config } from './config';
import { buildApp } from './app';
import { fileStore } from './fileStore';
import { buildProviders } from './providers';
import { serialQueue } from './queue';
import { createService } from './service';

loadDotenv({ quiet: true });

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
  // Backstop for odd spellings of "everywhere" (0x0, 0, ...) that loadConfig's list does not know: check where we really bound.
  const bound = server.address();
  if (bound && typeof bound === 'object' && isWildcardAddress(bound.address)) {
    server.close();
    fail(`bound to all interfaces (${bound.address}); set TL_HOST to the Tailscale address or 127.0.0.1`);
  }
  console.log(`Thought-line listening on http://${config.host}:${config.port}`);
  if (config.fixtureAnalysisPath) console.log(`Using the canned analysis in ${config.fixtureAnalysisPath}; no model will be called.`);
});

server.on('error', err => fail(err instanceof Error ? err.message : String(err)));
