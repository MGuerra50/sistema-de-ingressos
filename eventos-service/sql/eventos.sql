BEGIN;

CREATE TABLE eventos (
  id serial PRIMARY KEY,
  nome varchar(255) NOT NULL,
  local varchar(255) NOT NULL,
  cidade varchar(100) NOT NULL,
  data_evento timestamp NOT NULL,
  capacidade integer NOT NULL CHECK (capacidade > 0),
  vagas_disponiveis integer NOT NULL CHECK (vagas_disponiveis >= 0 AND vagas_disponiveis <= capacidade),
  preco numeric(10,2) NOT NULL CHECK (preco >= 0)
);

INSERT INTO eventos (id, nome, local, cidade, data_evento, capacidade, vagas_disponiveis, preco)
VALUES
  (1, 'Festival de Jazz', 'Centro Cultural', 'Trindade', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '30 days', 200, 197, 50.00),
  (2, 'Show de Rock', 'Arena Goiânia', 'Goiânia', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '15 days', 3, 1, 80.00),
  (3, 'Teatro de Verão', 'Teatro Municipal', 'Trindade', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '30 days', 100, 100, 30.00),
  (4, 'Mostra de Cinema', 'Cine Cultura', 'Goiânia', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '45 days', 50, 49, 30.00),
  (5, 'Feira de Tecnologia', 'Centro de Convenções', 'Anápolis', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '60 days', 80, 77, 40.00);

SELECT setval(pg_get_serial_sequence('eventos', 'id'), (SELECT max(id) FROM eventos));

COMMIT;
