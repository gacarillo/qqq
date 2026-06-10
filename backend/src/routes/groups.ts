import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db/database';
import { authenticate } from '../middleware/auth';

const router = Router();

function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// List user's groups
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT g.*, u.name as owner_name,
        (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as member_count
       FROM groups g
       JOIN users u ON g.owner_id = u.id
       JOIN group_members gm2 ON gm2.group_id = g.id AND gm2.user_id = $1
       ORDER BY g.created_at DESC`,
      [req.user!.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Create group
router.post('/',
  authenticate,
  body('name').trim().isLength({ min: 2, max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { name, description } = req.body;
    const userId = req.user!.userId;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let code: string;
      let attempts = 0;
      do {
        code = generateCode();
        const exists = await client.query('SELECT id FROM groups WHERE code = $1', [code]);
        if (!exists.rows.length) break;
        attempts++;
      } while (attempts < 10);

      const groupResult = await client.query(
        'INSERT INTO groups (id, name, code, owner_id, description) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [uuidv4(), name, code!, userId, description || null]
      );
      const group = groupResult.rows[0];

      await client.query(
        'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
        [group.id, userId]
      );

      await client.query('COMMIT');
      res.status(201).json({ ...group, member_count: 1 });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      res.status(500).json({ error: 'Erro interno do servidor' });
    } finally {
      client.release();
    }
  }
);

// Join group by code
router.post('/join',
  authenticate,
  body('code').trim().isLength({ min: 6, max: 6 }),
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { code } = req.body;
    const userId = req.user!.userId;

    try {
      const groupResult = await pool.query('SELECT * FROM groups WHERE code = $1', [code.toUpperCase()]);
      const group = groupResult.rows[0];

      if (!group) {
        res.status(404).json({ error: 'Bolão não encontrado com esse código' });
        return;
      }

      const alreadyMember = await pool.query(
        'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
        [group.id, userId]
      );

      if (alreadyMember.rows.length > 0) {
        res.status(409).json({ error: 'Você já faz parte deste bolão' });
        return;
      }

      await pool.query(
        'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
        [group.id, userId]
      );

      const countResult = await pool.query(
        'SELECT COUNT(*) as member_count FROM group_members WHERE group_id = $1',
        [group.id]
      );

      res.json({ ...group, member_count: parseInt(countResult.rows[0].member_count) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
);

// Get group details
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.userId;

  try {
    const memberCheck = await pool.query(
      'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
      [id, userId]
    );
    if (!memberCheck.rows.length) {
      res.status(403).json({ error: 'Você não faz parte deste bolão' });
      return;
    }

    const groupResult = await pool.query(
      `SELECT g.*, u.name as owner_name FROM groups g JOIN users u ON g.owner_id = u.id WHERE g.id = $1`,
      [id]
    );
    if (!groupResult.rows[0]) {
      res.status(404).json({ error: 'Bolão não encontrado' });
      return;
    }

    const membersResult = await pool.query(
      `SELECT u.id, u.name, u.email, gm.joined_at FROM group_members gm
       JOIN users u ON u.id = gm.user_id WHERE gm.group_id = $1 ORDER BY gm.joined_at ASC`,
      [id]
    );

    res.json({ ...groupResult.rows[0], members: membersResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Leave group
router.delete('/:id/leave', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const userId = req.user!.userId;

  try {
    const group = await pool.query('SELECT * FROM groups WHERE id = $1', [id]);
    if (!group.rows[0]) {
      res.status(404).json({ error: 'Bolão não encontrado' });
      return;
    }
    if (group.rows[0].owner_id === userId) {
      res.status(400).json({ error: 'O criador não pode sair do bolão. Delete o bolão se desejar.' });
      return;
    }

    await pool.query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [id, userId]);
    res.json({ message: 'Você saiu do bolão' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;
