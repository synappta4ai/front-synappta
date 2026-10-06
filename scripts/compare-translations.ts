import * as fs from 'fs';
import * as path from 'path';

interface TranslationFile {
  [key: string]: string | TranslationFile;
}

interface TranslationSet {
  [lang: string]: Record<string, string>;
}

interface DiffResult {
  missing: string[];
  extra: string[];
  empty: string[];
}

function flattenObject(obj: TranslationFile, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};

  for (const key in obj) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (typeof value === 'object' && value !== null) {
      Object.assign(result, flattenObject(value as TranslationFile, newKey));
    } else {
      result[newKey] = value as string;
    }
  }

  return result;
}

function loadTranslations(dir: string): TranslationSet {
  const translations: TranslationSet = {};
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

  for (const file of files) {
    const lang = file.replace('.json', '');
    const content = fs.readFileSync(path.join(dir, file), 'utf-8');
    const parsed = JSON.parse(content) as TranslationFile;
    translations[lang] = flattenObject(parsed);
  }

  return translations;
}

function compareTranslations(translations: TranslationSet): DiffResult {
  const languages = Object.keys(translations);
  const baseLang = languages[0];
  const baseKeys = new Set(Object.keys(translations[baseLang]));
  const missing: string[] = [];
  const extra: string[] = [];
  const empty: string[] = [];

  for (let i = 1; i < languages.length; i++) {
    const lang = languages[i];
    const langKeys = new Set(Object.keys(translations[lang]));

    for (const key of baseKeys) {
      if (!langKeys.has(key)) {
        missing.push(key);
      }
    }

    for (const key of langKeys) {
      if (!baseKeys.has(key)) {
        extra.push(key);
      }
      const value = translations[lang][key];
      if (!value || value.trim() === '') {
        empty.push(key);
      }
    }
  }

  return { missing, extra, empty };
}

function exportDiff(translations: TranslationSet, outputPath: string): void {
  const languages = Object.keys(translations);
  const baseLang = languages[0];
  const baseKeys = Object.keys(translations[baseLang]);
  const content: string[] = ['Key,EN,ES,Status'];

  for (const key of baseKeys.sort()) {
    const en = translations[baseLang]?.[key] || '';
    const es = translations[languages[1]]?.[key] || '';
    const status = !es ? 'MISSING' : es.trim() === '' ? 'EMPTY' : 'OK';
    content.push(`"${key}","${en.replace(/"/g, '""')}","${es.replace(/"/g, '""')}","${status}"`);
  }

  fs.writeFileSync(outputPath, content.join('\n'), 'utf-8');
  console.log(`📄 Exported to: ${outputPath}`);
}

function printDiff(translations: TranslationSet): void {
  const languages = Object.keys(translations);
  const baseLang = languages[0];
  const baseKeys = Object.keys(translations[baseLang]);
  const diff = compareTranslations(translations);

  console.log(`\n📁 Base language: ${baseLang.toUpperCase()}`);
  console.log('─'.repeat(50));

  for (let i = 1; i < languages.length; i++) {
    const lang = languages[i];
    const langKeys = Object.keys(translations[lang]);
    const emptyKeys = langKeys.filter((k) => !translations[lang][k]?.trim());

    console.log(`\n🌐 Language: ${lang.toUpperCase()}`);
    console.log(`   Total keys: ${langKeys.length} (base: ${baseKeys.length})`);

    if (diff.missing.length > 0) {
      console.log(`\n   ❌ Missing keys (${diff.missing.length}):`);
      diff.missing.slice(0, 20).forEach((key) => console.log(`      - ${key}`));
      if (diff.missing.length > 20) {
        console.log(`      ... and ${diff.missing.length - 20} more`);
      }
    }

    if (diff.extra.length > 0) {
      console.log(`\n   ⚠️  Extra keys (${diff.extra.length}):`);
      diff.extra.forEach((key) => console.log(`      + ${key}`));
    }

    if (emptyKeys.length > 0) {
      console.log(`\n   ⚠️  Empty values (${emptyKeys.length}):`);
      emptyKeys.slice(0, 10).forEach((key) => console.log(`      ~ ${key}`));
      if (emptyKeys.length > 10) {
        console.log(`      ... and ${emptyKeys.length - 10} more`);
      }
    }

    if (diff.missing.length === 0 && diff.extra.length === 0 && emptyKeys.length === 0) {
      console.log('   ✅ All keys match!');
    }
  }

  console.log('\n' + '─'.repeat(50));
}

const args = process.argv.slice(2);
const i18nDir = path.join(__dirname, '../public/assets/i18n');
const baseLang = 'en.json';

if (!fs.existsSync(i18nDir)) {
  console.error('❌ i18n directory not found:', i18nDir);
  process.exit(1);
}

console.log('🔍 Comparing translation files...\n');
const translations = loadTranslations(i18nDir);
printDiff(translations);

const exportIdx = args.indexOf('--export');
if (exportIdx !== -1 && args[exportIdx + 1]) {
  exportDiff(translations, args[exportIdx + 1]);
}