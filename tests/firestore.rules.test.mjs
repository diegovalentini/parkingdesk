import {
  after,
  before,
  beforeEach,
  describe,
  test,
} from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = 'parkingdesk-rules-test';
const LOT_A = 'playa-a';
const LOT_B = 'playa-b';

let testEnvironment;

function getEmulatorAddress() {
  const address =
    process.env.FIRESTORE_EMULATOR_HOST ||
    '127.0.0.1:8080';

  const separator = address.lastIndexOf(':');

  return {
    host: address.slice(0, separator),
    port: Number(address.slice(separator + 1)),
  };
}

function authenticatedDb(uid) {
  return testEnvironment
    .authenticatedContext(uid)
    .firestore();
}

function unauthenticatedDb() {
  return testEnvironment
    .unauthenticatedContext()
    .firestore();
}

async function seedTestData() {
  await testEnvironment.withSecurityRulesDisabled(
    async (context) => {
      const database = context.firestore();

      const users = [
        ['viewer-a', 'viewer', LOT_A],
        ['user-a', 'user', LOT_A],
        ['admin-a', 'admin', LOT_A],
        ['admin-b', 'admin', LOT_B],
        ['platform', 'platform_admin', null],
      ];

      const userWrites = users.map(
        ([uid, role, parkingLotId]) =>
          setDoc(doc(database, 'users', uid), {
            uid,
            username: uid,
            role,
            parkingLotId,
            active: true,
          })
      );

      const parkingLotWrites = [LOT_A, LOT_B].flatMap(
        (parkingLotId) => [
          setDoc(
            doc(database, 'parkingLots', parkingLotId),
            {
              name: parkingLotId,
              active: true,
            }
          ),
          setDoc(
            doc(
              database,
              'parkingLots',
              parkingLotId,
              'settings',
              'config'
            ),
            {
              autoCount: 1,
              motoCount: 0,
            }
          ),
          setDoc(
            doc(
              database,
              'parkingLots',
              parkingLotId,
              'spots',
              '1'
            ),
            {
              id: '1',
              type: 'auto',
              occupied: false,
              blocked: false,
            }
          ),
          setDoc(
            doc(
              database,
              'parkingLots',
              parkingLotId,
              'blacklist',
              'aa111aa'
            ),
            {
              plate: 'AA111AA',
              active: true,
            }
          ),
          setDoc(
            doc(
              database,
              'parkingLots',
              parkingLotId,
              'logs',
              'log-1'
            ),
            {
              spotId: '1',
              occupantName: 'AA111AA',
              startTimestamp: 1000,
              endTimestamp: 2000,
              amount: 100,
              payMethod: 'EFECTIVO',
            }
          ),
        ]
      );

      await Promise.all([
        ...userWrites,
        ...parkingLotWrites,
      ]);
    }
  );
}

