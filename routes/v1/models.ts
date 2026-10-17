/**
 * GET /v1/models — OpenAI 兼容模型列表（仅返回对外统一模型名）
 */
import { defineHandler } from "void";
import type { Env } from "../../src/types";
import { errorResponse } from "../../src/errors";
import { listPublicModels } from "../../src/router";
import { json } from "../../src/settings";

export const GET = defineHandler(async (c) => {
  try {
    const models = await listPublicModels((c.env as unknown as Env).DB);
    return json({ object: "list", data: models });
  } catch (err) {
    return errorResponse(c, err);
  }
});
