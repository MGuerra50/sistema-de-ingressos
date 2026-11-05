function formatar(ingresso) {
  return {
    id: ingresso.id,
    evento_id: ingresso.evento_id,
    participante_id: ingresso.participante_id,
    quantidade: ingresso.quantidade,
    valor_unitario: Number(ingresso.valor_unitario),
    valor_total: Number(ingresso.valor_total),
    status: ingresso.status,
    criado_em: ingresso.criado_em
  };
}

function detalhar(ingresso, evento, participante, origem) {
  const dados = formatar(ingresso);
  delete dados.evento_id;
  delete dados.participante_id;
  return {
    ...dados,
    evento: { id: evento.id, nome: evento.nome, data_evento: evento.data_evento },
    participante: { id: participante.id, nome: participante.nome },
    links: [
      { rel: 'self', href: `${origem.replace(/\/$/, '')}/ingressos/${ingresso.id}` },
      { rel: 'evento', href: `${process.env.EVENTOS_URL.replace(/\/$/, '')}/eventos/${evento.id}` },
      { rel: 'participante', href: `${process.env.PARTICIPANTES_URL.replace(/\/$/, '')}/participantes/${participante.id}` }
    ]
  };
}

module.exports = { formatar, detalhar };
