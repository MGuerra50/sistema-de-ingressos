const db = require('../db');

async function listar({ participanteId, eventoId }) {
  const filtros = [];
  const valores = [];
  if (participanteId !== undefined) {
    valores.push(participanteId);
    filtros.push(`participante_id = $${valores.length}`);
  }
  if (eventoId !== undefined) {
    valores.push(eventoId);
    filtros.push(`evento_id = $${valores.length}`);
  }
  const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const resultado = await db.query(`SELECT * FROM ingressos ${where} ORDER BY id`, valores);
  return resultado.rows;
}

async function buscar(id) {
  const resultado = await db.query('SELECT * FROM ingressos WHERE id = $1', [id]);
  return resultado.rows[0];
}

async function criar({ evento_id, participante_id, quantidade, valor_unitario, valor_total }) {
  const resultado = await db.query(
    `INSERT INTO ingressos (evento_id, participante_id, quantidade, valor_unitario, valor_total)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [evento_id, participante_id, quantidade, valor_unitario, valor_total]
  );
  return resultado.rows[0];
}

module.exports = { listar, buscar, criar };
