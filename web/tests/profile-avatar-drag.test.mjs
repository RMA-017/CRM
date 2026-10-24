import assert from "node:assert/strict";
import test from "node:test";
import { isAvatarFileDrag } from "../src/pages/profile/useProfileAvatar.js";

test("avatar file protection ignores internal schedule drags and accepts actual file drops", () => {
  assert.equal(isAvatarFileDrag({ dataTransfer: { types: ["text/plain"], files: [] } }), false);
  assert.equal(isAvatarFileDrag({ dataTransfer: { types: ["application/x-appointment"], files: [] } }), false);
  assert.equal(isAvatarFileDrag({}), false);
  assert.equal(isAvatarFileDrag({ dataTransfer: { types: ["Files"], files: [] } }), true);
  assert.equal(isAvatarFileDrag({ dataTransfer: { types: [], files: [{}] } }), true);
});
