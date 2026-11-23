import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChatMessage } from '@archa/protocol';
import { archaHome } from '@archa/protocol/node';
import { assetFile, decodeDataUrl, storeBytes } from './assets';

/*
 * Chat history (blueprint AGENT_BRIDGE/03 → Chat History). Every conversation is one JSON file in the
 * document's asset folder — `<name>-asset/chats/<threadId>.json` — and pasted images sit beside it in
 * `chats/attachments/<threadId>/`. Nothing of a chat goes into the `.archa`; opening a document loads
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
export const threadOfMessage = (m: ChatMessage) => m.threadId ?? m.runId;
const IMAGE_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

export class ChatStore {
  private cache = new Map<string, ChatMessage[]>();

  /** assetDirOf: the document's asset folder — resolved on every write, so a Save As moves future writes along. */
  constructor(private assetDirOf: (docId: string) => string, private legacyDir = () => join(archaHome(), 'chats')) {}

  chatsDir(docId: string): string {
    return join(this.assetDirOf(docId), 'chats');
  }

  /** Every message of the document's conversations, oldest first. */
  list(docId: string): ChatMessage[] {
    let list = this.cache.get(docId);
    if (list) return list;
    this.migrateLegacy(docId);
    list = [];
    const dir = this.chatsDir(docId);
    if (existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.json')) continue;
        try {
          const t = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Partial<ChatThreadFile>;
          // A thread file belongs to this folder, whatever document id wrote it.
          if (Array.isArray(t.messages)) list.push(...t.messages.map((m) => ({ ...m, docId })));
        } catch { /* a torn file loses one conversation, never the rest */ }
      }
    }
    list.sort((a, b) => a.ts - b.ts);
    this.cache.set(docId, list);
    return list;
  }

  append(docId: string, m: ChatMessage): void {
    this.list(docId).push(m);
    this.writeThread(docId, threadOfMessage(m));
  }

  deleteThread(docId: string, threadId: string): void {
    const kept = this.list(docId).filter((m) => threadOfMessage(m) !== threadId);
    this.cache.set(docId, kept);
    const dir = this.chatsDir(docId);
    rmSync(join(dir, `${safeName(threadId)}.json`), { force: true });
    rmSync(join(dir, 'attachments', safeName(threadId)), { recursive: true, force: true });
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
    const assetDir = this.assetDirOf(docId);
    const ref = storeBytes(assetDir, decoded.bytes, ext, `chats/attachments/${safeName(threadId)}`);
    return { ref, file: assetFile(assetDir, ref)! };
  }

  private writeThread(docId: string, threadId: string): void {
    const messages = this.list(docId).filter((m) => threadOfMessage(m) === threadId);
    if (!messages.length) return;
    const first = messages[0]!;
    const file: ChatThreadFile = {
      version: 1, threadId, agent: first.agent, persona: messages.find((m) => m.persona)?.persona,
      createdAt: first.ts, updatedAt: messages.at(-1)!.ts, messages,
    };
    const dir = this.chatsDir(docId);
    try {
      mkdirSync(dir, { recursive: true });
      const path = join(dir, `${safeName(threadId)}.json`);
      writeFileSync(`${path}.tmp`, `${JSON.stringify(file, null, 2)}\n`);
      renameSync(`${path}.tmp`, path);
    } catch { /* history is best-effort; the live chat still works */ }
  }

  private migrateLegacy(docId: string): void {
    const legacy = join(this.legacyDir(), `${safeName(docId)}.jsonl`);
    if (!existsSync(legacy)) return;
    const byThread = new Map<string, ChatMessage[]>();
    for (const line of readFileSync(legacy, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const m = JSON.parse(line) as ChatMessage;
        const t = threadOfMessage(m);
        // Old history kept thumbnails as base64; they become attachment files like new ones.
        if (m.images?.length) m.images = m.images.map((src) => (src.startsWith('data:') ? this.saveImage(docId, t, '', src)?.ref ?? src : src));
        byThread.set(t, [...(byThread.get(t) ?? []), m]);
      } catch { /* skip a torn line */ }
    }
    const all = [...byThread.values()].flat().sort((a, b) => a.ts - b.ts);
    this.cache.set(docId, all);
    for (const t of byThread.keys()) this.writeThread(docId, t);
    this.cache.delete(docId);
    try { renameSync(legacy, `${legacy}.migrated`); } catch { /* migrated again next time; writes are idempotent */ }
  }
}
