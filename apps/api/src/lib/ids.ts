import { uuidv7 } from "uuidv7";

/** UUID v7: único e ordenável por tempo (doc 01 §5). */
export const novoId = () => uuidv7();
