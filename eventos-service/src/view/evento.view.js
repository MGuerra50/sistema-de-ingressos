function formatar(evento) {
  return {
    id: evento.id,
    nome: evento.nome,
    local: evento.local,
    cidade: evento.cidade,
    data_evento: evento.data_evento,
    capacidade: evento.capacidade,
    vagas_disponiveis: evento.vagas_disponiveis,
    preco: Number(evento.preco)
  };
}

module.exports = { formatar };
