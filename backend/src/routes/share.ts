import { Router } from 'express';
const router = Router();
router.get('/:token', (req, res) => res.json({}));
export default router;
