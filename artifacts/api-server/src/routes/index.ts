import { Router, type IRouter } from "express";
import backupEmailRouter from "./backupEmail";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(backupEmailRouter);

export default router;
