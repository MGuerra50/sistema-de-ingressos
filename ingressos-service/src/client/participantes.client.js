const { erro } = require('../http');
const { endereco, requisitar } = require('./http.client');

const base = endereco('PARTICIPANTES_URL');

async function buscarParticipante(id) {
  const resposta = await requisitar(base, `/participantes/${id}`, 'Participantes');
  if (resposta.status === 404) return null;
  if (resposta.status !== 200 || !resposta.dados || resposta.dados.id !== id ||
      typeof resposta.dados.nome !== 'string') {
    throw erro(503, 'Resposta inválida do Serviço de Participantes.');
  }
  return resposta.dados;
}

module.exports = { buscarParticipante };
