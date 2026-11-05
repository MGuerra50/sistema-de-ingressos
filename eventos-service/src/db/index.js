const { Pool } = require('pg');

for (const nome of ['DB_HOST', 'DB_NAME']) {
  if (!process.env[nome]) throw new Error(`Defina ${nome} no ambiente.`);
}

function credencial(nome) {
  const valor = process.env[nome];
  const referencia = valor?.match(/^\$\{([A-Z_][A-Z0-9_]*)\}$/);
  if (!referencia) return valor;
  const conteudo = process.env[referencia[1]];
  if (conteudo === undefined) {
    throw new Error(`Defina ${referencia[1]} no ambiente do sistema.`);
  }
  return conteudo;
}

const usuario = credencial('DB_USER');
const senha = credencial('DB_PASSWORD');
if (!usuario) throw new Error('Defina DB_USER ou a variável de ambiente referenciada por ele.');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: usuario,
  password: senha || '',
  options: '-c timezone=UTC',
  connectionTimeoutMillis: 2000,
  max: 10
});

pool.on('error', falha => console.error(falha.message));

module.exports = pool;
