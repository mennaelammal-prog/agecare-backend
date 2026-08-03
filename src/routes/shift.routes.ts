import { Router, Request, Response } from 'express';
import { createShift, getShifts } from '../modules/shifts/shifts.service';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const shifts = await getShifts();
  res.json({ success: true, shifts });
});

router.post('/', async (req: Request, res: Response) => {
  const shift = await createShift(req.body);
  res.status(201).json({ success: true, shift });
});

export default router;