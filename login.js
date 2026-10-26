const fs = require('fs');
const path = require('path');

// 1) Leer .env.e2e y extraer variables
function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const vars = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    const urlMatch = val.match(/^@url:`([^`]+)`$/);
    if (urlMatch) val = urlMatch[1];
    vars[m[1]] = val;
  }
  return vars;
}

async function main() {
  const vars = parseEnvFile('/opt/data/front-synappta/.env.e2e');
  const { E2E_USER, E2E_PASSWORD, E2E_API_BASE } = vars;
  console.log('E2E_USER     :', E2E_USER);
  console.log('E2E_PASSWORD :', E2E_PASSWORD);
  console.log('E2E_API_BASE :', E2E_API_BASE);

  const base = E2E_API_BASE.replace(/^@url:`([^`]+)`$/, '$1');
  const url = base + '/auth/login-tenant';

  const payload = JSON.stringify({
    username: E2E_USER,
    password: E2E_PASSWORD,
    tenant_id: 1,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });

  const text = await response.text();
  let body = text;
  try { body = JSON.parse(text); } catch (_) {}

  console.log('STATUS:', response.status);
  console.log('--- RESPUESTA ---');
  console.log(JSON.stringify(body, null, 2));
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
