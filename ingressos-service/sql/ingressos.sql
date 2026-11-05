BEGIN;

CREATE TABLE ingressos (
  id serial PRIMARY KEY,
  evento_id integer NOT NULL,
  participante_id integer NOT NULL,
  quantidade integer NOT NULL CHECK (quantidade > 0),
  valor_unitario numeric(10,2) NOT NULL CHECK (valor_unitario >= 0),
  valor_total numeric(10,2) NOT NULL CHECK (valor_total >= 0 AND valor_total = quantidade * valor_unitario),
  status varchar(20) NOT NULL DEFAULT 'CONFIRMADO',
  criado_em timestamp DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);

CREATE INDEX ingressos_participante_idx ON ingressos (participante_id);
CREATE INDEX ingressos_evento_idx ON ingressos (evento_id);

INSERT INTO ingressos (id, evento_id, participante_id, quantidade, valor_unitario, valor_total)
VALUES
  (1, 1, 1, 2, 50.00, 100.00),
  (2, 2, 2, 2, 80.00, 160.00),
  (3, 4, 3, 1, 30.00, 30.00),
  (4, 5, 4, 3, 40.00, 120.00),
  (5, 1, 5, 1, 50.00, 50.00);

SELECT setval(pg_get_serial_sequence('ingressos', 'id'), (SELECT max(id) FROM ingressos));

COMMIT;
