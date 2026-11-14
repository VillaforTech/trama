import test from 'node:test';
import assert from 'node:assert/strict';
import { abrirBase } from '../src/storage.js';
import { crearPedido } from '../src/crear-pedido.js';
import { procesarEvento, procesarPendiente } from '../src/worker.js';

test('three units create a 750-cent order and one pending event', () => {
  const db = abrirBase(':memory:');
  try {
    const pedido = crearPedido(db, 3);
    assert.equal(pedido.importeCentavos, 750);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM outbox WHERE procesado = 0').get().n, 1);
  } finally {
    db.close();
  }
});

test('invalid quantities leave no state', () => {
  const db = abrirBase(':memory:');
  try {
    for (const units of [0, 101, 1.5, '3', null]) {
      assert.throws(() => crearPedido(db, units), RangeError);
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pedidos').get().n, 0);
  } finally {
    db.close();
  }
});

test('a failed outbox insert rolls the order back', () => {
  const db = abrirBase(':memory:');
  try {
    db.exec("CREATE TRIGGER fail_outbox BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    assert.throws(() => crearPedido(db, 3), /test failure/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pedidos').get().n, 0);
  } finally {
    db.close();
  }
});

test('a failed movement can be retried and a redelivery creates no duplicate', () => {
  const db = abrirBase(':memory:');
  try {
    crearPedido(db, 3);
    const event = db.prepare('SELECT id FROM outbox').get();
    db.exec("CREATE TRIGGER fail_movement BEFORE INSERT ON movimientos BEGIN SELECT RAISE(ABORT, 'test failure'); END");
    assert.throws(() => procesarPendiente(db), /test failure/);
    assert.equal(db.prepare('SELECT procesado FROM outbox').get().procesado, 0);
    db.exec('DROP TRIGGER fail_movement');
    assert.equal(procesarEvento(db, event.id), true);
    assert.equal(procesarEvento(db, event.id), false);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM movimientos').get().n, 1);
  } finally {
    db.close();
  }
});

test('two successful HTTP intents are separate orders', () => {
  const db = abrirBase(':memory:');
  try {
    crearPedido(db, 3);
    crearPedido(db, 3);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pedidos').get().n, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM outbox').get().n, 2);
  } finally {
    db.close();
  }
});
