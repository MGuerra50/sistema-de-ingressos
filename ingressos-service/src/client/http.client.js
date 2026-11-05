const { erro } = require('../http');

const timeout = Number(process.env.HTTP_TIMEOUT_MS || 2000);
if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60000) {
  throw new Error('HTTP_TIMEOUT_MS deve estar entre 1 e 60000.');
}

function endereco(nome) {
  const valor = process.env[nome];
  let url;
  try {
    url = new URL(valor);
  } catch {
    throw new Error(`Defina uma URL válida em ${nome}.`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash) {
    throw new Error(`${nome} deve ser uma URL HTTP ou HTTPS sem query ou fragmento.`);
  }
  return url.href.replace(/\/$/, '');
}

async function requisitar(base, caminho, servico, opcoes = {}) {
  try {
    const resposta = await fetch(`${base}${caminho}`, {
      ...opcoes,
      signal: AbortSignal.timeout(timeout),
      headers: { Accept: 'application/json', ...opcoes.headers }
    });
    if (resposta.status === 404 || resposta.status === 409) {
      await resposta.body?.cancel();
      return { status: resposta.status };
    }
    if (!resposta.ok) {
      await resposta.body?.cancel();
      throw new Error(`HTTP ${resposta.status}`);
    }
    return { status: resposta.status, dados: await resposta.json() };
  } catch (falha) {
    const motivo = falha.name === 'TimeoutError' ? 'Tempo limite excedido' : 'Serviço indisponível';
    throw erro(503, `${motivo}: ${servico}.`);
  }
}

module.exports = { endereco, requisitar };
