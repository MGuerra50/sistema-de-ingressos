const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { readFile, writeFile } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { randomBytes } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { Client } = require('../eventos-service/node_modules/pg');

const raiz = resolve(__dirname, '..');
const servicos = ['eventos', 'participantes', 'ingressos'];
const processos = new Set();
const conexoes = {};
const bancos = {};
const configuracao = {
  host: process.env.TEST_DB_HOST || '127.0.0.1',
  port: Number(process.env.TEST_DB_PORT),
  user: process.env.TEST_DB_USER,
  password: process.env.TEST_DB_PASSWORD || '',
  database: process.env.TEST_DB_NAME || 'postgres',
  connectionTimeoutMillis: 3000,
  options: '-c timezone=UTC'
};

async function iniciar(nome, ambiente = {}) {
  const processo = spawn(process.execPath, ['src/index.js'], {
    cwd: join(raiz, `${nome}-service`),
    env: {
      ...process.env,
      PORT: '0',
      DB_HOST: configuracao.host,
      DB_PORT: String(configuracao.port),
      DB_NAME: bancos[nome],
      DB_USER: configuracao.user,
      DB_PASSWORD: configuracao.password,
      INGRESSOS_URL: '',
      ...ambiente
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  processos.add(processo);
  let saida = '';
  let erros = '';
  processo.stderr.on('data', dados => { erros += dados.toString(); });
  return new Promise((aceitar, rejeitar) => {
    const limite = setTimeout(() => {
      processo.kill();
      rejeitar(new Error(`O serviço ${nome} não iniciou: ${erros}`));
    }, 10000);
    processo.on('error', falha => { clearTimeout(limite); rejeitar(falha); });
    processo.once('exit', codigo => {
      clearTimeout(limite);
      rejeitar(new Error(`O serviço ${nome} terminou com código ${codigo}: ${erros}`));
    });
    processo.stdout.on('data', dados => {
      saida += dados.toString();
      const porta = saida.match(/escutando na porta (\d+)/);
      if (porta) {
        clearTimeout(limite);
        aceitar({ processo, url: `http://127.0.0.1:${porta[1]}`, porta: porta[1] });
      }
    });
  });
}

async function encerrar(servico) {
  const processo = servico.processo || servico;
  if (processo.exitCode !== null || processo.signalCode !== null) return;
  const encerrado = once(processo, 'exit');
  processo.kill();
  await encerrado;
}

async function requisicao(base, caminho, metodo = 'GET', dados) {
  const resposta = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers: dados === undefined ? {} : { 'Content-Type': 'application/json' },
    body: dados === undefined ? undefined : JSON.stringify(dados),
    signal: AbortSignal.timeout(10000)
  });
  const corpo = resposta.status === 204 ? await resposta.text() : await resposta.json();
  if (resposta.status >= 400) assert.equal(typeof corpo.erro, 'string');
  if (resposta.status !== 204) assert.match(resposta.headers.get('content-type'), /application\/json/);
  return { status: resposta.status, corpo, headers: resposta.headers };
}

function dadosEvento(alteracoes = {}) {
  return {
    nome: 'Evento de integração', local: 'Auditório', cidade: 'Trindade',
    data_evento: new Date(Date.now() + 86400000 * 90).toISOString(),
    capacidade: 10, preco: 12.34, ...alteracoes
  };
}

async function medir(base, esperado) {
  const tempos = [];
  for (let i = 0; i < 5; i += 1) {
    const inicio = performance.now();
    const resposta = await requisicao(base, '/ingressos/1');
    assert.equal(resposta.status, esperado);
    tempos.push(Number((performance.now() - inicio).toFixed(2)));
  }
  return { status: esperado, tempos_ms: tempos, media_ms: Number((tempos.reduce((a, b) => a + b) / tempos.length).toFixed(2)) };
}

test('Integração HTTP e PostgreSQL dos três serviços', { timeout: 90000 }, async t => {
  assert.ok(process.env.TEST_DB_PORT && process.env.TEST_DB_USER,
    'Defina TEST_DB_PORT e TEST_DB_USER para uma instância PostgreSQL de teste.');
  const admin = new Client(configuracao);
  const relatorio = { executado_em: new Date().toISOString(), node: process.version, plataforma: process.platform, cenarios: [] };
  let eventos;
  let participantes;
  let ingressos;
  const executar = async (nome, funcao) => {
    await t.test(nome, async () => {
      await funcao();
      relatorio.cenarios.push(nome);
    });
  };

  try {
    await admin.connect();
    relatorio.postgresql = (await admin.query('SHOW server_version')).rows[0].server_version;
    const sufixo = randomBytes(6).toString('hex');
    for (const nome of servicos) {
      bancos[nome] = `${nome}_test_${sufixo}`;
      await admin.query(`CREATE DATABASE ${bancos[nome]}`);
      const cliente = new Client({ ...configuracao, database: bancos[nome] });
      await cliente.connect();
      conexoes[nome] = cliente;
      await cliente.query(await readFile(join(raiz, `${nome}-service`, 'sql', `${nome}.sql`), 'utf8'));
    }
    eventos = await iniciar('eventos');
    participantes = await iniciar('participantes');
    const urls = { EVENTOS_URL: eventos.url, PARTICIPANTES_URL: participantes.url };
    ingressos = await iniciar('ingressos', urls);
    const comprar = (body, base = ingressos.url) => requisicao(base, '/ingressos', 'POST', body);
    const criarEvento = async alteracoes => {
      const resposta = await requisicao(eventos.url, '/eventos', 'POST', dadosEvento(alteracoes));
      assert.equal(resposta.status, 201);
      return resposta.corpo;
    };

    await executar('T01 - dados de exemplo, bancos isolados e saldos coerentes', async () => {
      const vendidos = (await conexoes.ingressos.query('SELECT evento_id, sum(quantidade)::integer AS quantidade FROM ingressos GROUP BY evento_id')).rows;
      const saldos = (await conexoes.eventos.query('SELECT * FROM eventos')).rows;
      assert.equal(saldos.length, 5);
      assert.equal((await conexoes.participantes.query('SELECT * FROM participantes')).rowCount, 5);
      assert.equal((await conexoes.ingressos.query('SELECT * FROM ingressos')).rowCount, 5);
      for (const evento of saldos) {
        const quantidade = vendidos.find(venda => venda.evento_id === evento.id)?.quantidade || 0;
        assert.equal(evento.capacidade - evento.vagas_disponiveis, quantidade);
      }
      for (const nome of servicos) {
        const tabelas = await conexoes[nome].query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
        assert.deepEqual(tabelas.rows.map(linha => linha.tablename), [nome]);
      }
    });

    await executar('T02 - sequências continuam depois dos IDs explícitos', async () => {
      const evento = await criarEvento();
      assert.equal(evento.id, 6);
      const pessoa = await requisicao(participantes.url, '/participantes', 'POST', { nome: 'Pessoa teste', email: 'teste@example.com', cpf: '67890123456' });
      assert.equal(pessoa.status, 201);
      assert.equal(pessoa.corpo.id, 6);
      const ingresso = await comprar({ evento_id: 1, participante_id: 1, quantidade: 1 });
      assert.equal(ingresso.status, 201);
      assert.equal(ingresso.corpo.id, 6);
    });

    await executar('T03 - CRUD de eventos e capacidade preservam reservas', async () => {
      const evento = await criarEvento();
      assert.equal(evento.vagas_disponiveis, 10);
      assert.equal((await requisicao(eventos.url, `/eventos/${evento.id}`)).status, 200);
      assert.equal((await requisicao(eventos.url, `/eventos/${evento.id}/reservas`, 'POST', { quantidade: 3 })).corpo.vagas_disponiveis, 7);
      const recusada = await requisicao(eventos.url, `/eventos/${evento.id}`, 'PUT', dadosEvento({ capacidade: 2 }));
      assert.equal(recusada.status, 400);
      const atualizada = await requisicao(eventos.url, `/eventos/${evento.id}`, 'PUT', dadosEvento({ capacidade: 15 }));
      assert.equal(atualizada.status, 200);
      assert.equal(atualizada.corpo.vagas_disponiveis, 12);
      const removida = await requisicao(eventos.url, `/eventos/${evento.id}`, 'DELETE');
      assert.equal(removida.status, 204);
      assert.equal(removida.corpo, '');
      assert.equal((await requisicao(eventos.url, `/eventos/${evento.id}`)).status, 404);
    });

    await executar('T04 - filtros de eventos por cidade e data', async () => {
      const cidade = await requisicao(eventos.url, '/eventos?cidade=trindade');
      assert.ok(cidade.corpo.length >= 2);
      assert.ok(cidade.corpo.every(evento => evento.cidade === 'Trindade'));
      const hoje = new Date().toISOString().slice(0, 10);
      const futuros = await requisicao(eventos.url, `/eventos?a_partir_de=${hoje}`);
      assert.ok(futuros.corpo.every(evento => evento.id !== 3));
      const ambos = await requisicao(eventos.url, `/eventos?cidade=Trindade&a_partir_de=${hoje}`);
      assert.ok(ambos.corpo.every(evento => evento.cidade === 'Trindade' && evento.id !== 3));
      assert.equal((await requisicao(eventos.url, '/eventos?a_partir_de=2026-02-30')).status, 400);
    });

    await executar('T05 - validação de eventos, preços e datas', async () => {
      for (const dados of [{ nome: '' }, { capacidade: 0 }, { capacidade: 1.5 }, { preco: -1 }, { preco: 0.001 }, { preco: 100000000 }, { data_evento: '2026-02-30T12:00:00Z' }, { data_evento: '2026-12-05T20:00:00' }]) {
        assert.equal((await requisicao(eventos.url, '/eventos', 'POST', dadosEvento(dados))).status, 400);
      }
      const gratuito = await criarEvento({ preco: 0 });
      assert.equal(gratuito.preco, 0);
    });

    await executar('T06 - reservas distinguem validação, ausência e conflito', async () => {
      for (const quantidade of [0, -1, 1.5, '2', null]) {
        assert.equal((await requisicao(eventos.url, '/eventos/2/reservas', 'POST', { quantidade })).status, 400);
      }
      assert.equal((await requisicao(eventos.url, '/eventos/999999/reservas', 'POST', { quantidade: 1 })).status, 404);
      assert.equal((await requisicao(eventos.url, '/eventos/2/reservas', 'POST', { quantidade: 2 })).status, 409);
      assert.equal((await requisicao(eventos.url, '/eventos/2')).corpo.vagas_disponiveis, 1);
    });

    await executar('T07 - CRUD de participantes e máscara em todas as views', async () => {
      const corpo = { nome: 'Pessoa Temporária', email: 'TEMPORARIA@example.com', cpf: '789.012.345-67' };
      const criada = await requisicao(participantes.url, '/participantes', 'POST', corpo);
      assert.equal(criada.status, 201);
      assert.equal(criada.corpo.cpf, '***.012.345-**');
      assert.equal(criada.corpo.email, 'temporaria@example.com');
      const caminho = `/participantes/${criada.corpo.id}`;
      assert.equal((await requisicao(participantes.url, caminho)).corpo.cpf, criada.corpo.cpf);
      const alterada = await requisicao(participantes.url, caminho, 'PUT', { ...corpo, nome: 'Outro Nome' });
      assert.equal(alterada.status, 200);
      assert.equal(alterada.corpo.cpf, criada.corpo.cpf);
      const lista = await requisicao(participantes.url, '/participantes');
      assert.ok(lista.corpo.every(pessoa => /^\*{3}\.\d{3}\.\d{3}-\*{2}$/.test(pessoa.cpf)));
      assert.equal((await requisicao(participantes.url, caminho, 'DELETE')).status, 204);
      assert.equal((await requisicao(participantes.url, caminho)).status, 404);
    });

    await executar('T08 - filtro parcial ILIKE e validação de participantes', async () => {
      const lista = await requisicao(participantes.url, '/participantes?nome=MARIA');
      assert.deepEqual(lista.corpo.map(pessoa => pessoa.id), [1, 5]);
      for (const dados of [{}, { nome: 'A', email: 'invalido', cpf: '12345678901' }, { nome: 'A', email: 'a@example.com', cpf: 'abc12345678901' }]) {
        assert.equal((await requisicao(participantes.url, '/participantes', 'POST', dados)).status, 400);
      }
    });

    await executar('T09 - unicidade de e-mail e CPF em criação e alteração', async () => {
      const pessoa = { nome: 'Duplicação', email: 'MARIA@example.com', cpf: '89012345678' };
      assert.equal((await requisicao(participantes.url, '/participantes', 'POST', pessoa)).status, 409);
      assert.equal((await requisicao(participantes.url, '/participantes', 'POST', { ...pessoa, email: 'nova@example.com', cpf: '12345678901' })).status, 409);
      assert.equal((await requisicao(participantes.url, '/participantes/1', 'PUT', { ...pessoa, email: 'joao@example.com' })).status, 409);
      assert.equal((await requisicao(participantes.url, '/participantes/1', 'PUT', { ...pessoa, cpf: '23456789012' })).status, 409);
      const simultaneas = await Promise.all(['89012345678', '90123456789'].map(cpf => requisicao(participantes.url, '/participantes', 'POST', { nome: 'Concorrente', email: 'concorrente@example.com', cpf })));
      assert.deepEqual(simultaneas.map(resposta => resposta.status).sort(), [201, 409]);
    });

    await executar('T10 - payloads inválidos de compra não alteram dados', async () => {
      const antes = (await requisicao(eventos.url, '/eventos/1')).corpo.vagas_disponiveis;
      const ingressosAntes = (await requisicao(ingressos.url, '/ingressos')).corpo.length;
      for (const body of [undefined, null, [], {}, { participante_id: '1abc', evento_id: 1, quantidade: 1 }, { participante_id: 1, evento_id: 1, quantidade: 0 }, { participante_id: 1, evento_id: 1, quantidade: 1.5 }]) {
        assert.equal((await comprar(body)).status, 400);
      }
      assert.equal((await requisicao(eventos.url, '/eventos/1')).corpo.vagas_disponiveis, antes);
      assert.equal((await requisicao(ingressos.url, '/ingressos')).corpo.length, ingressosAntes);
    });

    await executar('T11 - participantes e eventos inexistentes geram 422', async () => {
      assert.equal((await comprar({ participante_id: 999999, evento_id: 1, quantidade: 1 })).status, 422);
      assert.equal((await comprar({ participante_id: 1, evento_id: 999999, quantidade: 1 })).status, 422);
    });

    await executar('T12 - evento passado gera 422 sem consumir vagas', async () => {
      assert.equal((await comprar({ participante_id: 1, evento_id: 3, quantidade: 1 })).status, 422);
      assert.equal((await requisicao(eventos.url, '/eventos/3')).corpo.vagas_disponiveis, 100);
    });

    await executar('T13 - vagas insuficientes geram 409 sem criar ingresso', async () => {
      const antes = (await requisicao(ingressos.url, '/ingressos')).corpo.length;
      assert.equal((await comprar({ participante_id: 1, evento_id: 2, quantidade: 2 })).status, 409);
      assert.equal((await requisicao(ingressos.url, '/ingressos')).corpo.length, antes);
    });

    await executar('T14 - compra válida calcula centavos e preserva preço histórico', async () => {
      const evento = await criarEvento({ preco: 0.10 });
      const compra = await comprar({ participante_id: 1, evento_id: evento.id, quantidade: 3 });
      assert.equal(compra.status, 201);
      assert.equal(compra.corpo.valor_unitario, 0.10);
      assert.equal(compra.corpo.valor_total, 0.30);
      assert.equal(compra.corpo.status, 'CONFIRMADO');
      assert.equal(compra.headers.get('location'), `/ingressos/${compra.corpo.id}`);
      assert.equal((await requisicao(eventos.url, `/eventos/${evento.id}`)).corpo.vagas_disponiveis, 7);
      await requisicao(eventos.url, `/eventos/${evento.id}`, 'PUT', dadosEvento({ preco: 0.20 }));
      assert.equal((await requisicao(ingressos.url, `/ingressos/${compra.corpo.id}`)).corpo.valor_unitario, 0.10);
    });

    await executar('T15 - duas compras disputam a última vaga', async () => {
      const evento = await criarEvento({ capacidade: 1 });
      const respostas = await Promise.all([1, 2].map(() => comprar({ participante_id: 1, evento_id: evento.id, quantidade: 1 })));
      assert.deepEqual(respostas.map(resposta => resposta.status).sort(), [201, 409]);
      assert.equal((await requisicao(eventos.url, `/eventos/${evento.id}`)).corpo.vagas_disponiveis, 0);
      assert.equal((await requisicao(ingressos.url, `/ingressos?evento_id=${evento.id}`)).corpo.length, 1);
    });

    await executar('T16 - trinta compras simultâneas respeitam dez vagas', async () => {
      const evento = await criarEvento({ capacidade: 10 });
      const respostas = await Promise.all(Array.from({ length: 30 }, () => comprar({ participante_id: 1, evento_id: evento.id, quantidade: 1 })));
      assert.equal(respostas.filter(resposta => resposta.status === 201).length, 10);
      assert.equal(respostas.filter(resposta => resposta.status === 409).length, 20);
      assert.equal((await requisicao(eventos.url, `/eventos/${evento.id}`)).corpo.vagas_disponiveis, 0);
      assert.equal((await requisicao(ingressos.url, `/ingressos?evento_id=${evento.id}`)).corpo.length, 10);
    });

    await executar('T17 - filtros isolados e combinados de ingressos', async () => {
      for (const [query, verificar] of [
        ['participante_id=1', ingresso => ingresso.participante_id === 1],
        ['evento_id=1', ingresso => ingresso.evento_id === 1],
        ['participante_id=1&evento_id=1', ingresso => ingresso.participante_id === 1 && ingresso.evento_id === 1]
      ]) {
        const resposta = await requisicao(ingressos.url, `/ingressos?${query}`);
        assert.equal(resposta.status, 200);
        assert.ok(resposta.corpo.length > 0);
        assert.ok(resposta.corpo.every(verificar));
      }
      assert.deepEqual((await requisicao(ingressos.url, '/ingressos?participante_id=999999')).corpo, []);
    });

    await executar('T18 - detalhe compõe dados atuais e links dos três serviços', async () => {
      await conexoes.eventos.query('UPDATE eventos SET nome = $1 WHERE id = 1', ['Nome atualizado']);
      await conexoes.participantes.query('UPDATE participantes SET nome = $1 WHERE id = 1', ['Maria Atualizada']);
      const detalhe = await requisicao(ingressos.url, '/ingressos/1');
      assert.equal(detalhe.status, 200);
      assert.equal(detalhe.corpo.evento.nome, 'Nome atualizado');
      assert.equal(detalhe.corpo.participante.nome, 'Maria Atualizada');
      assert.equal(detalhe.corpo.valor_unitario, 50);
      assert.equal(detalhe.corpo.participante.cpf, undefined);
      assert.deepEqual(detalhe.corpo.links.map(link => link.rel), ['self', 'evento', 'participante']);
      for (const link of detalhe.corpo.links) assert.equal((await fetch(link.href)).status, 200);
    });

    await executar('T19 - IDs, filtros e recursos inexistentes usam 400 e 404', async () => {
      for (const [base, recurso] of [[eventos.url, 'eventos'], [participantes.url, 'participantes'], [ingressos.url, 'ingressos']]) {
        for (const id of ['1abc', '0', '2147483648']) assert.equal((await requisicao(base, `/${recurso}/${id}`)).status, 400);
        assert.equal((await requisicao(base, `/${recurso}/999999`)).status, 404);
        assert.equal((await requisicao(base, '/inexistente')).status, 404);
      }
      assert.equal((await requisicao(eventos.url, '/eventos/999999', 'PUT', dadosEvento())).status, 404);
      assert.equal((await requisicao(eventos.url, '/eventos/999999', 'DELETE')).status, 404);
      assert.equal((await requisicao(participantes.url, '/participantes/999999', 'PUT', { nome: 'Ausente', email: 'ausente@example.com', cpf: '01234567890' })).status, 404);
      assert.equal((await requisicao(participantes.url, '/participantes/999999', 'DELETE')).status, 404);
      assert.equal((await requisicao(ingressos.url, '/ingressos?evento_id=1&evento_id=2')).status, 400);
    });

    await executar('T20 - Eventos desligado gera 503 e tem tempo de resposta medido', async () => {
      relatorio.detalhe_normal = await medir(ingressos.url, 200);
      const porta = eventos.porta;
      await encerrar(eventos);
      try {
        relatorio.detalhe_eventos_desligado = await medir(ingressos.url, 503);
        assert.equal((await comprar({ participante_id: 1, evento_id: 1, quantidade: 1 })).status, 503);
        assert.equal((await requisicao(ingressos.url, '/ingressos')).status, 200);
        assert.equal((await requisicao(ingressos.url, '/ingressos/999999')).status, 404);
        assert.equal((await requisicao(participantes.url, '/participantes')).status, 200);
      } finally {
        eventos = await iniciar('eventos', { PORT: porta });
      }
    });

    await executar('T21 - Participantes desligado afeta somente operações dependentes', async () => {
      const porta = participantes.porta;
      await encerrar(participantes);
      try {
        assert.equal((await comprar({ participante_id: 1, evento_id: 1, quantidade: 1 })).status, 503);
        assert.equal((await requisicao(ingressos.url, '/ingressos/1')).status, 503);
        assert.equal((await requisicao(ingressos.url, '/ingressos')).status, 200);
        assert.equal((await requisicao(eventos.url, '/eventos')).status, 200);
      } finally {
        participantes = await iniciar('participantes', { PORT: porta });
      }
    });

    await executar('T22 - respostas 5xx, JSON inválido e contrato remoto inválido geram 503', async () => {
      let modo = '5xx';
      const servidor = createServer((req, res) => {
        if (modo === '5xx') { res.writeHead(500).end(); return; }
        res.setHeader('Content-Type', 'application/json');
        res.end(modo === 'json' ? '{invalido' : '{}');
      });
      await new Promise(aceitar => servidor.listen(0, '127.0.0.1', aceitar));
      let outro;
      try {
        outro = await iniciar('ingressos', { ...urls, EVENTOS_URL: `http://127.0.0.1:${servidor.address().port}` });
        for (const estado of ['5xx', 'json', 'contrato']) {
          modo = estado;
          assert.equal((await comprar({ participante_id: 1, evento_id: 1, quantidade: 1 }, outro.url)).status, 503);
        }
      } finally {
        if (outro) await encerrar(outro);
        servidor.closeAllConnections();
        await new Promise(aceitar => servidor.close(aceitar));
      }
    });

    await executar('T23 - timeout limita espera antes e durante a leitura do JSON', async () => {
      let cabecalho = false;
      const servidor = createServer((req, res) => {
        if (cabecalho) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.write('{"id":');
        }
      });
      await new Promise(aceitar => servidor.listen(0, '127.0.0.1', aceitar));
      let outro;
      try {
        outro = await iniciar('ingressos', { ...urls, EVENTOS_URL: `http://127.0.0.1:${servidor.address().port}`, HTTP_TIMEOUT_MS: '2000' });
        relatorio.timeout_ms = [];
        for (const parcial of [false, true]) {
          cabecalho = parcial;
          const inicio = performance.now();
          assert.equal((await comprar({ participante_id: 1, evento_id: 1, quantidade: 1 }, outro.url)).status, 503);
          const duracao = performance.now() - inicio;
          assert.ok(duracao >= 1800 && duracao < 5000, `Tempo observado: ${duracao} ms`);
          relatorio.timeout_ms.push(Number(duracao.toFixed(2)));
        }
      } finally {
        if (outro) await encerrar(outro);
        servidor.closeAllConnections();
        await new Promise(aceitar => servidor.close(aceitar));
      }
    });

    await executar('T24 - falha local após reserva evidencia a inconsistência documentada', async () => {
      const evento = await criarEvento({ capacidade: 2 });
      await conexoes.ingressos.query("CREATE FUNCTION rejeitar_ingresso() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Falha de teste'; END; $$");
      await conexoes.ingressos.query('CREATE TRIGGER rejeitar_ingresso BEFORE INSERT ON ingressos FOR EACH ROW EXECUTE FUNCTION rejeitar_ingresso()');
      try {
        assert.equal((await comprar({ participante_id: 1, evento_id: evento.id, quantidade: 1 })).status, 500);
        assert.equal((await requisicao(eventos.url, `/eventos/${evento.id}`)).corpo.vagas_disponiveis, 1);
        assert.equal((await requisicao(ingressos.url, `/ingressos?evento_id=${evento.id}`)).corpo.length, 0);
      } finally {
        await conexoes.ingressos.query('DROP TRIGGER rejeitar_ingresso ON ingressos');
        await conexoes.ingressos.query('DROP FUNCTION rejeitar_ingresso()');
      }
    });

    await executar('T25 - total monetário excedente é rejeitado antes da reserva', async () => {
      const evento = await criarEvento({ preco: 99999999.99, capacidade: 2 });
      assert.equal((await comprar({ participante_id: 1, evento_id: evento.id, quantidade: 2 })).status, 400);
      assert.equal((await requisicao(eventos.url, `/eventos/${evento.id}`)).corpo.vagas_disponiveis, 2);
    });

    await executar('T26 - exclusão remota mantém ingresso e explica dado associado indisponível', async () => {
      const evento = await criarEvento({ capacidade: 1 });
      const ingresso = await comprar({ participante_id: 1, evento_id: evento.id, quantidade: 1 });
      assert.equal(ingresso.status, 201);
      assert.equal((await requisicao(eventos.url, `/eventos/${evento.id}`, 'DELETE')).status, 204);
      assert.equal((await requisicao(ingressos.url, `/ingressos/${ingresso.corpo.id}`)).status, 503);
      assert.equal((await requisicao(ingressos.url, `/ingressos?evento_id=${evento.id}`)).corpo.length, 1);
    });

    await executar('T27 - JSON inválido e corpos excessivos têm respostas JSON padronizadas', async () => {
      for (const [base, caminho] of [[eventos.url, '/eventos'], [participantes.url, '/participantes'], [ingressos.url, '/ingressos']]) {
        const resposta = await fetch(`${base}${caminho}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalido' });
        assert.equal(resposta.status, 400);
        assert.equal(typeof (await resposta.json()).erro, 'string');
        const grande = await requisicao(base, caminho, 'POST', { texto: 'a'.repeat(40000) });
        assert.equal(grande.status, 413);
      }
    });

    relatorio.quantidade_cenarios_aprovados = relatorio.cenarios.length;
    relatorio.total_cenarios = 27;
    relatorio.sucesso = relatorio.cenarios.length === 27;
    await writeFile(join(__dirname, 'resultado-integracao.json'), `${JSON.stringify(relatorio, null, 2)}\n`);
  } finally {
    await Promise.all([...processos].map(encerrar));
    await Promise.all(Object.values(conexoes).map(cliente => cliente.end()));
    for (const banco of Object.values(bancos)) {
      await admin.query(`DROP DATABASE IF EXISTS ${banco} WITH (FORCE)`);
    }
    await admin.end();
  }
});
