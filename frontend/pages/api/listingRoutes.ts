import { Router } from "express";
import {
  createListing,
  getListings,
  updateListing,
  deleteListing
} from "../controllers/listingController";
import { requireAuth } from "../middleware/authMiddleware";

const router = Router();

router.post("/", requireAuth, createListing);
router.get("/", getListings);
router.put("/:id", requireAuth, updateListing);
router.delete("/:id", requireAuth, deleteListing);

export default router;
