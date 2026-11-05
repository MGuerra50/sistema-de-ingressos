const model = require('../model/ingresso.model');
const view = require('../view/ingresso.view');
const eventos = require('../client/eventos.client');
const participantes = require('../client/participantes.client');
const { erro, inteiroPositivo, objeto } = require('../http');

function valoresDaCompra(preco, quantidade) {
  const [inteira, decimal = ''] = String(preco).split('.');
  const unitario = BigInt(inteira) * 100n + BigInt(decimal.padEnd(2, '0'));
  const total = unitario * BigInt(quantidade);
  if (total > 9999999999n) throw erro(400, 'O valor total da compra excede 99999999.99.');
  const formatar = valor => `${valor / 100n}.${String(valor % 100n).padStart(2, '0')}`;
  return { valor_unitario: formatar(unitario), valor_total: formatar(total) };
}

async function criar(req, res) {
  const body = objeto(req.body);
  const participanteId = inteiroPositivo(body.participante_id, 'participante_id', false);
  const eventoId = inteiroPositivo(body.evento_id, 'evento_id', false);
  const quantidade = inteiroPositivo(body.quantidade, 'quantidade', false);
  const participante = await participantes.buscarParticipante(participanteId);
  if (!participante) throw erro(422, 'Participante não encontrado.');
  const evento = await eventos.buscarEvento(eventoId);
  if (!evento) throw erro(422, 'Evento não encontrado.');
  if (new Date(evento.data_evento).getTime() <= Date.now()) {
    throw erro(422, 'Não é possível comprar ingressos para um evento que já ocorreu.');
  }
  const valores = valoresDaCompra(evento.preco, quantidade);
  if (!await eventos.reservarVagas(eventoId, quantidade)) {
    throw erro(422, 'Evento não encontrado.');
  }
  const ingresso = await model.criar({
    evento_id: eventoId,
    participante_id: participanteId,
    quantidade,
    ...valores
  });
  res.location(`/ingressos/${ingresso.id}`).status(201).json(view.formatar(ingresso));
}

async function listar(req, res) {
  const participanteId = req.query.participante_id === undefined ? undefined
    : inteiroPositivo(req.query.participante_id, 'participante_id');
  const eventoId = req.query.evento_id === undefined ? undefined
    : inteiroPositivo(req.query.evento_id, 'evento_id');
  const ingressos = await model.listar({ participanteId, eventoId });
  res.json(ingressos.map(view.formatar));
}

async function buscar(req, res) {
  const ingresso = await model.buscar(inteiroPositivo(req.params.id, 'id'));
  if (!ingresso) throw erro(404, 'Ingresso não encontrado.');
  const [evento, participante] = await Promise.all([
    eventos.buscarEvento(ingresso.evento_id),
    participantes.buscarParticipante(ingresso.participante_id)
  ]);
  if (!evento || !participante) {
    throw erro(503, 'Os dados associados ao ingresso não estão disponíveis.');
  }
  const origem = process.env.INGRESSOS_URL || `${req.protocol}://${req.get('host')}`;
  res.json(view.detalhar(ingresso, evento, participante, origem));
}

module.exports = { criar, listar, buscar };
