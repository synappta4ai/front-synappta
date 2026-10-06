import * as fs from 'fs';
import * as path from 'path';

interface TranslationFile {
  [key: string]: string | TranslationFile;
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

function unflattenObject(flat: Record<string, string>): TranslationFile {
  const result: TranslationFile = {};

  for (const key in flat) {
    const keys = key.split('.');
    let current: TranslationFile = result;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]] as TranslationFile;
    }

    current[keys[keys.length - 1]] = flat[key];
  }

  return result;
}

function syncTranslations(dir: string): void {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const translations: Record<string, Record<string, string>> = {};

  for (const file of files) {
    const lang = file.replace('.json', '');
    const content = fs.readFileSync(path.join(dir, file), 'utf-8');
    const parsed = JSON.parse(content) as TranslationFile;
    translations[lang] = flattenObject(parsed);
  }

  const languages = Object.keys(translations);
  console.log(`\n🌐 Languages: ${languages.join(', ').toUpperCase()}\n`);

  for (let i = 0; i < languages.length; i++) {
    const lang = languages[i];
    const otherLangs = languages.filter((_, idx) => idx !== i);
    const currentKeys = new Set(Object.keys(translations[lang]));
    let added = 0;

    for (const otherLang of otherLangs) {
      const otherKeys = new Set(Object.keys(translations[otherLang]));

      for (const key of otherKeys) {
        if (!currentKeys.has(key)) {
          translations[lang][key] = translations[otherLang][key];
          added++;
          console.log(`  [+${lang}] ${key} <- ${translations[otherLang][key]}`);
        }
      }
    }

    if (added > 0) {
      const outputPath = path.join(dir, `${lang}.json`);
      const unflattened = unflattenObject(translations[lang]);
      fs.writeFileSync(outputPath, JSON.stringify(unflattened, null, 2), 'utf-8');
      console.log(`\n✅ Synced ${added} keys for ${lang.toUpperCase()}\n`);
    } else {
      console.log(`  ✅ No changes for ${lang.toUpperCase()}`);
    }
  }

  console.log('─'.repeat(50));
}

const i18nDir = path.join(__dirname, '../public/assets/i18n');

if (!fs.existsSync(i18nDir)) {
  console.error('❌ i18n directory not found:', i18nDir);
  process.exit(1);
}

console.log('🔄 Syncing translation files...\n');
syncTranslations(i18nDir);