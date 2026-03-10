let profilePagePromise;

export function loadProfilePage() {
  if (!profilePagePromise) {
    profilePagePromise = import("../pages/ProfilePage.jsx");
  }
  return profilePagePromise;
}
