// CLI: npm run import -- <folder> [--public] [--analyze]. Imports a folder of writing, private by default; prints counts only.
import { config as loadDotenv } from 'dotenv';
import { loadConfig } from '../src/server/config';
import type { Config } from '../src/server/config';
import { fileStore } from '../src/server/fileStore';
import { importFolder, SERVER_RUNNING_MESSAGE, serverIsRunning } from '../src/server/import';
import { buildProviders } from '../src/server/providers';
import { serialQueue } from '../src/server/queue';
import { createService } from '../src/server/service';

loadDotenv({ quiet: true });

const USAGE = 'Usage: npm run import -- <folder> [--public] [--analyze]';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const flags = new Set<string>();
const folders: string[] = [];
for (const arg of process.argv.slice(2)) {
  if (arg === '--public' || arg === '--analyze') flags.add(arg);
  else if (arg.startsWith('--')) fail(`Unknown option ${arg}\n${USAGE}`);
  else folders.push(arg);
}
if (folders.length !== 1) fail(USAGE);

let config: Config;
try {
  config = loadConfig(process.env);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

if (await serverIsRunning(config.host, config.port)) fail(SERVER_RUNNING_MESSAGE);

const store = fileStore(config.dataDir);
// Providers are only built when asked for, so a plain import never reaches a model.
const analyze = flags.has('--analyze');
const service = createService({
  store,
  providers: analyze ? buildProviders(config) : { local: { name: 'unused', kind: 'local', complete: async () => { throw new Error('No model is used without --analyze'); } } },
  maxChars: config.maxChars,
  queue: serialQueue(),
});

try {
  const privacy = flags.has('--public') ? 'public' : 'private';
  const result = await importFolder({ service, store }, folders[0], { privacy, analyze });
  console.log(`Imported as ${privacy}: created ${result.created}, updated ${result.updated}, skipped ${result.skipped}, failed ${result.failed.length}.`);
  for (const f of result.failed) console.error(`Failed: ${f.path}: ${f.error}`);
  if (result.failed.length > 0) process.exitCode = 1;
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
