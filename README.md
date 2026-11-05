# Sistema de Venda de Ingressos com Microserviços

## Preparação e criação dos bancos
É necessário ter Node.js 22 ou superior, npm e PostgreSQL instalados. O PostgreSQL deve estar em execução. Os comandos abaixo são para PowerShell e devem ser executados a partir da pasta projeto-ingressos, um por vez.

Defina o caminho dos executáveis do PostgreSQL, ajustando a versão e a pasta caso sua instalação seja diferente:
$pgBin = 'C:\Program Files\PostgreSQL\17\bin'

Crie os três bancos, informando a senha do usuário postgres quando solicitado:
- & "$pgBin\createdb.exe" -h 127.0.0.1 -p 5432 -U postgres -W eventos_db
- & "$pgBin\createdb.exe" -h 127.0.0.1 -p 5432 -U postgres -W participantes_db
- & "$pgBin\createdb.exe" -h 127.0.0.1 -p 5432 -U postgres -W ingressos_db

Execute o script correspondente em cada banco novo:
- & "$pgBin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -W -d eventos_db -v ON_ERROR_STOP=1 -f eventos-service/sql/eventos.sql
- & "$pgBin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -W -d participantes_db -v ON_ERROR_STOP=1 -f participantes-service/sql/participantes.sql
- & "$pgBin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -W -d ingressos_db -v ON_ERROR_STOP=1 -f ingressos-service/sql/ingressos.sql

Essa preparação é feita uma vez. Os scripts criam as tabelas, inserem os dados de exemplo e ajustam as sequências dos IDs. Se os bancos e as tabelas já estiverem preparados, siga para a configuração do ambiente. Cada serviço utiliza exclusivamente seu próprio banco.

## Configuração obrigatória dos arquivos .env
É necessário criar um arquivo .env na raiz de cada serviço, na mesma pasta do respectivo package.json:
- projeto-ingressos/eventos-service/.env
- projeto-ingressos/participantes-service/.env
- projeto-ingressos/ingressos-service/.env

Os arquivos .env.example já estão corretos para a configuração local padrão do projeto. Uma opção é fazer uma cópia de cada .env.example na mesma pasta e apagar apenas .example do nome da cópia, deixando o nome .env. Mantenha os arquivos .env.example originais para a entrega.

É obrigatório configurar as duas variáveis de ambiente do sistema referentes ao banco de dados PostgreSQL:
- USUARIO__BANCO: usuário utilizado na conexão com o PostgreSQL.
- SENHA__BANCO: senha desse usuário no PostgreSQL.

Os arquivos de exemplo já possuem DB_USER=${USUARIO__BANCO} e DB_PASSWORD=${SENHA__BANCO}. O código de conexão lê os valores dessas variáveis do ambiente do sistema. Depois de criá-las ou alterá-las no Windows, feche e abra novamente o IDE para que os terminais e os serviços recebam os valores atualizados.
A configuração padrão usa PostgreSQL em 127.0.0.1 na porta 5432 e os bancos eventos_db, participantes_db e ingressos_db. Ajuste host e porta nos .env somente se sua instalação usar outros valores.

## Instalação e execução dos serviços
Na pasta projeto-ingressos, instale as dependências de cada serviço:
- npm --prefix eventos-service ci
- npm --prefix participantes-service ci
- npm --prefix ingressos-service ci

Abra três terminais na pasta projeto-ingressos e execute um dos comandos abaixo em cada terminal:
- npm --prefix eventos-service run dev
- npm --prefix participantes-service run dev
- npm --prefix ingressos-service run dev

Mantenha os três processos em execução. Os endereços para consulta são:
- Eventos: http://localhost:3001/eventos
- Participantes: http://localhost:3002/participantes
- Ingressos: http://localhost:3003/ingressos

Para encerrar um serviço, pressione Ctrl+C no terminal correspondente.

## Questão 1 - Encapsulamento, interface e proxy
O encapsulamento aparece na separação dos serviços e de seus bancos. Cada serviço mantém seus dados e suas consultas SQL nos próprios models, como eventos-service/src/model/evento.model.js. Os outros serviços acessam seus recursos pela API, sem conhecer sua implementação interna.
As interfaces são os contratos REST, como GET /participantes/:id e POST /eventos/:id/reservas. Elas definem as operações disponíveis, os dados recebidos e as respostas.
Os módulos ingressos-service/src/client/eventos.client.js e participantes.client.js funcionam como proxies. O controller chama funções locais, como buscarEvento, reservarVagas e buscarParticipante, enquanto os clients encapsulam as chamadas HTTP, a leitura do JSON e o tratamento de falhas.
Um client stub de gRPC/RMI também representa operações remotas localmente, mas está associado ao contrato e ao mecanismo de invocação e serialização do respectivo sistema RPC. No gRPC, normalmente é gerado a partir de um contrato protobuf. Neste projeto, os clients são escritos manualmente e utilizam HTTP/JSON.

