import crypto from 'crypto';

export interface IIdGenerator {
  generate(): string;
}

export class IdGenerator implements IIdGenerator {
  public generate(): string {
    return crypto.randomUUID();
  }
}

export const idGenerator = new IdGenerator();
