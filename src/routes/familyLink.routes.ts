import { Router, Request, Response } from 'express';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  res.json({ success: true, message: 'Family link feature placeholder' });
});

export default router;