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
  readonly description: string;
}

const VARS: readonly EnvVar[] = [
  {
    key: 'API_URL',
    fallback: 'https://back-dev.synappta.cloud/api/v1',
    description: 'API base del backend (termina en /api/v1)',
  },
  {
    key: 'SOCKET_URL',
    fallback: 'ws://localhost:3000',
    description: 'URL del servidor de websockets',
  },
  {
    key: 'ATMOSPHERE',
    fallback: 'development',
    description: 'Entorno de despliegue (development | production)',
  },
  {
    key: 'DEFAULT_LANGUAGE',
    fallback: 'es',
    description: 'Idioma inicial de la app (es | en)',
  },
  {
    key: 'DEFAULT_THEME',
    fallback: 'dark',
    description: 'Tema inicial de la app (dark | light)',
  },
  {
    key: 'DEFAULT_CURRENCY',
    fallback: 'COP',
    description: 'Moneda por defecto (ISO 4217)',
  },
  {
    key: 'DEFAULT_TIMEZONE',
    fallback: 'America/Bogota',
    description: 'Zona horaria IANA',
  },
  {
    key: 'DEFAULT_DATE_FORMAT',
    fallback: 'dd/MM/yyyy',
    description: 'Formato de fecha (tokens de Angular DatePipe)',
  },
  {
    key: 'DEFAULT_TIME_FORMAT',
    fallback: 'HH:mm:ss',
    description: 'Formato de hora (tokens de Angular DatePipe)',
  },
  {
    key: 'DEFAULT_DATE_TIME_FORMAT',
    fallback: 'dd/MM/yyyy HH:mm:ss',
    description: 'Formato de fecha y hora (tokens de Angular DatePipe)',
  },
  {
    key: 'DEFAULT_DECIMAL_PLACES',
    fallback: '2',
    description: 'Decimales para formatos numéricos',
  },
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

function buildExample(): string {
  const lines = [
    '# Variables de entorno disponibles en tiempo de build.',
    '# Copiar a `.env` (gitignored) y ajustar. `scripts/generate-env.ts` las inyecta',
    '# en src/environments/*.ts antes de cada build, watch y test.',
    '',
  ];

  for (const variable of VARS) {
    lines.push(`# ${variable.description}`, `${variable.key}=${variable.fallback}`, '');
  }

  return lines.join('\n');
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

fs.writeFileSync(path.join(rootDir, '.env.example'), buildExample(), 'utf-8');

console.log(
  `Generated: ${TARGETS.map((t) => t.file).join(', ')} and .env.example (${VARS.length} vars)`,
);
