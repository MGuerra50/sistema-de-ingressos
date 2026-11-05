process.env.TZ = 'UTC';

const express = require('express');
const db = require('./db');
const controller = require('./controller/ingresso.controller');
const { tratarErro } = require('./http');

const app = express();
app.disable('x-powered-by');
app.set('query parser', 'simple');
app.use(express.json({ limit: '32kb' }));
app.post('/ingressos', controller.criar);
app.get('/ingressos', controller.listar);
app.get('/ingressos/:id', controller.buscar);
app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
app.use(tratarErro);

async function iniciar() {
  await db.query('SELECT 1');
  const servidor = app.listen(Number(process.env.PORT || 3003), () => {
    console.log(`Ingressos escutando na porta ${servidor.address().port}`);
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
