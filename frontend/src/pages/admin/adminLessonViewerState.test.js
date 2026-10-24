import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminLessonViewerController,
  lessonAttachmentPath,
  lessonDetailPath,
} from "./adminLessonViewerState.js";
import * as adminLessonViewerState from "./adminLessonViewerState.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test("lesson viewer loads the exact admin-authorized library detail and supports retry", async () => {
  const states = [];
  const calls = [];
  const controller = createAdminLessonViewerController({
    request: async (path) => { calls.push(path); return { lesson: { id: 25, title: "Loops" } }; },
    setDetail: (value) => states.push(value),
  });

  await controller.open({ id: 25, contentType: "lesson", title: "Loops" });
  await controller.retry();

  assert.deepEqual(calls, ["/api/teacher/lesson-library/25", "/api/teacher/lesson-library/25"]);
  assert.equal(states[0].status, "loading");
  assert.equal(states.at(-1).status, "success");
  assert.equal(states.at(-1).lesson.id, 25);
  assert.equal(lessonDetailPath(25), "/api/teacher/lesson-library/25");
  assert.equal(lessonAttachmentPath(9), "/api/lesson-content/classroom-files/9");
});

test("switching lessons fences late success, error, and completion updates", async () => {
  const first = deferred();
  const second = deferred();
  const states = [];
  const controller = createAdminLessonViewerController({
    request: (path) => path.endsWith("/1") ? first.promise : second.promise,
    setDetail: (value) => states.push(value),
  });

  const openFirst = controller.open({ id: 1, contentType: "lesson", title: "First" });
  const openSecond = controller.open({ id: 2, contentType: "lesson", title: "Second" });
  first.reject(Object.assign(new Error("late failure"), { response: { data: { message: "Late failure" } } }));
  await openFirst;
  assert.equal(states.at(-1).sourceItem.id, 2);
  assert.equal(states.at(-1).status, "loading");

  second.resolve({ lesson: { id: 2, title: "Second" } });
  await openSecond;
  assert.equal(states.at(-1).lesson.id, 2);
  assert.equal(states.some((state) => state.error === "Late failure"), false);
});

test("closing and disposing fence pending responses and restore focus only on close", async () => {
  const pending = deferred();
  const states = [];
  let restored = 0;
  const focusSession = { begin() {}, end() { restored += 1; } };
  const controller = createAdminLessonViewerController({
    request: () => pending.promise,
    setDetail: (value) => states.push(value),
    focusSession,
  });

  const opening = controller.open({ id: 3, contentType: "lesson", title: "Third" }, {});
  controller.close();
  pending.resolve({ lesson: { id: 3, title: "Third" } });
  await opening;
  assert.equal(states.at(-1), null);
  assert.equal(restored, 1);

  const pendingAfterUnmount = deferred();
  const unmountedStates = [];
  const unmounted = createAdminLessonViewerController({ request: () => pendingAfterUnmount.promise, setDetail: (value) => unmountedStates.push(value) });
  const unmountedOpen = unmounted.open({ id: 4, contentType: "lesson", title: "Fourth" });
  unmounted.dispose();
  pendingAfterUnmount.reject(new Error("late unmount error"));
  await unmountedOpen;
  assert.equal(unmountedStates.length, 1);
});

test("lesson viewer restores a connected opener on close but clears focus ownership during navigation", async () => {
  const firstOpener = { isConnected: true, focusCount: 0, focus() { this.focusCount += 1; } };
  const nextOpener = { isConnected: true, focusCount: 0, focus() { this.focusCount += 1; } };
  const removedOpener = { isConnected: false, focusCount: 0, focus() { this.focusCount += 1; } };
  const controller = createAdminLessonViewerController({
    request: async (path) => ({ lesson: { id: Number(path.split("/").at(-1)), title: "Lesson" } }),
    setDetail() {},
  });

  await controller.open({ id: 31, contentType: "lesson" }, firstOpener);
  controller.close({ restoreFocus: false });
  assert.equal(firstOpener.focusCount, 0);

  await controller.open({ id: 32, contentType: "lesson" }, nextOpener);
  controller.close();
  assert.equal(nextOpener.focusCount, 1);

  await controller.open({ id: 33, contentType: "lesson" }, removedOpener);
  controller.close();
  assert.equal(removedOpener.focusCount, 0);
});

const createDownloadHarness = (request) => {
  const errors = [];
  const loading = [];
  const createdUrls = [];
  const revokedUrls = [];
  const links = [];
  const controller = adminLessonViewerState.createAdminLessonDownloadController({
    request,
    setError: (value) => errors.push(value),
    setLoading: (value) => loading.push(value),
    createObjectUrl: (blob) => { createdUrls.push(blob); return `blob:test-${createdUrls.length}`; },
    revokeObjectUrl: (url) => revokedUrls.push(url),
    createLink: () => {
      const link = {
        href: "",
        download: "",
        clicked: 0,
        removed: 0,
        click() { this.clicked += 1; },
      };
      links.push(link);
      return link;
    },
    attachLink: (link) => { link.attached = true; },
    removeLink: (link) => { link.attached = false; link.removed += 1; },
  });
  return { controller, errors, loading, createdUrls, revokedUrls, links };
};

