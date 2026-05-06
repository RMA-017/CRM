import pool from "../../config/db.js";

export const SITE_CONTENT_SECTIONS = Object.freeze(["kids", "team", "partners"]);

function valueOrFallback(value, fallback = "") {
  return value || fallback || "";
}

function mapSiteContentItem(row) {
  const authorUz = valueOrFallback(row.author_uz, row.author);
  const authorRu = valueOrFallback(row.author_ru, authorUz);
  const nameUz = valueOrFallback(row.name_uz, row.name);
  const nameRu = valueOrFallback(row.name_ru, nameUz);
  const roleUz = valueOrFallback(row.role_uz, row.role);
  const roleRu = valueOrFallback(row.role_ru, roleUz);
  const descriptionUz = valueOrFallback(row.description_uz, row.description);
  const descriptionRu = valueOrFallback(row.description_ru, descriptionUz);

  return {
    id: String(row.id),
    sectionKey: row.section_key,
    image: row.image_data,
    author: authorUz,
    authorUz,
    authorRu,
    name: nameUz,
    nameUz,
    nameRu,
    role: roleUz,
    roleUz,
    roleRu,
    description: descriptionUz,
    descriptionUz,
    descriptionRu,
    sortOrder: Number(row.sort_order || 0),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function groupSiteContentItems(items = []) {
  const grouped = {
    kids: [],
    team: [],
    partners: []
  };

  items.forEach((item) => {
    const sectionKey = SITE_CONTENT_SECTIONS.includes(item?.sectionKey) ? item.sectionKey : "";
    if (sectionKey) {
      grouped[sectionKey].push(item);
    }
  });

  return grouped;
}

export async function listPublicSiteContentItems() {
  const { rows } = await pool.query(
    `SELECT
       sci.id,
       sci.section_key,
       sci.image_data,
       sci.author,
       sci.author_uz,
       sci.author_ru,
       sci.name,
       sci.name_uz,
       sci.name_ru,
       sci.role,
       sci.role_uz,
       sci.role_ru,
       sci.description,
       sci.description_uz,
       sci.description_ru,
       sci.sort_order,
       sci.is_active,
       sci.created_at,
       sci.updated_at
     FROM site_content_items sci
     JOIN organizations o ON o.id = sci.organization_id
    WHERE sci.is_active = TRUE
      AND o.is_active = TRUE
    ORDER BY sci.section_key ASC, sci.sort_order ASC, sci.created_at DESC, sci.id DESC`
  );

  return rows.map(mapSiteContentItem);
}

export async function listSiteContentItemsByOrganization(organizationId) {
  const { rows } = await pool.query(
    `SELECT
       id,
       section_key,
       image_data,
       author,
       author_uz,
       author_ru,
       name,
       name_uz,
       name_ru,
       role,
       role_uz,
       role_ru,
       description,
       description_uz,
       description_ru,
       sort_order,
       is_active,
       created_at,
       updated_at
     FROM site_content_items
    WHERE organization_id = $1
    ORDER BY section_key ASC, sort_order ASC, created_at DESC, id DESC`,
    [organizationId]
  );

  return rows.map(mapSiteContentItem);
}

export async function createSiteContentItem({
  organizationId,
  sectionKey,
  image,
  author = null,
  authorUz = null,
  authorRu = null,
  name = null,
  nameUz = null,
  nameRu = null,
  role = null,
  roleUz = null,
  roleRu = null,
  description,
  descriptionUz,
  descriptionRu,
  actorUserId = null
}) {
  const { rows } = await pool.query(
    `INSERT INTO site_content_items (
       organization_id,
       section_key,
       image_data,
       author,
       author_uz,
       author_ru,
       name,
       name_uz,
       name_ru,
       role,
       role_uz,
       role_ru,
       description,
       description_uz,
       description_ru,
       created_by,
       updated_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16)
     RETURNING
       id,
       section_key,
       image_data,
       author,
       author_uz,
       author_ru,
       name,
       name_uz,
       name_ru,
       role,
       role_uz,
       role_ru,
       description,
       description_uz,
       description_ru,
       sort_order,
       is_active,
       created_at,
       updated_at`,
    [
      organizationId,
      sectionKey,
      image,
      author,
      authorUz,
      authorRu,
      name,
      nameUz,
      nameRu,
      role,
      roleUz,
      roleRu,
      description,
      descriptionUz,
      descriptionRu,
      actorUserId
    ]
  );

  return rows[0] ? mapSiteContentItem(rows[0]) : null;
}

export async function updateSiteContentItem({
  id,
  organizationId,
  sectionKey,
  image,
  author = null,
  authorUz = null,
  authorRu = null,
  name = null,
  nameUz = null,
  nameRu = null,
  role = null,
  roleUz = null,
  roleRu = null,
  description,
  descriptionUz,
  descriptionRu,
  actorUserId = null
}) {
  const { rows } = await pool.query(
    `UPDATE site_content_items
        SET section_key = $3,
            image_data = $4,
            author = $5,
            author_uz = $6,
            author_ru = $7,
            name = $8,
            name_uz = $9,
            name_ru = $10,
            role = $11,
            role_uz = $12,
            role_ru = $13,
            description = $14,
            description_uz = $15,
            description_ru = $16,
            updated_by = $17,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
        AND organization_id = $2
      RETURNING
        id,
        section_key,
        image_data,
        author,
        author_uz,
        author_ru,
        name,
        name_uz,
        name_ru,
        role,
        role_uz,
        role_ru,
        description,
        description_uz,
        description_ru,
        sort_order,
        is_active,
        created_at,
        updated_at`,
    [
      id,
      organizationId,
      sectionKey,
      image,
      author,
      authorUz,
      authorRu,
      name,
      nameUz,
      nameRu,
      role,
      roleUz,
      roleRu,
      description,
      descriptionUz,
      descriptionRu,
      actorUserId
    ]
  );

  return rows[0] ? mapSiteContentItem(rows[0]) : null;
}

export async function deleteSiteContentItem({ id, organizationId }) {
  const result = await pool.query(
    `DELETE FROM site_content_items
      WHERE id = $1
        AND organization_id = $2`,
    [id, organizationId]
  );

  return result.rowCount > 0;
}
