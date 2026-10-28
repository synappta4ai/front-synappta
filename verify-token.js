const fs = require('fs');

// Leer el token completo del archivo
const token = fs.readFileSync('/tmp/synapta-jwt.txt', 'utf8').trim();
console.log('TOKEN_LENGTH:', token.length);
console.log('TOKEN_STARTS_WITH:', token.substring(0, 10));
console.log('TOKEN_ENDS_WITH:', token.substring(token.length - 10));

// Guardar el token en un archivo entre 423 caracteres exactos
fs.writeFileSync('/tmp/synapta-jwt-full.txt', token);

console.log('TOKEN_SAVED_TO_FILE: true');
