// One display order for structured CRM names. Never guess parts of free-form names.
export function formatPersonName(person) {
  return [person?.firstName ?? person?.first_name ?? person?.clientFirstName ?? person?.client_first_name,
    person?.lastName ?? person?.last_name ?? person?.clientLastName ?? person?.client_last_name,
    person?.middleName ?? person?.middle_name ?? person?.clientMiddleName ?? person?.client_middle_name]
    .map((part) => String(part || "").trim()).filter(Boolean).join(" ");
}
