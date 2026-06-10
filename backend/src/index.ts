import app from './app';
import pool from './db/database';

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('Conectado ao PostgreSQL');

    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Erro ao conectar ao banco de dados:', err);
    process.exit(1);
  }
}

start();
