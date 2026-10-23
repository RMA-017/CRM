export function getInternalLessonCards(items, day) {
  const lessons = items.filter((item) => item.weekDays.includes(day));
  return [...lessons, ...Array.from({ length: Math.max(0, 5 - lessons.length) }, () => null)];
}

export function toggleInternalLessonDay(days, day) {
  return (days.includes(day) ? days.filter((value) => value !== day) : [...days, day]).sort((a, b) => a - b);
}

export function changeInternalLessonFilter(current, field, value) {
  const next = { ...current, [field]: value };
  const primaryField = current.mode === "specialist" ? "specialistId" : "clientId";
  if (!current.clientId && !current.specialistId) next.mode = field === "clientId" ? "client" : "specialist";
  else if (field === primaryField && !value) next.mode = next.clientId ? "client" : "specialist";
  return next;
}
