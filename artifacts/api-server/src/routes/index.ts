import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./githubAuth";
import storageRouter from "./storage";
import musicRouter from "./music";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(storageRouter);
router.use(musicRouter);

export default router;
