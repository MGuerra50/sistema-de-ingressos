const model = require('../model/participante.model');
const view = require('../view/participante.view');
const { erro, inteiroPositivo, objeto, texto } = require('../http');

function validarParticipante(body) {
  objeto(body);
  const nome = texto(body.nome, 'nome', 255);
  const email = texto(body.email, 'email', 255).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw erro(400, 'email deve ser um endereço de e-mail válido.');
  }
  const valorCpf = texto(body.cpf, 'cpf', 14);
  if (!/^(\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(valorCpf)) {
    throw erro(400, 'cpf deve conter 11 dígitos, com ou sem pontuação.');
  }
  return { nome, email, cpf: valorCpf.replace(/\D/g, '') };
}

function traduzirUnicidade(falha) {
  if (falha.code === '23505') {
    const campo = falha.constraint === 'participantes_email_key' ? 'E-mail' : 'CPF';
    throw erro(409, `${campo} já cadastrado.`);
  }
  throw falha;
}

async function listar(req, res) {
  const nome = req.query.nome === undefined ? undefined : texto(req.query.nome, 'nome', 255);
  const participantes = await model.listar(nome);
  res.json(participantes.map(view.formatar));
}

async function buscar(req, res) {
  const participante = await model.buscar(inteiroPositivo(req.params.id, 'id'));
  if (!participante) throw erro(404, 'Participante não encontrado.');
  res.json(view.formatar(participante));
}

async function criar(req, res) {
  const dados = validarParticipante(req.body);
  let participante;
  try {
    participante = await model.criar(dados);
  } catch (falha) {
    traduzirUnicidade(falha);
  }
  res.location(`/participantes/${participante.id}`).status(201).json(view.formatar(participante));
}

async function atualizar(req, res) {
  const id = inteiroPositivo(req.params.id, 'id');
  const dados = validarParticipante(req.body);
  let participante;
  try {
    participante = await model.atualizar(id, dados);
  } catch (falha) {
    traduzirUnicidade(falha);
  }
  if (!participante) throw erro(404, 'Participante não encontrado.');
  res.json(view.formatar(participante));
}

async function remover(req, res) {
  if (!await model.remover(inteiroPositivo(req.params.id, 'id'))) {
    throw erro(404, 'Participante não encontrado.');
  }
  res.status(204).end();
}

module.exports = { listar, buscar, criar, atualizar, remover };