describe(
  'Reglas multi-playa de ParkingDesk',
  { concurrency: false },
  () => {
    before(async () => {
      const rules = await readFile(
        new URL('../firestore.rules', import.meta.url),
        'utf8'
      );

      const { host, port } = getEmulatorAddress();

      testEnvironment = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
          host,
          port,
          rules,
        },
      });
    });

    beforeEach(async () => {
      await testEnvironment.clearFirestore();
      await seedTestData();
    });

    after(async () => {
      await testEnvironment.cleanup();
    });

    test('rechaza usuarios sin autenticar', async () => {
      const database = unauthenticatedDb();

      await assertFails(
        getDoc(
          doc(
            database,
            'parkingLots',
            LOT_A,
            'spots',
            '1'
          )
        )
      );
    });

    test('viewer solo puede leer recursos no financieros de su playa', async () => {
      const database = authenticatedDb('viewer-a');

      await assertSucceeds(
        getDoc(
          doc(database, 'parkingLots', LOT_A, 'spots', '1')
        )
      );
      await assertSucceeds(
        getDoc(
          doc(
            database,
            'parkingLots',
            LOT_A,
            'settings',
            'config'
          )
        )
      );
      await assertSucceeds(
        getDoc(
          doc(
            database,
            'parkingLots',
            LOT_A,
            'blacklist',
            'aa111aa'
          )
        )
      );
      await assertFails(
        getDoc(
          doc(database, 'parkingLots', LOT_A, 'logs', 'log-1')
        )
      );
      await assertFails(
        updateDoc(
          doc(database, 'parkingLots', LOT_A, 'spots', '1'),
          { occupied: true }
        )
      );
    });

    test('user opera y crea logs solamente en su playa', async () => {
      const database = authenticatedDb('user-a');

      await assertSucceeds(
        updateDoc(
          doc(database, 'parkingLots', LOT_A, 'spots', '1'),
          { occupied: true }
        )
      );
      await assertSucceeds(
        setDoc(
          doc(database, 'parkingLots', LOT_A, 'logs', 'log-new'),
          {
            spotId: '1',
            amount: 200,
            payMethod: 'MP',
          }
        )
      );
      await assertFails(
        updateDoc(
          doc(database, 'parkingLots', LOT_B, 'spots', '1'),
          { occupied: true }
        )
      );
    });

    test('user solo corrige el método de pago con auditoría válida', async () => {
      const database = authenticatedDb('user-a');
      const logReference = doc(
        database,
        'parkingLots',
        LOT_A,
        'logs',
        'log-1'
      );

      await assertSucceeds(
        updateDoc(logReference, {
          payMethod: 'MP',
          updatedAt: serverTimestamp(),
          editedBy: 'user-a',
          editedByUid: 'user-a',
        })
      );

      await assertFails(
        updateDoc(logReference, {
          amount: 999,
        })
      );
    });

    test('admin administra su playa y no puede operar otra', async () => {
      const database = authenticatedDb('admin-a');

      await assertSucceeds(
        updateDoc(
          doc(
            database,
            'parkingLots',
            LOT_A,
            'settings',
            'config'
          ),
          { autoCount: 2 }
        )
      );
      await assertSucceeds(
        updateDoc(
          doc(database, 'parkingLots', LOT_A, 'logs', 'log-1'),
          { amount: 300 }
        )
      );
      await assertFails(
        updateDoc(
          doc(
            database,
            'parkingLots',
            LOT_B,
            'settings',
            'config'
          ),
          { autoCount: 2 }
        )
      );
      await assertFails(
        updateDoc(doc(database, 'users', 'admin-b'), {
          role: 'viewer',
          updatedAt: serverTimestamp(),
          updatedByUid: 'admin-a',
        })
      );
    });

    test('admin administra usuarios sin moverlos de playa', async () => {
      const database = authenticatedDb('admin-a');
      const userReference = doc(database, 'users', 'user-a');

      await assertSucceeds(
        updateDoc(userReference, {
          role: 'viewer',
          updatedAt: serverTimestamp(),
          updatedByUid: 'admin-a',
        })
      );

      await assertFails(
        updateDoc(userReference, {
          parkingLotId: LOT_B,
          updatedAt: serverTimestamp(),
          updatedByUid: 'admin-a',
        })
      );
    });

    test('platform_admin administra recursos de cualquier playa', async () => {
      const database = authenticatedDb('platform');

      await assertSucceeds(
        setDoc(
          doc(
            database,
            'parkingLots',
            LOT_B,
            'blacklist',
            'bb222bb'
          ),
          {
            plate: 'BB222BB',
            active: true,
          }
        )
      );
      await assertSucceeds(
        updateDoc(
          doc(
            database,
            'parkingLots',
            LOT_B,
            'settings',
            'config'
          ),
          { autoCount: 3 }
        )
      );
      await assertSucceeds(
        setDoc(
          doc(database, 'parkingLots', LOT_B, 'spots', '2'),
          {
            id: '2',
            type: 'auto',
            occupied: false,
          }
        )
      );
      await assertSucceeds(
        updateDoc(
          doc(database, 'parkingLots', LOT_B, 'logs', 'log-1'),
          { amount: 500 }
        )
      );
      await assertSucceeds(
        deleteDoc(
          doc(database, 'parkingLots', LOT_B, 'logs', 'log-1')
        )
      );
      await assertSucceeds(
        updateDoc(doc(database, 'users', 'admin-b'), {
          role: 'viewer',
        })
      );
    });

    test('nadie puede crear perfiles directamente en Firestore', async () => {
      const platformDatabase = authenticatedDb('platform');

      await assertFails(
        setDoc(doc(platformDatabase, 'users', 'new-user'), {
          username: 'Nuevo usuario',
          role: 'viewer',
          parkingLotId: LOT_A,
          active: true,
        })
      );
    });
  }
);
