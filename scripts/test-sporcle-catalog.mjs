import assert from 'node:assert/strict';
import { filterQuizzes, quizMatches, tagCounts, TYPE_LABELS } from '../sporcle-spinoff/engine/catalog.js';

const quizzes = [
  {
    id: 'capitals',
    title: 'World Capitals',
    type: 'text-entry',
    blurb: 'Name each capital city.',
    tags: ['Geography', 'World'],
  },
  {
    id: 'flags',
    title: 'Flags of the World',
    type: 'image',
    blurb: 'Identify the flag.',
    tags: ['Geography', 'Pictures'],
  },
  {
    id: 'oscars',
    title: 'Best Picture',
    type: 'multiple-choice',
    blurb: 'Pick the winning movie.',
    tags: ['Movies'],
  },
];

assert.equal(TYPE_LABELS['text-entry'], 'Type the Answer');
assert.equal(quizMatches(quizzes[0], { query: 'capital' }), true);
assert.equal(quizMatches(quizzes[0], { query: 'type the answer' }), true);
assert.equal(quizMatches(quizzes[0], { query: 'movies' }), false);
assert.deepEqual(filterQuizzes(quizzes, { type: 'image' }).map((quiz) => quiz.id), ['flags']);
assert.deepEqual(filterQuizzes(quizzes, { tag: 'geography' }).map((quiz) => quiz.id), ['capitals', 'flags']);
assert.deepEqual(filterQuizzes(quizzes, { query: 'world', type: 'image', tag: 'Geography' }).map((quiz) => quiz.id), ['flags']);
assert.deepEqual(tagCounts(quizzes).slice(0, 2), [
  { label: 'Geography', count: 2 },
  { label: 'Movies', count: 1 },
]);

console.log('sporcle catalog tests passed');
