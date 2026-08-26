import { z } from "zod";

export const globalSearchQuerySchema = z.string().trim().min(2).max(100);
