function formatar(participante) {
  return {
    id: participante.id,
    nome: participante.nome,
    email: participante.email,
    cpf: `***.${participante.cpf.slice(3, 6)}.${participante.cpf.slice(6, 9)}-**`,
    criado_em: participante.criado_em
  };
}

module.exports = { formatar };
