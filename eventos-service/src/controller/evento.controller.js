const model = require('../model/evento.model');
const view = require('../view/evento.view');
const { erro, inteiroPositivo, objeto, texto } = require('../http');

function validarEvento(body) {
  objeto(body);
  const nome = texto(body.nome, 'nome', 255);
  const local = texto(body.local, 'local', 255);
  const cidade = texto(body.cidade, 'cidade', 100);
  const capacidade = inteiroPositivo(body.capacidade, 'capacidade', false);
  const preco = typeof body.preco === 'number' || typeof body.preco === 'string'
    ? String(body.preco).trim() : '';
  if (!/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(preco)) {
    throw erro(400, 'preco deve estar entre 0 e 99999999.99, com até duas casas decimais.');
  }
  const valor = body.data_evento;
  const padrao = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
  const partes = typeof valor === 'string' && valor.match(padrao);
  const data = partes && new Date(valor);
  if (!partes || Number.isNaN(data.getTime()) || Number(partes[2]) < 1 || Number(partes[2]) > 12 ||
      Number(partes[3]) < 1 || Number(partes[3]) > new Date(Date.UTC(Number(partes[1]), Number(partes[2]), 0)).getUTCDate()) {
    throw erro(400, 'data_evento deve ser uma data ISO 8601 válida com fuso, como 2026-12-05T20:00:00Z.');
  }
  return { nome, local, cidade, capacidade, preco, data_evento: data };
}

async function listar(req, res) {
  const cidade = req.query.cidade === undefined ? undefined : texto(req.query.cidade, 'cidade', 100);
  let aPartirDe;
  if (req.query.a_partir_de !== undefined) {
    const valor = req.query.a_partir_de;
    const data = typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)
      ? new Date(`${valor}T00:00:00Z`) : new Date(NaN);
    if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor) {
      throw erro(400, 'a_partir_de deve ser uma data válida no formato AAAA-MM-DD.');
    }
    aPartirDe = data;
  }
  const eventos = await model.listar({ cidade, aPartirDe });
  res.json(eventos.map(view.formatar));
}

async function buscar(req, res) {
  const evento = await model.buscar(inteiroPositivo(req.params.id, 'id'));
  if (!evento) throw erro(404, 'Evento não encontrado.');
  res.json(view.formatar(evento));
}

async function criar(req, res) {
  const evento = await model.criar(validarEvento(req.body));
  res.location(`/eventos/${evento.id}`).status(201).json(view.formatar(evento));
}

async function atualizar(req, res) {
  const id = inteiroPositivo(req.params.id, 'id');
  const evento = await model.atualizar(id, validarEvento(req.body));
  if (!evento) {
    if (!await model.buscar(id)) throw erro(404, 'Evento não encontrado.');
    throw erro(400, 'A capacidade não pode ser menor que o número de vagas já consumidas.');
  }
  res.json(view.formatar(evento));
}

async function remover(req, res) {
  if (!await model.remover(inteiroPositivo(req.params.id, 'id'))) {
    throw erro(404, 'Evento não encontrado.');
  }
  res.status(204).end();
}

async function reservar(req, res) {
  const id = inteiroPositivo(req.params.id, 'id');
  const quantidade = inteiroPositivo(objeto(req.body).quantidade, 'quantidade', false);
  const evento = await model.reservar(id, quantidade);
  if (!evento) {
    if (!await model.buscar(id)) throw erro(404, 'Evento não encontrado.');
    throw erro(409, 'Não há vagas suficientes para essa reserva.');
  }
  res.status(201).json(view.formatar(evento));
}

module.exports = { listar, buscar, criar, atualizar, remover, reservar };
