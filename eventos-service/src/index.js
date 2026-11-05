process.env.TZ = 'UTC';

const express = require('express');
const db = require('./db');
const controller = require('./controller/evento.controller');
const { tratarErro } = require('./http');

const app = express();
app.disable('x-powered-by');
app.set('query parser', 'simple');
app.use(express.json({ limit: '32kb' }));
app.get('/eventos', controller.listar);
app.get('/eventos/:id', controller.buscar);
app.post('/eventos', controller.criar);
app.put('/eventos/:id', controller.atualizar);
app.delete('/eventos/:id', controller.remover);
app.post('/eventos/:id/reservas', controller.reservar);
app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
app.use(tratarErro);

async function iniciar() {
  await db.query('SELECT 1');
  const servidor = app.listen(Number(process.env.PORT || 3001), () => {
    console.log(`Eventos escutando na porta ${servidor.address().port}`);
  });
  servidor.on('error', falha => {
    console.error(falha.message);
    db.end().finally(() => { process.exitCode = 1; });
  });
  for (const sinal of ['SIGINT', 'SIGTERM']) {
    process.once(sinal, () => {
      servidor.close(() => db.end().finally(() => { process.exitCode = 0; }));
      servidor.closeIdleConnections();
    });
  }
}

if (require.main === module) {
  iniciar().catch(falha => {
    console.error(falha.message);
    db.end().finally(() => { process.exitCode = 1; });
  });
}

module.exports = app;
