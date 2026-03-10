import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getInitial } from "../../lib/formatters.js";

const AVATAR_STORAGE_PREFIX = "crm_avatar_";

function isStorageQuotaExceeded(error) {
  if (!error) {
    return false;
  }
  const code = Number(error.code);
  return error.name === "QuotaExceededError"
    || error.name === "NS_ERROR_DOM_QUOTA_REACHED"
    || code === 22
    || code === 1014;
}

function removeStoredAvatarsExcept(currentKey = "") {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith(AVATAR_STORAGE_PREFIX) || key === currentKey) {
      continue;
    }
    localStorage.removeItem(key);
  }
}

function persistAvatarDataUrl(storageKey, dataUrl) {
  try {
    localStorage.setItem(storageKey, dataUrl);
    return true;
  } catch (error) {
    if (!isStorageQuotaExceeded(error)) {
      return false;
    }
  }

  try {
    removeStoredAvatarsExcept(storageKey);
    localStorage.setItem(storageKey, dataUrl);
    return true;
  } catch {
    return false;
  }
}

function getAvatarStorageKey({ username, organizationCode }) {
  const normalizedUsername = String(username || "").trim();
  const normalizedOrganizationCode = String(organizationCode || "").trim().toLowerCase();
  if (!normalizedUsername) {
    return "";
  }
  return normalizedOrganizationCode
    ? `${AVATAR_STORAGE_PREFIX}${normalizedOrganizationCode}_${normalizedUsername}`
    : `${AVATAR_STORAGE_PREFIX}${normalizedUsername}`;
}

export function useProfileAvatar({
  fullName,
  username,
  organizationCode
}) {
  const avatarInputRef = useRef(null);
  const [avatarDataUrl, setAvatarDataUrl] = useState("");

  const avatarFallback = useMemo(
    () => getInitial(fullName || username || "User"),
    [fullName, username]
  );

  const avatarStorageKey = useMemo(() => getAvatarStorageKey({
    username,
    organizationCode
  }), [organizationCode, username]);

  const openAvatarPicker = useCallback(() => {
    avatarInputRef.current?.click();
  }, []);

  const saveAvatarFromFile = useCallback((file) => {
    if (!file || !avatarStorageKey) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl) {
        return;
      }
      setAvatarDataUrl(dataUrl);
      const isStored = persistAvatarDataUrl(avatarStorageKey, dataUrl);
      if (!isStored) {
        window.alert("Avatar saqlash uchun browser xotirasi yetarli emas.");
      }
    };
    reader.readAsDataURL(file);
  }, [avatarStorageKey]);

  useEffect(() => {
    if (!avatarStorageKey) {
      setAvatarDataUrl("");
      return;
    }
    try {
      setAvatarDataUrl(localStorage.getItem(avatarStorageKey) || "");
    } catch {
      setAvatarDataUrl("");
    }
  }, [avatarStorageKey]);

  useEffect(() => {
    function preventFileDropNavigation(event) {
      event.preventDefault();
      event.stopPropagation();
    }

    function handleDrop(event) {
      preventFileDropNavigation(event);
      const file = event.dataTransfer?.files?.[0];
      if (file) {
        saveAvatarFromFile(file);
      }
    }

    const events = ["dragenter", "dragover", "drop"];
    events.forEach((eventName) => {
      window.addEventListener(eventName, preventFileDropNavigation, true);
      document.addEventListener(eventName, preventFileDropNavigation, true);
    });
    window.addEventListener("drop", handleDrop, true);

    return () => {
      events.forEach((eventName) => {
        window.removeEventListener(eventName, preventFileDropNavigation, true);
        document.removeEventListener(eventName, preventFileDropNavigation, true);
      });
      window.removeEventListener("drop", handleDrop, true);
    };
  }, [saveAvatarFromFile]);

  return {
    avatarDataUrl,
    avatarFallback,
    avatarInputRef,
    openAvatarPicker,
    saveAvatarFromFile
  };
}
