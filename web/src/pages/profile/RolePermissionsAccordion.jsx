import { useEffect, useMemo, useRef, useState } from "react";
import {
  normalizePermissionCodesInput,
  normalizePermissionCodesWithTree,
  togglePermissionCode,
  togglePermissionCodes
} from "./profile.helpers.js";

function RolePermissionCheckbox({
  id,
  checked,
  indeterminate = false,
  onChange
}) {
  const checkboxRef = useRef(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={checkboxRef}
      id={id}
      type="checkbox"
      checked={checked}
      onChange={onChange}
    />
  );
}


function RolePermissionTreeNode({
  node,
  level,
  idPrefix,
  selectedCodeSet,
  expandedKeys,
  onToggleExpand,
  onToggleSingleCode,
  onToggleGroupCodes
}) {
  if (!node || typeof node !== "object") {
    return null;
  }

  if (node.type === "permission") {
    const inputId = `${idPrefix}_${node.key.replace(/[^a-z0-9_-]/gi, "_")}`;
    return (
      <label
        key={node.key}
        className={`settings-permission-item role-permission-leaf role-permission-level-${level}`}
        htmlFor={inputId}
      >
        <RolePermissionCheckbox
          id={inputId}
          checked={selectedCodeSet.has(node.code)}
          onChange={(event) => {
            onToggleSingleCode(node.code, event.currentTarget.checked);
          }}
        />
        <span>{node.label}</span>
        {node.isShared ? (
          <small className="role-permission-shared-tag">shared</small>
        ) : null}
      </label>
    );
  }

  const descendantCodes = Array.isArray(node.descendantCodes) ? node.descendantCodes : [];
  const selectedCount = descendantCodes.filter((code) => selectedCodeSet.has(code)).length;
  const isChecked = descendantCodes.length > 0 && selectedCount === descendantCodes.length;
  const isIndeterminate = selectedCount > 0 && selectedCount < descendantCodes.length;
  const isExpanded = expandedKeys.has(node.key);
  const inputId = `${idPrefix}_${node.key.replace(/[^a-z0-9_-]/gi, "_")}`;
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;

  return (
    <section
      key={node.key}
      className={`settings-permission-group role-permission-node role-permission-level-${level}`}
    >
      <div className="org-feature-accordion-header role-permission-node-header">
        <label className="settings-permission-item role-permission-node-label" htmlFor={inputId}>
          <RolePermissionCheckbox
            id={inputId}
            checked={isChecked}
            indeterminate={isIndeterminate}
            onChange={(event) => {
              onToggleGroupCodes(descendantCodes, event.currentTarget.checked);
            }}
          />
          <span className="role-permission-node-text">{node.label}</span>
          {hasChildren ? (
            <small className="role-permission-node-count">{`${selectedCount}/${descendantCodes.length}`}</small>
          ) : null}
        </label>
        {hasChildren ? (
          <button
            type="button"
            className="org-feature-accordion-toggle role-permission-node-toggle"
            aria-expanded={isExpanded}
            onClick={() => onToggleExpand(node.key)}
          >
            {isExpanded ? "▲" : "▼"}
          </button>
        ) : null}
      </div>

      {hasChildren && isExpanded ? (
        <div className={`org-feature-accordion-children role-permission-node-children role-permission-level-${level + 1}`}>
          {node.children.map((child) => (
            <RolePermissionTreeNode
              key={child.key}
              node={child}
              level={level + 1}
              idPrefix={idPrefix}
              selectedCodeSet={selectedCodeSet}
              expandedKeys={expandedKeys}
              onToggleExpand={onToggleExpand}
              onToggleSingleCode={onToggleSingleCode}
              onToggleGroupCodes={onToggleGroupCodes}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function RolePermissionsAccordion({
  tree,
  selectedCodes,
  onChange,
  open = false,
  idPrefix = "rolePermissionTree",
  title = "Permissions"
}) {
  const selectedCodeSet = useMemo(
    () => new Set(normalizePermissionCodesInput(selectedCodes)),
    [selectedCodes]
  );
  const wasOpenRef = useRef(open);
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());

  useEffect(() => {
    const openedNow = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (openedNow) {
      setExpandedKeys(new Set());
    }
  }, [open, tree]);

  if (!Array.isArray(tree) || tree.length === 0) {
    return <p className="all-users-state">No permissions found.</p>;
  }

  return (
    <div className="settings-permissions-section role-permissions-accordion">
      <p className="settings-permissions-title">{title}</p>
      <div className="settings-permission-groups role-permissions-tree">
        {tree.map((node) => (
          <RolePermissionTreeNode
            key={node.key}
            node={node}
            level={0}
            idPrefix={idPrefix}
            selectedCodeSet={selectedCodeSet}
            expandedKeys={expandedKeys}
            onToggleExpand={(key) => {
              setExpandedKeys((prev) => {
                const next = new Set(prev);
                if (next.has(key)) {
                  next.delete(key);
                } else {
                  next.add(key);
                }
                return next;
              });
            }}
            onToggleSingleCode={(code, checked) => {
              onChange((prevCodes) => normalizePermissionCodesWithTree(
                togglePermissionCode(prevCodes, code, checked),
                tree
              ));
            }}
            onToggleGroupCodes={(codes, checked) => {
              onChange((prevCodes) => normalizePermissionCodesWithTree(
                togglePermissionCodes(prevCodes, codes, checked),
                tree
              ));
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default RolePermissionsAccordion;
