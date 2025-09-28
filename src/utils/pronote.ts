import { createSessionHandle, loginCredentials, SessionHandle, gradebook, timetableFromIntervals, assignmentsFromIntervals, AccountKind, gradesOverview } from 'pawnote';
import { Averages, Grades, Homeworks, Timetable } from '../types';
import { Account, config } from './config';
import { hashGrade, hashHomework } from './hashing';
import { SubjectNames } from './locale';

const caches = {
  sessions: new Map<string, SessionHandle>(),
  grades: new Map<string, Grades>(),
  timetable: new Map<string, Timetable>(),
  homeworks: new Map<string, Homeworks>(),
  averages: new Map<string, Averages>(),
};

// Deleting cache entry 30 seconds before refresh
const cacheTtl = config.refreshEvery - 30 * 1000;

function getCurrentMonday() {
  const currentMonday = new Date();
  currentMonday.setDate(currentMonday.getDate() - currentMonday.getDay() + 1);
  currentMonday.setHours(1, 0, 0, 0);

  return currentMonday;
}

export async function getSession(
  account: Account
): Promise<SessionHandle> {
  const cached = caches.sessions.get(account.username);
  if (cached) return cached;

  const session = createSessionHandle();
  await loginCredentials(session, {
    url: account.url,
    username: account.username,
    password: account.password,
    kind: AccountKind.STUDENT,
    deviceUUID: 'smartpronote-' + Math.random().toString(36).substring(7)
  });

  // Note: pawnote doesn't have explicit keepalive/logout methods
  setTimeout(() => {
    // Session will expire naturally
  }, config.accountTimeout);

  caches.sessions.set(account.username, session);
  setTimeout(
    () => caches.sessions.delete(account.username),
    // Deleting cache 2 minutes before account keepalive expiration
    config.accountTimeout - 2 * 60 * 1000
  );

  return session;
}

export async function getGrades(
  username: string,
  session: SessionHandle
): Promise<Grades> {
  const cached = caches.grades.get(username);
  if (cached) return cached;

  const raw = await gradebook(session, { 
    name: 'current', 
    id: '1', 
    kind: 0, 
    startDate: new Date(new Date().getFullYear(), 8, 1), // September 1st
    endDate: new Date(new Date().getFullYear() + 1, 5, 30) // June 30th next year
  }).catch(() => null);
  const grades: Grades = [];

  for (const subject of raw?.subjects ?? []) {
    for (const mark of subject.grades ?? []) {
      const grade = {
        subject: SubjectNames[subject.name] ?? subject.name,
        average: mark.average || 0,
        coefficient: mark.coefficient || 1,
        comment: mark.comment || '',
        date: mark.date || new Date(),
        best: mark.max || 20,
        worst: mark.min || 0,
        scale: mark.scale || 20,
        value: mark.value || 0,
      };

      grades.push({ ...grade, hash: hashGrade(grade) });
    }
  }

  if (raw) {
    // Don't add to cache if request went wrong
    caches.grades.set(username, grades);
    setTimeout(() => caches.grades.delete(username), cacheTtl);
  }

  return grades;
}

export async function getTimetable(
  username: string,
  session: SessionHandle
): Promise<Timetable> {
  const cached = caches.timetable.get(username);
  if (cached) return cached;

  const currentMonday = getCurrentMonday();

  const currentFriday = new Date(
    // We add 5 days so people that have lessons on saturday can see it
    currentMonday.getTime() + 5 * 24 * 3600 * 1000
  );

  const raw = await timetableFromIntervals(session, currentMonday, currentFriday)
    .catch(() => null);
  const timetable: Timetable =
    raw?.map((v) => ({
      from: v.start,
      room: v.classroom || '',
      subject: SubjectNames[v.subject?.name] ?? v.subject?.name ?? '',
      teacher: v.teacher?.name || '',
      to: v.end,
      absent: v.isCancelled || false,
      cancelled: v.isCancelled || false,
    })) ?? [];

  if (raw) {
    caches.timetable.set(username, timetable);
    setTimeout(() => caches.timetable.delete(username), cacheTtl);
  }

  return timetable;
}

export async function getHomeworks(
  username: string,
  session: SessionHandle
): Promise<Homeworks> {
  const cached = caches.homeworks.get(username);
  if (cached) return cached;

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  yesterday.setHours(0, 0);
  const farAwayInTime = new Date(
    // 150 days in the future
    yesterday.getTime() + 151 * 24 * 3600 * 1000
  );
  const raw = await assignmentsFromIntervals(session, yesterday, farAwayInTime)
    .catch(() => null);

  const homeworks: Homeworks =
    raw?.map((v) => {
      const homework = {
        content: v.description || '',
        due: new Date(v.date.getTime() + 3 * 60 * 60 * 1000), // We add 3 hours because a homework is always for the day before its due at 11PM
        files: v.attachments?.map((f) => ({ name: f.name, url: f.url })) || [],
        givenAt: v.givenAt || new Date(),
        subject: SubjectNames[v.subject?.name] ?? v.subject?.name ?? '',
        done: v.done || false,
      };

      return { ...homework, hash: hashHomework(homework) };
    }) ?? [];

  if (raw) {
    caches.homeworks.set(username, homeworks);
    setTimeout(() => caches.homeworks.delete(username), cacheTtl);
  }

  return homeworks;
}

export async function getAverages(
  username: string,
  session: SessionHandle
): Promise<Averages> {
  const cached = caches.averages.get(username);
  if (cached) return cached;

  const raw = await gradesOverview(session, { 
    name: 'current', 
    id: '1', 
    kind: 0, 
    startDate: new Date(new Date().getFullYear(), 8, 1), // September 1st
    endDate: new Date(new Date().getFullYear() + 1, 5, 30) // June 30th next year
  }).catch(() => null);

  const averages: Averages = {
    value: raw?.studentAverage?.value ?? 0,
    everyone: raw?.classAverage?.value ?? 0,
  };

  if (raw) {
    caches.averages.set(username, averages);
    setTimeout(() => caches.averages.delete(username), cacheTtl);
  }

  return averages;
}
