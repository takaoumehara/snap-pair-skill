#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import { getAccessToken } from "./firebaseToken.js";
import { makeFb } from "./firebaseCli.js";
import { enableSnapPairServices } from "./tools/enableServices.js";
import { injectEnvVariables } from "./tools/injectEnv.js";

const fb = makeFb();
const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
const err = (text: string) => ({ isError: true, content: [{ type: "text" as const, text }] });
const loginHint = () =>
  err("Firebase 未ログインです。`firebase login`（必要なら `firebase login --reauth`）を実行後、再試行してください。");

const server = new McpServer({ name: "snap-pair-provisioner", version: "0.1.0" });

server.registerTool(
  "enable_snap_pair_services",
  {
    title: "Enable Anonymous Auth + create RTDB instance",
    description:
      "snap-pair 用に匿名認証を有効化し、デフォルトの Realtime Database インスタンスを作成する（Spark無料枠で動作）。",
    inputSchema: {
      projectId: z.string(),
      databaseId: z.string().optional(),
      location: z.enum(["us-central1", "europe-west1", "asia-southeast1"]).optional(),
    },
  },
  async ({ projectId, databaseId, location }) => {
    try {
      const text = await enableSnapPairServices(
        { projectId, databaseId, location },
        { getToken: getAccessToken }
      );
      return text.includes("✗") ? err(text) : ok(text);
    } catch (e: any) {
      if (e.code === "NOT_LOGGED_IN") return loginHint();
      return err(e.message ?? String(e));
    }
  }
);

server.registerTool(
  "inject_env_variables",
  {
    title: "Extract firebaseConfig and write .env",
    description:
      "Web アプリの SDK config を取得し、React プロジェクトの .env に（既定 VITE_FIREBASE_ プレフィックスで）マージ書き込みする。",
    inputSchema: {
      projectId: z.string(),
      appId: z.string().optional(),
      targetEnvPath: z.string(),
      prefix: z.string().optional(),
    },
  },
  async ({ projectId, appId, targetEnvPath, prefix }) => {
    try {
      const text = await injectEnvVariables(
        { projectId, appId, targetEnvPath, prefix },
        { fb, readFile: (p) => readFile(p, "utf8"), writeFile: (p, c) => writeFile(p, c, "utf8") }
      );
      return ok(text);
    } catch (e: any) {
      if (e.code === "NOT_LOGGED_IN") return loginHint();
      return err(e.message ?? String(e));
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
