function erro(status, mensagem) {
  return Object.assign(new Error(mensagem), { status });
}

function inteiroPositivo(valor, campo, permitirTexto = true) {
  if (permitirTexto && typeof valor === 'string' && /^\d+$/.test(valor)) {
    valor = Number(valor);
  }
  if (!Number.isInteger(valor) || valor < 1 || valor > 2147483647) {
    throw erro(400, `${campo} deve ser um inteiro positivo de até 2147483647.`);
  }
  return valor;
}

function objeto(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw erro(400, 'Envie um objeto JSON no corpo da requisição.');
  }
  return valor;
}

function texto(valor, campo, limite) {
  if (typeof valor !== 'string' || !valor.trim() || valor.trim().length > limite) {
    throw erro(400, `${campo} deve conter entre 1 e ${limite} caracteres.`);
  }
  return valor.trim();
}

function tratarErro(falha, req, res, next) {
  if (res.headersSent) return next(falha);
  if (falha.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON inválido.' });
  }
  if (falha.type === 'entity.too.large') {
    return res.status(413).json({ erro: 'O corpo da requisição excede o limite de 32 KB.' });
  }
  if (falha.status >= 400 && falha.status < 600) {
    return res.status(falha.status).json({ erro: falha.message });
  }
  console.error(falha.message);
  return res.status(500).json({ erro: 'Não foi possível concluir a operação.' });
}

module.exports = { erro, inteiroPositivo, objeto, texto, tratarErro };
