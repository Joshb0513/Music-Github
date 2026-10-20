import { Router } from 'express';
import { nameLogin, nameLogout, nameUser } from '../lib/nameAuth';
const router = Router();
router.get('/auth/user', nameUser);
router.post('/login', nameLogin);
router.post('/logout', nameLogout);
export default router;
