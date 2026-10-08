import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildDayStats,
  buildFormatStats,
  buildHabitStats,
  buildTheaterStats,
  buildValueStats,
} from '../amc-a-lister/engine/statistics.js';

const watches = [
  {
    watched_on: '2026-08-15',
    title: 'One',
    tmdb_id: 1,
    location: 'AMC Lincoln Square 13',
    format: 'IMAX',
    ticket_cents: 2599,
    rating: 4.5,
    dnf: false,
    saw_alone: true,
    runtime_min: 120,
  },
  {
    watched_on: '2026-08-16',
    title: 'Two',
    tmdb_id: 2,
    location: 'amc lincoln  square 13',
    format: 'IMAX',
    ticket_cents: 3001,
    rating: 3.5,
    dnf: false,
    saw_alone: false,
    runtime_min: 90,
  },
  {
    watched_on: '2026-08-17',
    title: 'One',
    tmdb_id: 1,
    location: 'AMC Empire 25',
    format: '',
    ticket_cents: null,
    rating: null,
    dnf: true,
    saw_alone: false,
    runtime_min: null,
  },
  {
    watched_on: '2026-08-18',
    title: 'Home movie',
    location: 'N/A - Home',
    format: '',
    ticket_cents: 0,
    rating: 5,
    dnf: false,
    saw_alone: true,
    runtime_min: 60,
  },
];

const theaters = buildTheaterStats(watches);
assert.equal(theaters.length, 2);
assert.equal(theaters[0].count, 2);
assert.equal(theaters[0].avgTicket, 2800);
assert.equal(theaters[0].avgRating, 4);
assert.equal(theaters[1].avgTicket, null);

const formats = buildFormatStats(watches);
assert.equal(formats[0].format, 'IMAX');
assert.equal(formats[0].count, 2);
assert.equal(formats[0].share, 0.5);
assert.equal(formats[1].format, 'Standard');
assert.equal(formats[1].pricedCount, 1);

const days = buildDayStats(watches);
assert.equal(days.length, 4);
assert.equal(days.find((day) => day.day === 'Saturday').avgRating, 4.5);
assert.equal(days.find((day) => day.day === 'Monday').avgRating, null);

const habits = buildHabitStats(watches);
assert.equal(habits.totalRuntimeMin, 270);
assert.equal(habits.runtimeCount, 3);
assert.equal(habits.soloCount, 2);
assert.equal(habits.weekendCount, 2);
assert.equal(habits.uniqueTitles, 3);
assert.equal(habits.repeatScreenings, 1);

const value = buildValueStats({
  byMonth: [
    { month: '2026-08-01', movies: 3, savings: 4000 },
    { month: '2026-07-01', movies: 1, savings: -500 },
    { month: '2026-06-01', movies: 0, savings: -2999 },
  ],
});
assert.equal(value.positiveMonths, 1);
assert.equal(value.activeMonths, 2);
assert.equal(value.avgVisitsPerActiveMonth, 2);
assert.equal(value.bestMonth.month, '2026-08-01');

const statsCss = readFileSync(new URL('../amc-a-lister/engine/app.css', import.meta.url), 'utf8');
const primaryRule = statsCss.slice(
  statsCss.indexOf('.al-stats-table .al-card-primary {'),
  statsCss.indexOf('.al-stats-table .al-card-primary .al-hover-target'),
);
assert.match(primaryRule, /overflow-wrap:\s*break-word/);
assert.doesNotMatch(primaryRule, /overflow-wrap:\s*anywhere/);
assert.match(statsCss, /\.al-stats-table:not\(\.al-stats-table--rewatch\) \.al-card-primary \{\s*width:\s*100%;/);
const rewatchDates = statsCss.slice(
  statsCss.indexOf('.al-stats-table--rewatch th:nth-child(3)'),
  statsCss.indexOf('.al-insight .al-rank-table'),
);
assert.match(rewatchDates, /overflow-wrap:\s*break-word/);
assert.doesNotMatch(rewatchDates, /overflow-wrap:\s*anywhere/);

console.log('A-Lister statistics tests passed');
