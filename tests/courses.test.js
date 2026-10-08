import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COURSES_BY_LEVEL, isCourseForLevel } from '../src/courses.js';

const rulesPath = fileURLToPath(new URL('../firestore.rules', import.meta.url));
const rules = readFileSync(rulesPath, 'utf8');

test('توجد أربعة مستويات وقوائم المواد المطلوبة', () => {
  assert.deepEqual(Object.keys(COURSES_BY_LEVEL), ['1', '2', '3', '4']);
  assert.deepEqual(Object.fromEntries(Object.entries(COURSES_BY_LEVEL).map(([level, courses]) => [level, courses.length])), {
    '1': 13, '2': 12, '3': 12, '4': 13
  });
});

test('كل مقرر غير فارغ ولا يتكرر داخل المستوى نفسه', () => {
  for (const courses of Object.values(COURSES_BY_LEVEL)) {
    assert.ok(courses.every(course => course.trim() === course && course.length > 0));
    assert.equal(new Set(courses).size, courses.length);
  }
});

test('اختيار المقرر مرتبط بالمستوى الصحيح', () => {
  assert.equal(isCourseForLevel('1', 'مصطلح الحديث'), true);
  assert.equal(isCourseForLevel('2', 'مصطلح الحديث'), false);
  assert.equal(isCourseForLevel('4', 'مناهج البحث'), true);
  assert.equal(isCourseForLevel('5', 'مناهج البحث'), false);
});

test('قواعد Firestore تفرض القوائم نفسها لكل مستوى', () => {
  for (const [level, courses] of Object.entries(COURSES_BY_LEVEL)) {
    const match = rules.match(new RegExp(`levelValue == '${level}'\\s*&&\\s*courseValue in \\[([^\\]]+)\\]`));
    assert.ok(match, `قاعدة المستوى ${level} غير موجودة`);
    const ruleCourses = [...match[1].matchAll(/'([^']*)'/g)].map(item => item[1]);
    assert.deepEqual(ruleCourses, courses, `اختلاف بين الواجهة والقواعد في المستوى ${level}`);
  }
});
