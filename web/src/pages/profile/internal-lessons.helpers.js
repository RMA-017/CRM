export function getInternalLessonCards(items, day) {
  const lessons = items.filter((item) => item.weekDays.includes(day));
  return [...lessons, ...Array.from({ length: Math.max(0, 5 - lessons.length) }, () => null)];
}

export function getInternalLessonDaySummary(items, day) {
  const lessons = items.filter((item) => item.weekDays.includes(day));
  return { total: lessons.length, completed: lessons.filter((item) => Boolean(item.completionByDay?.[day])).length };
}

export function toggleInternalLessonDay(days, day) {
  return (days.includes(day) ? days.filter((value) => value !== day) : [...days, day]).sort((a, b) => a - b);
}

export function changeInternalLessonFilter(current, field, value) {
  return { ...current, [field]: value, [field === "clientId" ? "specialistId" : "clientId"]: "", mode: field === "clientId" ? "client" : "specialist" };
}
