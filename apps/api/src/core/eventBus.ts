// In-process domain event bus.
//
// Modules publish typed domain events and subscribe to neighbors' events. Today
// this is a synchronous in-memory dispatcher; when a module is extracted into
// its own service, this is the single seam you replace with NATS/RabbitMQ —
// publishers and subscribers keep the same call shape.

import type {
  Equipment,
  Finance,
  People,
  Projects,
} from "@sever/contracts";

export type DomainEvent =
  | Equipment.EquipmentEvent
  | Projects.ProjectsEvent
  | Finance.FinanceEvent
  | People.PeopleEvent;

export type EventType = DomainEvent["type"];
export type EventOf<T extends EventType> = Extract<DomainEvent, { type: T }>;

type Handler<T extends EventType> = (event: EventOf<T>) => void | Promise<void>;
type AnyHandler = (event: DomainEvent) => void | Promise<void>;

export class EventBus {
  private handlers = new Map<EventType, AnyHandler[]>();
  private log: DomainEvent[] = [];

  on<T extends EventType>(type: T, handler: Handler<T>): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler as AnyHandler);
    this.handlers.set(type, list);
  }

  async publish(event: DomainEvent): Promise<void> {
    this.log.push(event);
    const list = this.handlers.get(event.type) ?? [];
    // Subscribers run sequentially; a failing subscriber must not break the
    // publisher's own transaction, which already committed before publish.
    for (const handler of list) {
      try {
        await handler(event);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[eventBus] handler for ${event.type} failed:`, err);
      }
    }
  }

  /** For tests/diagnostics: events seen so far. */
  history(): readonly DomainEvent[] {
    return this.log;
  }
}
