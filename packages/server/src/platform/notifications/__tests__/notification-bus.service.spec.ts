import { EventEmitter } from "node:events";
import {
  HEARTBEAT_MS,
  MAX_STREAMS_PER_USER,
  NOTIFICATION_CHANNEL,
  NotificationBusService,
  PUBLISH_DELAY_MS,
  STREAM_MAX_AGE_MS,
  type NotificationStreamEvent,
} from "../application/notification-bus.service";

const A = "u0000000-0000-4000-8000-00000000000a";
const B = "u0000000-0000-4000-8000-00000000000b";

class FakeSubscriber extends EventEmitter {
  subscribe = jest.fn(async () => 1);
  quit = jest.fn(async () => "OK");
  disconnect = jest.fn();
}

/** A Redis whose publish() reaches every subscriber made by duplicate(), like the real thing across processes. */
function fakeRedis() {
  const subscribers: FakeSubscriber[] = [];
  const redis = {
    publish: jest.fn(async (channel: string, message: string) => {
      for (const subscriber of subscribers) subscriber.emit("message", channel, message);
      return subscribers.length;
    }),
    duplicate: jest.fn(() => {
      const subscriber = new FakeSubscriber();
      subscribers.push(subscriber);
      return subscriber;
    }),
  };
  return { redis, subscribers };
}

function listen(bus: NotificationBusService, userId: string, options?: { heartbeatMs?: number; maxAgeMs?: number }) {
  const events: NotificationStreamEvent["type"][] = [];
  let completed = false;
  const subscription = bus.stream(userId, options).subscribe({ next: (event) => events.push(event.type), complete: () => (completed = true) });
  return { events, isCompleted: () => completed, close: () => subscription.unsubscribe() };
}

describe("NotificationBusService", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("greets a new stream with `hello` at once", () => {
    const { redis } = fakeRedis();
    const bus = new NotificationBusService(redis as never);
    const stream = listen(bus, A);
    expect(stream.events).toEqual(["hello"]);
    stream.close();
  });

  it("delivers a hint to the user it is for, and only to that user (also across processes, through Redis)", async () => {
    const { redis } = fakeRedis();
    const bus = new NotificationBusService(redis as never);
    const a = listen(bus, A);
    const b = listen(bus, B);

    await bus.publish([A]);

    expect(redis.publish).toHaveBeenCalledWith(NOTIFICATION_CHANNEL, A);
    expect(a.events).toEqual(["hello", "ping"]);
    expect(b.events).toEqual(["hello"]);
    a.close();
    b.close();
  });

  it("delivers to every open tab of the same user", async () => {
    const { redis } = fakeRedis();
    const bus = new NotificationBusService(redis as never);
    const tab1 = listen(bus, A);
    const tab2 = listen(bus, A);
    await bus.publish([A]);
    expect(tab1.events).toEqual(["hello", "ping"]);
    expect(tab2.events).toEqual(["hello", "ping"]);
    tab1.close();
    tab2.close();
  });

  it("uses ONE Redis subscription however many streams are open, and closes it with the last stream", () => {
    const { redis, subscribers } = fakeRedis();
    const bus = new NotificationBusService(redis as never);
    const one = listen(bus, A);
    const two = listen(bus, B);
    expect(redis.duplicate).toHaveBeenCalledTimes(1);
    expect(subscribers[0].subscribe).toHaveBeenCalledWith(NOTIFICATION_CHANNEL);
    expect(bus.openStreamCount()).toBe(2);

    one.close();
    expect(subscribers[0].quit).not.toHaveBeenCalled();
    two.close();
    expect(subscribers[0].quit).toHaveBeenCalledTimes(1);
    expect(bus.openStreamCount()).toBe(0);
  });

  it("stops hinting a stream once it is closed", async () => {
    const { redis } = fakeRedis();
    const bus = new NotificationBusService(redis as never);
    const keep = listen(bus, B);
    const gone = listen(bus, A);
    gone.close();
    await bus.publish([A]);
    expect(gone.events).toEqual(["hello"]);
    keep.close();
  });

  it("sends a heartbeat while quiet, so a proxy does not close the connection as idle", () => {
    const { redis } = fakeRedis();
    const bus = new NotificationBusService(redis as never);
    const stream = listen(bus, A);
    jest.advanceTimersByTime(HEARTBEAT_MS * 2 + 10);
    expect(stream.events).toEqual(["hello", "heartbeat", "heartbeat"]);
    stream.close();
  });

  it("closes the stream after its maximum age (shorter than the access token), so the client reconnects with a fresh token", () => {
    expect(STREAM_MAX_AGE_MS).toBeLessThan(15 * 60_000);
    const { redis } = fakeRedis();
    const bus = new NotificationBusService(redis as never);
    const stream = listen(bus, A, { maxAgeMs: 1000 });
    expect(stream.isCompleted()).toBe(false);
    jest.advanceTimersByTime(1001);
    expect(stream.isCompleted()).toBe(true);
    expect(bus.openStreamCount()).toBe(0);
  });

  it(`never keeps more than ${MAX_STREAMS_PER_USER} streams per user: the oldest is closed`, () => {
    const { redis } = fakeRedis();
    const bus = new NotificationBusService(redis as never);
    const streams = Array.from({ length: MAX_STREAMS_PER_USER + 1 }, () => listen(bus, A));
    expect(streams[0].isCompleted()).toBe(true);
    expect(streams.slice(1).every((stream) => !stream.isCompleted())).toBe(true);
    expect(bus.openStreamCount()).toBe(MAX_STREAMS_PER_USER);
    streams.forEach((stream) => stream.close());
  });

  it("publishSoon waits for the writer's transaction to commit before hinting", async () => {
    const { redis } = fakeRedis();
    const bus = new NotificationBusService(redis as never);
    const stream = listen(bus, A);

    bus.publishSoon([A, A]);
    expect(redis.publish).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(PUBLISH_DELAY_MS + 5);
    expect(redis.publish).toHaveBeenCalledTimes(1); // de-duplicated
    expect(stream.events).toEqual(["hello", "ping"]);
    stream.close();
  });

  it("publishSoon with nobody to tell does nothing", async () => {
    const { redis } = fakeRedis();
    const bus = new NotificationBusService(redis as never);
    bus.publishSoon([]);
    await jest.advanceTimersByTimeAsync(PUBLISH_DELAY_MS + 5);
    expect(redis.publish).not.toHaveBeenCalled();
  });

  it("a Redis failure while hinting is logged and never thrown", async () => {
    const { redis } = fakeRedis();
    redis.publish.mockRejectedValueOnce(new Error("redis down"));
    const bus = new NotificationBusService(redis as never);
    await expect(bus.publish([A])).resolves.toBeUndefined();
  });

  it("shutting down completes every open stream and closes the Redis subscription", async () => {
    const { redis, subscribers } = fakeRedis();
    const bus = new NotificationBusService(redis as never);
    const a = listen(bus, A);
    const b = listen(bus, B);
    await bus.onModuleDestroy();
    expect(a.isCompleted() && b.isCompleted()).toBe(true);
    expect(subscribers[0].quit).toHaveBeenCalled();
  });
});
