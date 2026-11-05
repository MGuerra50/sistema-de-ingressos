BEGIN;

CREATE TABLE participantes (
  id serial PRIMARY KEY,
  nome varchar(255) NOT NULL,
  email varchar(255) NOT NULL UNIQUE,
  cpf varchar(11) NOT NULL UNIQUE,
  criado_em timestamp DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);

INSERT INTO participantes (id, nome, email, cpf)
VALUES
  (1, 'Maria Souza', 'maria@example.com', '12345678901'),
  (2, 'João Silva', 'joao@example.com', '23456789012'),
  (3, 'Ana Oliveira', 'ana@example.com', '34567890123'),
  (4, 'Carlos Santos', 'carlos@example.com', '45678901234'),
  (5, 'Mariana Costa', 'mariana@example.com', '56789012345');

SELECT setval(pg_get_serial_sequence('participantes', 'id'), (SELECT max(id) FROM participantes));

COMMIT;
