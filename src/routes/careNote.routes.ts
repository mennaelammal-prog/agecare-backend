import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  res.json({ success: true, careNotes: [] });
});

router.post('/', async (req: Request, res: Response) => {
  const { content } = req.body;
  res.status(201).json({ success: true, content });
});

export default router;