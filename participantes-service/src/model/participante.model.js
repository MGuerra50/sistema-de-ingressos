const db = require('../db');

async function listar(nome) {
  const resultado = nome === undefined
    ? await db.query('SELECT * FROM participantes ORDER BY id')
    : await db.query("SELECT * FROM participantes WHERE nome ILIKE '%' || $1 || '%' ORDER BY id", [nome]);
  return resultado.rows;
}

async function buscar(id) {
  const resultado = await db.query('SELECT * FROM participantes WHERE id = $1', [id]);
  return resultado.rows[0];
}

async function criar({ nome, email, cpf }) {
  const resultado = await db.query(
    'INSERT INTO participantes (nome, email, cpf) VALUES ($1, $2, $3) RETURNING *',
    [nome, email, cpf]
  );
  return resultado.rows[0];
}

async function atualizar(id, { nome, email, cpf }) {
  const resultado = await db.query(
    'UPDATE participantes SET nome = $1, email = $2, cpf = $3 WHERE id = $4 RETURNING *',
    [nome, email, cpf, id]
  );
  return resultado.rows[0];
}

async function remover(id) {
  const resultado = await db.query('DELETE FROM participantes WHERE id = $1 RETURNING id', [id]);
  return resultado.rowCount > 0;
}

module.exports = { listar, buscar, criar, atualizar, remover };
