import * as fs from 'node:fs';
import * as path from 'node:path';
import { config } from 'dotenv';

const rootDir = path.join(import.meta.dirname, '..');
const envDir = path.join(rootDir, 'src/environments');

for (const file of ['.env', '.env.local', '.env.production']) {
  config({ path: path.join(rootDir, file), override: false, quiet: true });
}

interface EnvVar {
  readonly key: string;
  readonly fallback: string;
}

const VARS: readonly EnvVar[] = [
  { key: 'API_URL', fallback: 'http://localhost:8099/api/v1' },
  { key: 'SOCKET_URL', fallback: 'ws://localhost:3000' },
  { key: 'ATMOSPHERE', fallback: 'development' },
  { key: 'DEFAULT_LANGUAGE', fallback: 'es' },
  { key: 'DEFAULT_THEME', fallback: 'dark' },
  { key: 'DEFAULT_CURRENCY', fallback: 'COP' },
  { key: 'DEFAULT_TIMEZONE', fallback: 'America/Bogota' },
  { key: 'DEFAULT_DATE_FORMAT', fallback: 'dd/MM/yyyy' },
  { key: 'DEFAULT_TIME_FORMAT', fallback: 'HH:mm:ss' },
  { key: 'DEFAULT_DATE_TIME_FORMAT', fallback: 'dd/MM/yyyy HH:mm:ss' },
  { key: 'DEFAULT_DECIMAL_PLACES', fallback: '2' },
];

function readVar({ key, fallback }: EnvVar): string {
  const raw = process.env[key];
  return raw === undefined || raw.trim() === '' ? fallback : raw.trim();
}

function buildConfig(production: boolean): string {
  const lines = [`  PRODUCTION: ${production},`];

  for (const variable of VARS) {
    lines.push(`  ${variable.key}: '${readVar(variable).replace(/'/g, "\\'")}',`);
  }

  return `export const environment = {\n${lines.join('\n')}\n};\n`;
}

const TARGETS = [
  { file: 'environment.ts', production: false },
  { file: 'environment.dev.ts', production: false },
  { file: 'environment.prod.ts', production: true },
] as const;

fs.mkdirSync(envDir, { recursive: true });

for (const { file, production } of TARGETS) {
  fs.writeFileSync(path.join(envDir, file), buildConfig(production), 'utf-8');
}

console.log(`Environment files generated: ${TARGETS.map((t) => t.file).join(', ')}`);
