import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import pool from '../db/database';
import { authenticate } from '../middleware/auth';

const router = Router();

// Get predictions for a group + optional match filter
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { group_id, match_id } = req.query;

  if (!group_id) {
    res.status(400).json({ error: 'group_id é obrigatório' });
    return;
  }

  const userId = req.user!.userId;

  try {
    const memberCheck = await pool.query(
      'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
      [group_id, userId]
    );
    if (!memberCheck.rows.length) {
      res.status(403).json({ error: 'Você não faz parte deste bolão' });
      return;
    }

    let query = `
      SELECT p.*, u.name as user_name, m.home_team, m.away_team,
             m.home_score as match_home_score, m.away_score as match_away_score,
             m.status as match_status, m.match_date
      FROM predictions p
      JOIN users u ON u.id = p.user_id
      JOIN matches m ON m.id = p.match_id
      WHERE p.group_id = $1
    `;
    const params: string[] = [group_id as string];

    if (match_id) {
      params.push(match_id as string);
      query += ` AND p.match_id = $${params.length}`;
    }

    query += ' ORDER BY m.match_date ASC, u.name ASC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Get my predictions for a group
router.get('/mine', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { group_id } = req.query;
  const userId = req.user!.userId;

  if (!group_id) {
    res.status(400).json({ error: 'group_id é obrigatório' });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT p.*, m.home_team, m.away_team, m.home_team_flag, m.away_team_flag,
              m.match_date, m.stage, m.group_name, m.venue, m.city,
              m.home_score as match_home_score, m.away_score as match_away_score,
              m.status as match_status, m.match_number
       FROM predictions p
       JOIN matches m ON m.id = p.match_id
       WHERE p.user_id = $1 AND p.group_id = $2
       ORDER BY m.match_date ASC`,
      [userId, group_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Upsert prediction
router.post('/',
  authenticate,
  body('match_id').isUUID(),
  body('group_id').isUUID(),
  body('home_score').isInt({ min: 0, max: 30 }),
  body('away_score').isInt({ min: 0, max: 30 }),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { match_id, group_id, home_score, away_score } = req.body;
    const userId = req.user!.userId;

    try {
      // Check membership
      const memberCheck = await pool.query(
        'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
        [group_id, userId]
      );
      if (!memberCheck.rows.length) {
        res.status(403).json({ error: 'Você não faz parte deste bolão' });
        return;
      }

      // Check if match hasn't started yet
      const matchResult = await pool.query('SELECT * FROM matches WHERE id = $1', [match_id]);
      const match = matchResult.rows[0];
      if (!match) {
        res.status(404).json({ error: 'Partida não encontrada' });
        return;
      }
      if (match.status !== 'scheduled') {
        res.status(400).json({ error: 'Não é possível alterar palpites de partidas já iniciadas' });
        return;
      }
      if (new Date(match.match_date) <= new Date()) {
        res.status(400).json({ error: 'O prazo para palpites desta partida já encerrou' });
        return;
      }

      const result = await pool.query(
        `INSERT INTO predictions (user_id, match_id, group_id, home_score, away_score)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, match_id, group_id)
         DO UPDATE SET home_score = $4, away_score = $5, updated_at = NOW()
         RETURNING *`,
        [userId, match_id, group_id, home_score, away_score]
      );

      res.status(200).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
);

export default router;
