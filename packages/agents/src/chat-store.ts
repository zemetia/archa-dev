import { existsSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { ChatMessage } from '@archa/protocol';
import { paths, docPaths, readJson, readJsonl, writeJsonAtomic, listDir } from '@archa/protocol/node';
import { assetFile, decodeDataUrl, storeBytes } from '@archa/protocol/node';

/*
 * Chat history (blueprint AGENT_BRIDGE/03 → Chat History). Every conversation is one JSON file in the
 * document's data folder — `<name>-data/chats/<threadId>.json` — and pasted images sit beside it in
 * `chats/attachments/<threadId>/` (their `asset:chats/…` references resolve against the data folder). Nothing of a chat goes into the `.archa`; opening a document loads
 * its conversations from this folder. Before 0.4.1 history lived in ARCHA_HOME/chats/<docId>.jsonl;
 * that file is split into thread files on first load and renamed `.migrated`.
 */

export type ChatThreadFile = {
  version: 1;
  threadId: string;
  agent: string;
  persona?: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
};

const safeName = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'thread';
/** On read only `messages` matters; a file without a message list is skipped. */
const threadFileSchema = z.object({ messages: z.array(z.custom<ChatMessage>()) });
export const threadOfMessage = (m: ChatMessage) => m.threadId ?? m.runId;
const IMAGE_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

export class ChatStore {
  private cache = new Map<string, ChatMessage[]>();

  /** dataDirOf: the document's data folder — resolved on every write, so a Save As moves future writes along. */
  constructor(private dataDirOf: (docId: string) => string, private legacyDir = paths.legacyChatsDir) {}

  chatsDir(docId: string): string {
    return docPaths(this.dataDirOf(docId)).chats();
  }

  /** Every message of the document's conversations, oldest first. */
  list(docId: string): ChatMessage[] {
    let list = this.cache.get(docId);
    if (list) return list;
    this.migrateLegacy(docId);
    list = [];
    const dir = this.chatsDir(docId);
    for (const f of listDir(dir, (n) => n.endsWith('.json'))) {
      // A torn file loses one conversation, never the rest. A thread file belongs to this folder, whatever document id wrote it.
      const t = readJson(join(dir, f), threadFileSchema, null);
      if (t) list.push(...t.messages.map((m) => ({ ...m, docId })));
    }
    list.sort((a, b) => a.ts - b.ts);
    this.cache.set(docId, list);
    return list;
  }

  /** Adds a message, or replaces the one with the same id (a tool row whose result arrived). */
  append(docId: string, m: ChatMessage): void {
    const list = this.list(docId);
    const i = list.findIndex((x) => x.id === m.id);
    if (i >= 0) list[i] = m; else list.push(m);
    this.writeThread(docId, threadOfMessage(m));
  }

  deleteThread(docId: string, threadId: string): void {
    const kept = this.list(docId).filter((m) => threadOfMessage(m) !== threadId);
    this.cache.set(docId, kept);
    const d = docPaths(this.dataDirOf(docId));
    rmSync(d.chatThread(threadId), { force: true });
    rmSync(d.attachments(threadId), { recursive: true, force: true });
  }

  /** Forget the cached messages (a document closed, or its folder changed underneath). */
  forget(docId: string): void {
    this.cache.delete(docId);
  }

  /** Writes a pasted image into the thread's attachments: the `asset:` reference and the absolute file. */
  saveImage(docId: string, threadId: string, mime: string, base64OrDataUrl: string): { ref: string; file: string } | null {
    const decoded = base64OrDataUrl.startsWith('data:') ? decodeDataUrl(base64OrDataUrl) : { mime, bytes: Buffer.from(base64OrDataUrl, 'base64') };
    const ext = decoded && IMAGE_EXT[decoded.mime];
    if (!decoded || !ext) return null;
    const dataDir = this.dataDirOf(docId);
    const ref = storeBytes(dataDir, decoded.bytes, ext, docPaths(dataDir).attachmentsRef(threadId));
    return { ref, file: assetFile(dataDir, ref)! };
  }

  private writeThread(docId: string, threadId: string): void {
    const messages = this.list(docId).filter((m) => threadOfMessage(m) === threadId);
    if (!messages.length) return;
    const first = messages[0]!;
    const file: ChatThreadFile = {
      version: 1, threadId, agent: first.agent, persona: messages.find((m) => m.persona)?.persona,
      createdAt: first.ts, updatedAt: messages.at(-1)!.ts, messages,
    };
    try {
      writeJsonAtomic(docPaths(this.dataDirOf(docId)).chatThread(threadId), file, { newline: true });
    } catch { /* history is best-effort; the live chat still works */ }
  }

  private migrateLegacy(docId: string): void {
    const legacy = join(this.legacyDir(), `${safeName(docId)}.jsonl`);
    if (!existsSync(legacy)) return;
    const byThread = new Map<string, ChatMessage[]>();
    for (const m of readJsonl(legacy) as ChatMessage[]) {
      try {
        const t = threadOfMessage(m);
        // Old history kept thumbnails as base64; they become attachment files like new ones.
        if (m.images?.length) m.images = m.images.map((src) => (src.startsWith('data:') ? this.saveImage(docId, t, '', src)?.ref ?? src : src));
        // A tool row written again once its result arrived: the later line replaces it.
        const rows = byThread.get(t) ?? [];
        const at = rows.findIndex((x) => x.id === m.id);
        if (at >= 0) rows[at] = m; else rows.push(m);
        byThread.set(t, rows);
      } catch { /* skip a line whose images cannot be saved */ }
    }
    const all = [...byThread.values()].flat().sort((a, b) => a.ts - b.ts);
    this.cache.set(docId, all);
    for (const t of byThread.keys()) this.writeThread(docId, t);
    this.cache.delete(docId);
    try { renameSync(legacy, `${legacy}.migrated`); } catch { /* migrated again next time; writes are idempotent */ }
  }
}
