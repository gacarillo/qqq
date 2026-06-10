import { Router, Request, Response } from 'express';
import pool from '../db/database';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { stage, status } = req.query;

  try {
    let query = 'SELECT * FROM matches';
    const params: string[] = [];
    const conditions: string[] = [];

    if (stage) {
      params.push(stage as string);
      conditions.push(`stage = $${params.length}`);
    }
    if (status) {
      params.push(status as string);
      conditions.push(`status = $${params.length}`);
    }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY match_date ASC, match_number ASC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/stages', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT stage FROM matches ORDER BY MIN(match_date) ASC',
      []
    );
    // Use subquery approach
    const result2 = await pool.query(
      'SELECT DISTINCT stage FROM matches ORDER BY stage ASC'
    );
    const stages = ['Fase de Grupos', 'Oitavas de Final', 'Quartas de Final', 'Semifinal', 'Terceiro Lugar', 'Final'];
    const available = result2.rows.map((r: { stage: string }) => r.stage);
    res.json(stages.filter(s => available.includes(s)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Admin: update match result
router.put('/:id/result', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { home_score, away_score, status } = req.body;

  try {
    const adminCheck = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user!.userId]);
    if (!adminCheck.rows[0]?.is_admin) {
      res.status(403).json({ error: 'Apenas administradores podem atualizar resultados' });
      return;
    }

    const result = await pool.query(
      'UPDATE matches SET home_score = $1, away_score = $2, status = $3 WHERE id = $4 RETURNING *',
      [home_score, away_score, status || 'finished', id]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: 'Partida não encontrada' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;
