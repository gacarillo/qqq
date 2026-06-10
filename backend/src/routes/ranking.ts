import { Router, Request, Response } from 'express';
import pool from '../db/database';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { group_id } = req.query;

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

    const result = await pool.query(
      `SELECT
        u.id as user_id,
        u.name as user_name,
        COALESCE(SUM(p.points), 0) as total_points,
        COUNT(CASE WHEN p.points = 3 THEN 1 END) as exact_scores,
        COUNT(CASE WHEN p.points = 2 THEN 1 END) as correct_draws,
        COUNT(CASE WHEN p.points = 1 THEN 1 END) as correct_winners,
        COUNT(CASE WHEN p.points IS NOT NULL THEN 1 END) as scored_predictions,
        COUNT(p.id) as total_predictions
      FROM group_members gm
      JOIN users u ON u.id = gm.user_id
      LEFT JOIN predictions p ON p.user_id = u.id AND p.group_id = $1
      WHERE gm.group_id = $1
      GROUP BY u.id, u.name
      ORDER BY total_points DESC, exact_scores DESC, correct_draws DESC, u.name ASC`,
      [group_id]
    );

    const ranking = result.rows.map((row, index) => ({
      ...row,
      position: index + 1,
      total_points: parseInt(row.total_points),
      exact_scores: parseInt(row.exact_scores),
      correct_draws: parseInt(row.correct_draws),
      correct_winners: parseInt(row.correct_winners),
      scored_predictions: parseInt(row.scored_predictions),
      total_predictions: parseInt(row.total_predictions),
    }));

    res.json(ranking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;
