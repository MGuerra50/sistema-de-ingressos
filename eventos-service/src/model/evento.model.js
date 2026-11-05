const db = require('../db');

async function listar({ cidade, aPartirDe }) {
  const valores = [];
  const filtros = [];
  if (cidade !== undefined) {
    valores.push(cidade);
    filtros.push(`lower(cidade) = lower($${valores.length})`);
  }
  if (aPartirDe !== undefined) {
    valores.push(aPartirDe);
    filtros.push(`data_evento >= $${valores.length}::timestamp`);
  }
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const resultado = await db.query(`SELECT * FROM eventos ${where} ORDER BY id`, valores);
  return resultado.rows;
}

async function buscar(id) {
  const resultado = await db.query('SELECT * FROM eventos WHERE id = $1', [id]);
  return resultado.rows[0];
}

async function criar(evento) {
  const { nome, local, cidade, data_evento, capacidade, preco } = evento;
  const resultado = await db.query(
    `INSERT INTO eventos (nome, local, cidade, data_evento, capacidade, vagas_disponiveis, preco)
     VALUES ($1, $2, $3, $4, $5, $5, $6) RETURNING *`,
    [nome, local, cidade, data_evento, capacidade, preco]
  );
  return resultado.rows[0];
}

async function atualizar(id, evento) {
  const { nome, local, cidade, data_evento, capacidade, preco } = evento;
  const resultado = await db.query(
    `UPDATE eventos
     SET nome = $1, local = $2, cidade = $3, data_evento = $4,
         capacidade = $5, vagas_disponiveis = $5 - (capacidade - vagas_disponiveis), preco = $6
     WHERE id = $7 AND $5 >= capacidade - vagas_disponiveis
     RETURNING *`,
    [nome, local, cidade, data_evento, capacidade, preco, id]
  );
  return resultado.rows[0];
}

async function remover(id) {
  const resultado = await db.query('DELETE FROM eventos WHERE id = $1 RETURNING id', [id]);
  return resultado.rowCount > 0;
}

async function reservar(id, quantidade) {
  const resultado = await db.query(
    `UPDATE eventos SET vagas_disponiveis = vagas_disponiveis - $1
     WHERE id = $2 AND vagas_disponiveis >= $1 RETURNING *`,
    [quantidade, id]
  );
  return resultado.rows[0];
}

module.exports = { listar, buscar, criar, atualizar, remover, reservar };
