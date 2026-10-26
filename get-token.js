const fs = require('fs');

function parseEnv(filePath) {
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
  const vars = parseEnv('/opt/data/front-synappta/.env.e2e');
  const base = vars.E2E_API_BASE.replace(/^@url:`([^`]+)`$/, '$1');
  const url = base + '/auth/login-tenant';
  const payload = JSON.stringify({
    username: vars.E2E_USER,
    password: vars.E2E_PASSWORD,
    tenant_id: 1,
  });
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch (_) { body = { raw: text }; }
  const token = body.data?.token || '';
  // Guardar token en archivo seguro (solo el token, sin secretos)
  fs.writeFileSync('/tmp/synapta-jwt.txt', token);
  console.log('STATUS:', response.status);
  console.log('TOKEN_SAVED: true');
  console.log('TOKEN_LENGTH:', token.length);
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
