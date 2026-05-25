import { DatabaseIdempotencyStore } from '../../src/common/guards/idempotency-store';

type MockFunction = jest.Mock;
type QueryBuilderMock = {
  where: MockFunction;
  forUpdate: MockFunction;
  first: MockFunction;
  insert: MockFunction;
  update: MockFunction;
  delete: MockFunction;
  [key: string]: unknown;
};

function createQueryBuilderMock(): QueryBuilderMock {
  const builder: Partial<QueryBuilderMock> = {};
  builder.where = jest.fn().mockReturnValue(builder);
  builder.forUpdate = jest.fn().mockReturnValue(builder);
  builder.first = jest.fn();
  builder.insert = jest.fn();
  builder.update = jest.fn();
  builder.delete = jest.fn();
  return builder as QueryBuilderMock;
}

function createTransactionMock(qb: QueryBuilderMock) {
  const trx = jest.fn() as MockFunction & { commit: MockFunction; rollback: MockFunction };
  trx.mockReturnValue(qb);
  trx.commit = jest.fn().mockResolvedValue(undefined);
  trx.rollback = jest.fn().mockResolvedValue(undefined);
  return trx;
}

function createDbMock(trx: MockFunction & { commit: MockFunction; rollback: MockFunction }) {
  const db = jest.fn() as MockFunction & { transaction: MockFunction; fn: { now: MockFunction } };
  db.transaction = jest.fn().mockResolvedValue(trx);
  db.fn = { now: jest.fn().mockReturnValue('NOW()') };
  return db;
}

function createDbForComplete(qb: QueryBuilderMock) {
  const db = jest.fn() as MockFunction & { transaction: MockFunction; fn: { now: MockFunction } };
  db.mockReturnValue(qb);
  db.transaction = jest.fn();
  db.fn = { now: jest.fn().mockReturnValue('NOW()') };
  return db;
}