## Questão 2 - Ausência de chaves estrangeiras e cópia do preço
A tabela ingressos guarda evento_id e participante_id como referências externas porque cada serviço possui seu próprio banco. Não há chave estrangeira entre esses bancos, e a existência dos recursos é verificada pelas APIs durante a compra.
Essa separação permite que os serviços evoluam e sejam implantados de forma independente. Em contrapartida, não há integridade referencial global garantida pelo banco: a exclusão de um evento ou participante pode deixar uma referência órfã. Além disso, a validação por HTTP não impede alterações nos recursos entre as etapas da compra.
O preço é copiado para valor_unitario para preservar o valor da venda. Se o ingresso dependesse sempre do preço atual do evento, uma alteração posterior poderia mudar a interpretação de uma compra antiga. O valor_total registra a quantidade multiplicada pelo preço praticado na compra.

## Questão 3 - Falha na gravação após a reserva
Se a reserva for confirmada em Eventos e o INSERT do ingresso falhar, o evento ficará com menos vagas disponíveis, mas sem o ingresso correspondente no banco de Ingressos. Uma transação local em ingressos_db não desfaz uma alteração já confirmada em eventos_db.
Uma solução possível é uma saga com compensação: a reserva recebe uma identificação e, se a gravação do ingresso falhar, uma operação de compensação devolve as vagas. Essa compensação precisa ser idempotente, permitindo tentativas repetidas sem devolver vagas duas vezes, e deve ter acompanhamento para tratar falhas de rede e operações pendentes.
Essa solução é uma proposta, conforme solicitado pelo enunciado. A implementação atual não realiza a compensação. O teste T24 confirma a inconsistência ao provocar uma falha na gravação depois da reserva.

## Questão 4 - Coreografia e orquestração
Na orquestração implementada, o Serviço de Ingressos controla a sequência: consulta o participante, consulta o evento, solicita a reserva e grava o ingresso. Isso facilita acompanhar o fluxo, controlar a ordem das operações e traduzir os erros para o cliente. A desvantagem é concentrar a coordenação e depender dos serviços remotos durante a compra.
Com coreografia, a compra poderia publicar um evento de solicitação iniciada. Participantes reagiria validando o comprador, Eventos reagiria ao resultado reservando as vagas e Ingressos reagiria à reserva confirmada registrando a venda. Rejeições e falhas também gerariam eventos, inclusive para compensação.
A coreografia reduz a dependência de um coordenador central e permite processamento assíncrono e novos consumidores. Porém, exige infraestrutura de mensagens, correlação das operações e tratamento de duplicação e ordem de entrega. Também torna o fluxo completo mais difícil de rastrear. Para o cenário do trabalho, a orquestração oferece um fluxo direto e corresponde à arquitetura exigida.

## Questão 5 - Níveis do modelo de Richardson
Eventos e Participantes estão no nível 2: utilizam recursos identificados por URIs, verbos HTTP com finalidades diferentes e status adequados. Por exemplo, GET /eventos/1 consulta um recurso, POST /participantes cria um participante e DELETE /participantes/:id retorna 204 quando a exclusão é concluída.
Ingressos também utiliza recursos, verbos e status. Além disso, GET /ingressos/:id apresenta os links self, evento e participante, permitindo descobrir os recursos relacionados a partir da resposta. Essa representação demonstra o comportamento HATEOAS que o enunciado classifica como nível 3. A demonstração está no detalhe do ingresso, sem pressupor navegação hipermídia completa em todas as operações.

## Questão 6 - Tolerância a falhas, performance e implantabilidade
Na execução registrada em testes/resultado-integracao.json, em 05/11/2026, com Windows, Node.js 22.12.0 e PostgreSQL 17.2, foram feitas cinco requisições a GET /ingressos/1 com os serviços disponíveis e cinco após desligar Eventos.
- Eventos disponível: 8,85; 10,22; 8,58; 8,70; 5,96 ms. Média de 8,46 ms, com status 200.
- Eventos desligado: 6,37; 5,76; 4,90; 5,53; 5,94 ms. Média de 5,70 ms, com status 503.
- Dependência sem resposta: os testes de timeout levaram 2113,99 ms e 2024,51 ms, com status 503, respectivamente antes dos cabeçalhos e durante a leitura do corpo.
Com Eventos desligado, a compra e o detalhe de um ingresso existente retornaram 503, enquanto GET /ingressos e as operações independentes de Participantes continuaram disponíveis. Isso mostra que separar os processos permite manter algumas funcionalidades, mas não elimina as dependências necessárias para concluir outras operações.
Na avaliação de performance, as chamadas de rede e a composição de dados acrescentam latência. O detalhe consulta Evento e Participante em paralelo, enquanto a compra mantém a sequência de orquestração. O erro com Eventos desligado foi rápido porque a conexão foi recusada; quando a dependência aceita a conexão e não responde, o serviço aguarda o timeout de aproximadamente dois segundos. As medições são locais e não representam tempos garantidos em produção.
Quanto à implantabilidade, cada serviço pode ser implantado separadamente porque possui processo, configuração e banco próprios. Ainda é necessário manter compatibilidade entre os contratos REST e configurar corretamente URLs, portas e credenciais. A independência de implantação não elimina a coordenação de mudanças nas interfaces.