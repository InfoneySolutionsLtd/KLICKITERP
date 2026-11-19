import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import type { Redis } from "ioredis";
import { Observable, Subscriber } from "rxjs";
import { REDIS_CLIENT } from "../../../shared/cache/redis.provider";

/** What an open bell receives. Only a hint to ask the server again: nothing about the notification itself travels here. */
export interface NotificationStreamEvent {
  type: "hello" | "ping" | "heartbeat";
  data: Record<string, never>;
}

export const NOTIFICATION_CHANNEL = "ntf:inbox";
/** A bell tab is one stream; a handful of tabs is normal, a hundred is something wrong. The oldest is closed past this. */
export const MAX_STREAMS_PER_USER = 5;
/** Sent so a proxy does not close a quiet connection as idle. */
export const HEARTBEAT_MS = 25_000;
/** Shorter than the access token's 15-minute life: the client reconnects with a fresh token, so a signed-out session cannot keep listening. */
export const STREAM_MAX_AGE_MS = 14 * 60_000;
/** A notification written inside a transaction becomes visible when it commits; the hint waits a moment so the refetch sees it. */
export const PUBLISH_DELAY_MS = 750;

/**
 * Tells open bells "something new arrived, ask again" (FR-COMM-001's live updates; IR-031).
 *
 * Every API process keeps ONE Redis subscription (opened with the first stream, closed with the last) and fans a message out
 * to the streams of that user that are open on THIS process. A notification created by the worker, or by another API
 * instance, still reaches the user because the hint goes through Redis. The stream is only a hint: the bell's normal polling
 * keeps running, so a missed hint (a dropped connection, a restart) delays an update by up to a minute, never loses one.
 */
@Injectable()
export class NotificationBusService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationBusService.name);
  private subscriber: Redis | null = null;
  private readonly streams = new Map<string, Set<Subscriber<NotificationStreamEvent>>>();

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Hints the given users' open bells, after a short delay (see `PUBLISH_DELAY_MS`). Never throws and never keeps the process alive. */
  publishSoon(userIds: string[], delayMs: number = PUBLISH_DELAY_MS): void {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return;
    const timer = setTimeout(() => void this.publish(unique), delayMs);
    timer.unref?.();
  }

  async publish(userIds: string[]): Promise<void> {
    for (const userId of new Set(userIds)) {
      try {
        await this.redis.publish(NOTIFICATION_CHANNEL, userId);
      } catch (error) {
        this.logger.warn(`Could not hint ${userId}'s bell: ${(error as Error).message}`);
      }
    }
  }

  /** A stream for one user's bell: `hello` at once, `heartbeat`s while quiet, `ping` when something arrived, closed after `maxAgeMs`. */
  stream(userId: string, options: { heartbeatMs?: number; maxAgeMs?: number } = {}): Observable<NotificationStreamEvent> {
    const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
    const maxAgeMs = options.maxAgeMs ?? STREAM_MAX_AGE_MS;
    return new Observable<NotificationStreamEvent>((subscriber) => {
      this.attach(userId, subscriber);
      subscriber.next({ type: "hello", data: {} });
      const heartbeat = setInterval(() => subscriber.next({ type: "heartbeat", data: {} }), heartbeatMs);
      const expiry = setTimeout(() => subscriber.complete(), maxAgeMs);
      heartbeat.unref?.();
      expiry.unref?.();
      return () => {
        clearInterval(heartbeat);
        clearTimeout(expiry);
        this.detach(userId, subscriber);
      };
    });
  }

  /** How many bells are listening on this process (for tests and diagnostics). */
  openStreamCount(): number {
    let total = 0;
    for (const set of this.streams.values()) total += set.size;
    return total;
  }

  async onModuleDestroy(): Promise<void> {
    for (const set of this.streams.values()) for (const subscriber of [...set]) subscriber.complete();
    this.streams.clear();
    await this.closeSubscriber();
  }

  private attach(userId: string, subscriber: Subscriber<NotificationStreamEvent>): void {
    let set = this.streams.get(userId);
    if (!set) {
      set = new Set();
      this.streams.set(userId, set);
    }
    set.add(subscriber);
    while (set.size > MAX_STREAMS_PER_USER) {
      const oldest = set.values().next().value as Subscriber<NotificationStreamEvent>;
      set.delete(oldest);
      oldest.complete();
    }
    this.ensureSubscribed();
  }

  private detach(userId: string, subscriber: Subscriber<NotificationStreamEvent>): void {
    const set = this.streams.get(userId);
    if (!set) return;
    set.delete(subscriber);
    if (set.size === 0) this.streams.delete(userId);
    if (this.streams.size === 0) void this.closeSubscriber();
  }

  private ensureSubscribed(): void {
    if (this.subscriber) return;
    const subscriber = this.redis.duplicate();
    this.subscriber = subscriber;
    subscriber.on("message", (channel: string, userId: string) => {
      if (channel !== NOTIFICATION_CHANNEL) return;
      for (const open of this.streams.get(userId) ?? []) open.next({ type: "ping", data: {} });
    });
    subscriber.on("error", (error: Error) => this.logger.warn(`Notification subscriber error: ${error.message}`));
    subscriber.subscribe(NOTIFICATION_CHANNEL).catch((error: Error) => this.logger.warn(`Could not subscribe to notifications: ${error.message}`));
  }

  private async closeSubscriber(): Promise<void> {
    const subscriber = this.subscriber;
    this.subscriber = null;
    if (!subscriber) return;
    try {
      await subscriber.quit();
    } catch {
      subscriber.disconnect();
    }
  }
}