test("lesson download view changes fence late success and failure, including completion state", async () => {
  assert.equal(typeof adminLessonViewerState.createAdminLessonDownloadController, "function");
  for (const outcome of ["success", "failure"]) {
    const pending = deferred();
    let signal;
    const harness = createDownloadHarness((_path, options) => { signal = options.signal; return pending.promise; });
    const downloading = harness.controller.download({ id: 71, originalName: "lesson.pdf", available: true });
    assert.equal(harness.loading.at(-1), true);

    harness.controller.invalidate();
    assert.equal(signal.aborted, true);
    assert.equal(harness.loading.at(-1), false);
    const stateCountAfterViewChange = harness.loading.length;
    if (outcome === "success") pending.resolve(new Blob(["late bytes"]));
    else pending.reject(new Error("late failure"));
    assert.equal(await downloading, false);

    assert.equal(harness.createdUrls.length, 0);
    assert.equal(harness.links.length, 0);
    assert.deepEqual(harness.errors, [""]);
    assert.equal(harness.loading.length, stateCountAfterViewChange);
  }
});

test("lesson download disposal fences late success and failure without post-unmount state writes", async () => {
  for (const outcome of ["success", "failure"]) {
    const pending = deferred();
    let signal;
    const harness = createDownloadHarness((_path, options) => { signal = options.signal; return pending.promise; });
    const downloading = harness.controller.download({ id: 72, originalName: "lesson.pdf", available: true });
    const errorCount = harness.errors.length;
    const loadingCount = harness.loading.length;

    harness.controller.dispose();
    assert.equal(signal.aborted, true);
    if (outcome === "success") pending.resolve(new Blob(["late bytes"]));
    else pending.reject(new Error("late failure"));
    assert.equal(await downloading, false);

    assert.equal(harness.createdUrls.length, 0);
    assert.equal(harness.links.length, 0);
    assert.equal(harness.errors.length, errorCount);
    assert.equal(harness.loading.length, loadingCount);
  }
});

test("closing and switching lessons invalidate pending downloads", async () => {
  for (const transition of ["close", "switch lesson"]) {
    const pending = deferred();
    const harness = createDownloadHarness(() => pending.promise);
    const downloading = harness.controller.download({ id: 73, originalName: "old.pdf", available: true });
    harness.controller.invalidate(transition);
    pending.resolve(new Blob(["old lesson bytes"]));
    assert.equal(await downloading, false);
    assert.equal(harness.links.length, 0);
  }
});

test("successful lesson downloads use the authenticated result filename and clean temporary DOM resources", async () => {
  const requested = [];
  const lessonBlob = new Blob(["lesson bytes"]);
  const harness = createDownloadHarness(async (path, options) => {
    requested.push({ path, signal: options.signal });
    return lessonBlob;
  });

  assert.equal(await harness.controller.download({ id: 74, originalName: "arrays.pdf", available: true }), true);
  assert.equal(requested[0].path, "/api/lesson-content/classroom-files/74");
  assert.equal(requested[0].signal.aborted, false);
  assert.deepEqual(harness.createdUrls, [lessonBlob]);
  assert.equal(harness.links[0].href, "blob:test-1");
  assert.equal(harness.links[0].download, "arrays.pdf");
  assert.equal(harness.links[0].clicked, 1);
  assert.equal(harness.links[0].removed, 1);
  assert.deepEqual(harness.revokedUrls, ["blob:test-1"]);
  assert.deepEqual(harness.errors, [""]);
  assert.deepEqual(harness.loading, [true, false]);
});

test("download exceptions after object URL creation still remove links and revoke URLs", async () => {
  const harness = createDownloadHarness(async () => new Blob(["lesson bytes"]));
  harness.controller = adminLessonViewerState.createAdminLessonDownloadController({
    request: async () => new Blob(["lesson bytes"]),
    setError: (value) => harness.errors.push(value),
    setLoading: (value) => harness.loading.push(value),
    createObjectUrl: () => "blob:throws",
    revokeObjectUrl: (url) => harness.revokedUrls.push(url),
    createLink: () => {
      const link = { href: "", download: "", attached: false, click() { throw new Error("click failed"); } };
      harness.links.push(link);
      return link;
    },
    attachLink: (link) => { link.attached = true; },
    removeLink: (link) => { link.attached = false; link.removed = true; },
  });

  assert.equal(await harness.controller.download({ id: 75, originalName: "throws.pdf", available: true }), false);
  assert.equal(harness.links[0].removed, true);
  assert.equal(harness.links[0].attached, false);
  assert.deepEqual(harness.revokedUrls, ["blob:throws"]);
  assert.equal(harness.errors.at(-1), "This file is no longer available. The lesson details remain open.");
  assert.equal(harness.loading.at(-1), false);
});

test("stale downloads cannot overwrite the current download state", async () => {
  const first = deferred();
  const second = deferred();
  const harness = createDownloadHarness((path) => path.endsWith("/76") ? first.promise : second.promise);
  const firstDownload = harness.controller.download({ id: 76, originalName: "old.pdf", available: true });
  const secondDownload = harness.controller.download({ id: 77, originalName: "current.pdf", available: true });
  const stateCountAfterSecondStarted = harness.loading.length;

  first.reject(new Error("stale failure"));
  assert.equal(await firstDownload, false);
  assert.equal(harness.loading.length, stateCountAfterSecondStarted);
  assert.deepEqual(harness.errors, ["", ""]);

  second.resolve(new Blob(["current bytes"]));
  assert.equal(await secondDownload, true);
  assert.equal(harness.links.length, 1);
  assert.equal(harness.links[0].download, "current.pdf");
  assert.equal(harness.loading.at(-1), false);
});
