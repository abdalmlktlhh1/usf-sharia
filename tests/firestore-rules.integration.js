import test from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const projectId = 'demo-usf-sharia';

test('Firestore permits safe student onboarding and rejects invalid profile changes', async () => {
  const environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules }
  });

  try {
    const studentDb = environment.authenticatedContext('student-1', { email: 'student1@gmail.com' }).firestore();
    const studentRef = doc(studentDb, 'users', 'student-1');
    const now = new Date();

    await assertSucceeds(setDoc(studentRef, {
      name: 'طالب اختبار',
      email: 'student1@gmail.com',
      phone: '',
      role: 'student',
      level: '',
      course: '',
      profileComplete: false,
      active: true,
      createdAt: now,
      updatedAt: now
    }));

    await assertSucceeds(updateDoc(studentRef, {
      level: '1',
      course: 'مصطلح الحديث',
      profileComplete: true,
      updatedAt: new Date()
    }));

    await assertFails(updateDoc(studentRef, {
      role: 'owner',
      updatedAt: new Date()
    }));

    await assertFails(updateDoc(studentRef, {
      level: '2',
      course: 'مصطلح الحديث',
      updatedAt: new Date()
    }));

    const invalidDb = environment.authenticatedContext('student-2', { email: 'student2@gmail.com' }).firestore();
    await assertFails(setDoc(doc(invalidDb, 'users', 'student-2'), {
      name: 'طالب اختبار ثانٍ',
      email: 'student2@gmail.com',
      phone: '',
      role: 'student',
      level: '1',
      course: 'قانون العقوبات',
      profileComplete: true,
      active: true,
      createdAt: now,
      updatedAt: now
    }));

    const googleDb = environment.authenticatedContext('student-google', { email: 'student-google@gmail.com' }).firestore();
    await assertSucceeds(setDoc(doc(googleDb, 'users', 'student-google'), {
      name: 'طالب Google',
      email: 'student-google@gmail.com',
      phone: '',
      role: 'student',
      level: '4',
      course: 'مناهج البحث',
      profileComplete: true,
      active: true,
      createdAt: now,
      updatedAt: now
    }));
  } finally {
    await environment.cleanup();
  }
});