describe('DatabaseIdempotencyStore', () => {
  let store: DatabaseIdempotencyStore;

  afterEach(async () => {
    jest.useRealTimers();
    if (store) {
      await store.dispose();
    }
  });

  describe('tryAcquire', () => {
    it('should return ACQUIRED when no existing key and insert succeeds', async () => {
      const qb = createQueryBuilderMock();
      qb.first.mockResolvedValue(undefined);
      qb.insert.mockResolvedValue(undefined);
      const trx = createTransactionMock(qb);
      const db = createDbMock(trx);

      store = new DatabaseIdempotencyStore(db as unknown as any, 60000);

      const result = await store.tryAcquire('key-new');

      expect(result).toEqual({ status: 'ACQUIRED' });
      expect(qb.where).toHaveBeenCalledWith({ idempotency_key: 'key-new' });
      expect(qb.forUpdate).toHaveBeenCalled();
      expect(qb.first).toHaveBeenCalledTimes(1);
      expect(qb.insert).toHaveBeenCalledWith({
        idempotency_key: 'key-new',
        created_at: 'NOW()',
      });
      expect(trx.commit).toHaveBeenCalled();
      expect(trx.rollback).not.toHaveBeenCalled();
    });

    it('should return COMPLETED when an existing completed key is found', async () => {
      const qb = createQueryBuilderMock();
      qb.first.mockResolvedValue({
        idempotency_key: 'key-completed',
        status_code: 200,
        response_body: JSON.stringify({ status: 'success', data: { balance: '100.00' } }),
        completed_at: new Date(),
      });
      const trx = createTransactionMock(qb);
      const db = createDbMock(trx);

      store = new DatabaseIdempotencyStore(db as unknown as any, 60000);

      const result = await store.tryAcquire('key-completed');

      expect(result).toEqual({
        status: 'COMPLETED',
        statusCode: 200,
        body: { status: 'success', data: { balance: '100.00' } },
      });
      expect(trx.commit).toHaveBeenCalled();
      expect(trx.rollback).not.toHaveBeenCalled();
    });

    it('should return COMPLETED with null body when response_body is corrupted', async () => {
      const qb = createQueryBuilderMock();
      qb.first.mockResolvedValue({
        idempotency_key: 'key-corrupted',
        status_code: 201,
        response_body: '{broken json',
        completed_at: new Date(),
      });
      const trx = createTransactionMock(qb);
      const db = createDbMock(trx);

      store = new DatabaseIdempotencyStore(db as unknown as any, 60000);

      const result = await store.tryAcquire('key-corrupted');

      expect(result).toEqual({
        status: 'COMPLETED',
        statusCode: 201,
        body: null,
      });
    });

    it('should return COMPLETED with null body when response_body is null', async () => {
      const qb = createQueryBuilderMock();
      qb.first.mockResolvedValue({
        idempotency_key: 'key-null-body',
        status_code: 204,
        response_body: null,
        completed_at: new Date(),
      });
      const trx = createTransactionMock(qb);
      const db = createDbMock(trx);

      store = new DatabaseIdempotencyStore(db as unknown as any, 60000);

      const result = await store.tryAcquire('key-null-body');

      expect(result).toEqual({
        status: 'COMPLETED',
        statusCode: 204,
        body: null,
      });
    });

    it('should return COMPLETED with default statusCode when status_code is null', async () => {
      const qb = createQueryBuilderMock();
      qb.first.mockResolvedValue({
        idempotency_key: 'key-no-status',
        status_code: null,
        response_body: null,
        completed_at: new Date(),
      });
      const trx = createTransactionMock(qb);
      const db = createDbMock(trx);

      store = new DatabaseIdempotencyStore(db as unknown as any, 60000);

      const result = await store.tryAcquire('key-no-status');

      expect(result).toEqual({
        status: 'COMPLETED',
        statusCode: 200,
        body: null,
      });
    });

    it('should return IN_FLIGHT when an existing in-flight key is found', async () => {
      const qb = createQueryBuilderMock();
      qb.first.mockResolvedValue({
        idempotency_key: 'key-in-flight',
        status_code: null,
        response_body: null,
        completed_at: null,
      });
      const trx = createTransactionMock(qb);
      const db = createDbMock(trx);

      store = new DatabaseIdempotencyStore(db as unknown as any, 60000);

      const result = await store.tryAcquire('key-in-flight');

      expect(result).toEqual({ status: 'IN_FLIGHT' });
      expect(trx.commit).toHaveBeenCalled();
    });

    it('should handle ER_DUP_ENTRY race condition and return COMPLETED when duplicate is completed', async () => {
      const qb = createQueryBuilderMock();
      qb.first
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          idempotency_key: 'key-race',
          status_code: 200,
          response_body: JSON.stringify({ status: 'success' }),
          completed_at: new Date(),
        });
      qb.insert.mockRejectedValue({ code: 'ER_DUP_ENTRY' });
      const trx = createTransactionMock(qb);
      const db = createDbMock(trx);

      store = new DatabaseIdempotencyStore(db as unknown as any, 60000);

      const result = await store.tryAcquire('key-race');

      expect(result).toEqual({
        status: 'COMPLETED',
        statusCode: 200,
        body: { status: 'success' },
      });
      expect(trx.commit).toHaveBeenCalled();
      expect(trx.rollback).not.toHaveBeenCalled();
    });

    it('should handle ER_DUP_ENTRY race condition and return IN_FLIGHT when duplicate is incomplete', async () => {
      const qb = createQueryBuilderMock();
      qb.first
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          idempotency_key: 'key-race-inflight',
          status_code: null,
          response_body: null,
          completed_at: null,
        });
      qb.insert.mockRejectedValue({ code: 'ER_DUP_ENTRY' });
      const trx = createTransactionMock(qb);
      const db = createDbMock(trx);

      store = new DatabaseIdempotencyStore(db as unknown as any, 60000);

      const result = await store.tryAcquire('key-race-inflight');

      expect(result).toEqual({ status: 'IN_FLIGHT' });
      expect(trx.commit).toHaveBeenCalled();
    });

    it('should re-throw non-ER_DUP_ENTRY insert errors', async () => {
      const qb = createQueryBuilderMock();
      qb.first.mockResolvedValue(undefined);
      qb.insert.mockRejectedValue(new Error('DB connection lost'));
      const trx = createTransactionMock(qb);
      const db = createDbMock(trx);

      store = new DatabaseIdempotencyStore(db as unknown as any, 60000);

      await expect(store.tryAcquire('key-error')).rejects.toThrow('DB connection lost');
      expect(trx.rollback).toHaveBeenCalled();
      expect(trx.commit).not.toHaveBeenCalled();
    });

    it('should rollback on unexpected errors', async () => {
      const qb = createQueryBuilderMock();
      qb.first.mockRejectedValue(new Error('Unexpected DB error'));
      const trx = createTransactionMock(qb);
      const db = createDbMock(trx);

      store = new DatabaseIdempotencyStore(db as unknown as any, 60000);

      await expect(store.tryAcquire('key-crash')).rejects.toThrow('Unexpected DB error');
      expect(trx.rollback).toHaveBeenCalled();
    });
  });

  describe('complete', () => {
    it('should update the idempotency key record with status and body', async () => {
      const qb = createQueryBuilderMock();
      qb.update.mockResolvedValue(undefined);
      const db = createDbForComplete(qb);

      store = new DatabaseIdempotencyStore(db as unknown as any, 60000);

      await store.complete('key-complete', 200, { status: 'success', data: { id: 1 } });

      expect(db).toHaveBeenCalledWith('idempotency_keys');
      expect(qb.where).toHaveBeenCalledWith({ idempotency_key: 'key-complete' });
      expect(qb.update).toHaveBeenCalledWith({
        status_code: 200,
        response_body: JSON.stringify({ status: 'success', data: { id: 1 } }),
        completed_at: 'NOW()',
      });
    });

    it('should handle completion with null body', async () => {
      const qb = createQueryBuilderMock();
      qb.update.mockResolvedValue(undefined);
      const db = createDbForComplete(qb);

      store = new DatabaseIdempotencyStore(db as unknown as any, 60000);

      await store.complete('key-null', 204, null);

      expect(qb.update).toHaveBeenCalledWith({
        status_code: 204,
        response_body: 'null',
        completed_at: 'NOW()',
      });
    });
  });

  describe('dispose', () => {
    it('should clear the cleanup timer', async () => {
      const qb = createQueryBuilderMock();
      const trx = createTransactionMock(qb);
      const db = createDbMock(trx);
      jest.useFakeTimers();

      store = new DatabaseIdempotencyStore(db as unknown as any, 60000);

      await store.dispose();

      expect(qb.delete).not.toHaveBeenCalled();

      jest.advanceTimersByTime(2 * 60 * 60 * 1000);
      expect(qb.delete).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('cleanup interval (integration-style)', () => {
    it('should delete expired keys on interval tick', async () => {
      const cleanupQb = createQueryBuilderMock();
      cleanupQb.delete.mockResolvedValue(undefined);
      cleanupQb.where = jest.fn().mockReturnValue(cleanupQb);

      const cleanupDb = jest.fn() as MockFunction & { transaction: MockFunction; fn: { now: MockFunction } };
      cleanupDb.mockReturnValue(cleanupQb);
      cleanupDb.transaction = jest.fn();
      cleanupDb.fn = { now: jest.fn().mockReturnValue('NOW()') };

      jest.useFakeTimers();

      const ttlMs = 24 * 60 * 60 * 1000;
      store = new DatabaseIdempotencyStore(cleanupDb as unknown as any, ttlMs);

      jest.advanceTimersByTime(60 * 60 * 1000);

      await Promise.resolve();
      await Promise.resolve();

      expect(cleanupQb.where).toHaveBeenCalled();
      expect(cleanupQb.delete).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });
});
