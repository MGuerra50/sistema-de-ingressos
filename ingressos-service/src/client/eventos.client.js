const { erro } = require('../http');
const { endereco, requisitar } = require('./http.client');

const base = endereco('EVENTOS_URL');

function validarEvento(dados, id) {
  if (!dados || dados.id !== id || typeof dados.nome !== 'string' ||
      typeof dados.data_evento !== 'string' || Number.isNaN(Date.parse(dados.data_evento)) ||
      !['number', 'string'].includes(typeof dados.preco) ||
      !/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(String(dados.preco))) {
    throw erro(503, 'Resposta inválida do Serviço de Eventos.');
  }
  return dados;
}

async function buscarEvento(id) {
  const resposta = await requisitar(base, `/eventos/${id}`, 'Eventos');
  if (resposta.status === 404) return null;
  if (resposta.status !== 200) throw erro(503, 'Resposta inesperada do Serviço de Eventos.');
  return validarEvento(resposta.dados, id);
}

async function reservarVagas(id, quantidade) {
  const resposta = await requisitar(base, `/eventos/${id}/reservas`, 'Eventos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantidade })
  });
  if (resposta.status === 404) return null;
  if (resposta.status === 409) throw erro(409, 'Não há vagas suficientes para essa compra.');
  if (resposta.status !== 201) throw erro(503, 'Resposta inesperada do Serviço de Eventos.');
  return validarEvento(resposta.dados, id);
}

module.exports = { buscarEvento, reservarVagas };
