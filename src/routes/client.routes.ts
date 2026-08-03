import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  res.json({ success: true, clients: [] });
});

router.post('/', async (req: Request, res: Response) => {
  const { name } = req.body;
  res.status(201).json({ success: true, name });
});

export default router;